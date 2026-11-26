"""The paper strategy: one simulated bid and one simulated ask around the mid.

PAPER ONLY. This module has no network code at all: it is given market events
and the time, and it reports what it simulated through emit(kind, row). There
is no exchange client, no credentials and no way to send an order from here.
"""
import math
import os
import sys
import time

_here = os.path.dirname(os.path.abspath(__file__))
for _p in (_here, os.path.dirname(_here)):
    if os.path.isdir(os.path.join(_p, '_components')) and _p not in sys.path:
        sys.path.insert(0, _p)
from _components.paper_book import Position, through_fill

TICK = 0.01             # BTC-USD price step
MIN_SIZE = 1e-8


def day_of(ns):
    return time.strftime('%Y-%m-%d', time.gmtime(ns // 10**9))


class Engine:
    def __init__(self, cfg, emit, state=None, now_ns=0):
        self.cfg, self.emit = cfg, emit         # cfg() -> settings; emit(kind, row)
        st = state or {}
        self.pos = Position.from_dict(st.get('pos'))
        self.day = st.get('day')
        self.day_start = float(st.get('day_start', 0.0))
        self.fills_today = int(st.get('fills_today', 0))
        self.volume_today = float(st.get('volume_today', 0.0))
        self.stop = st.get('stop')              # None | {reason, by, t_ns}
        self.seen = dict({'stop_at': 0, 'resume_at': 0, 'risk_ns': 0}, **st.get('seen', {}))
        self.last_mid = st.get('last_mid')
        self.seq = int(st.get('seq', 0))
        self.pending_flatten = bool(st.get('pending_flatten'))
        self.book = None
        self.exch_ns = 0                        # exchange time of the latest market event
        self.feed_ns = 0                        # local time of the latest BTC-USD event
        self.connected = False
        self.paused, self.feed_why = True, 'waiting for the first quote'
        self.quotes = {'buy': None, 'sell': None}
        self.since_ns = now_ns

    # ---- what is kept across a restart
    def state(self):
        return {'pos': self.pos.as_dict(), 'day': self.day, 'day_start': self.day_start,
                'fills_today': self.fills_today, 'volume_today': self.volume_today,
                'stop': self.stop, 'seen': self.seen, 'last_mid': self.last_mid,
                'seq': self.seq, 'pending_flatten': self.pending_flatten}

    @property
    def mid(self):
        if self.book:
            return (self.book['bid'] + self.book['ask']) / 2
        return self.last_mid

    def day_pnl(self):
        return self.pos.total(self.mid) - self.day_start

    def _row(self, now_ns, **kw):
        return dict({'local_ns': now_ns, 'exch_ns': self.exch_ns}, **kw)

    def _event(self, now_ns, what, **kw):
        self.emit('event', self._row(now_ns, type=what, **kw))

    # ---- market events
    def on_quote(self, ev, now_ns):
        try:
            bid, ask = float(ev['bid']), float(ev['ask'])
        except (KeyError, TypeError, ValueError):
            return
        if not 0 < bid < ask:
            return
        self.book = {'bid': bid, 'ask': ask, 'local_ns': now_ns}
        self.exch_ns = ev.get('exch_ns') or self.exch_ns
        self.last_mid = (bid + ask) / 2
        self.roll_day(now_ns)
        if now_ns - (ev.get('recv_ns') or now_ns) > self.cfg()['stale_s'] * 1e9:
            return                              # an old quote (a snapshot after a gap): not fresh
        self.feed_ns, self.connected = now_ns, True
        if self.paused:
            self.paused, self.feed_why = False, ''
            self._event(now_ns, 'feed_ok')
        if self.stop:
            if self.pending_flatten:
                self._flatten(now_ns)
            return
        if not self._limits(now_ns):
            self._requote(now_ns)

    def on_trade(self, ev, now_ns):
        self.exch_ns = ev.get('exch_ns') or self.exch_ns
        self.feed_ns = now_ns
        if self.stop or self.paused:
            return
        for side in ('buy', 'sell'):
            q = self.quotes[side]
            if not q:
                continue
            try:
                n = through_fill(side, q['price'], q['left'], ev['price'], ev['size'])
            except (KeyError, TypeError, ValueError):
                return
            if n:
                q['left'] = round(q['left'] - n, 8)
                if q['left'] <= MIN_SIZE:
                    self.quotes[side] = None
                self._fill(side, q['price'], n, now_ns, 'through', q['id'], ev)
        self._limits(now_ns)

    def on_status(self, ev, now_ns):
        if ev.get('state') == 'connected':
            self.connected = True
        else:
            self.connected = False
            self._pause(str(ev.get('reason') or 'the feed is disconnected')[:200], now_ns)

    # ---- once a second
    def on_timer(self, now_ns, risk=None):
        self.roll_day(now_ns)
        s = self.cfg()
        if s['stop_at'] > self.seen['stop_at']:
            self.seen['stop_at'] = s['stop_at']
            if s['stop_at'] > s['resume_at']:
                self.halt('stopped by you', 'person', now_ns)
        if s['resume_at'] > self.seen['resume_at']:
            self.seen['resume_at'] = s['resume_at']
            if s['resume_at'] >= s['stop_at']:
                self.resume('person', now_ns)
        try:
            t = int(risk.get('t_ns', 0)) if risk else 0
        except (TypeError, ValueError, AttributeError):
            t = 0
        if t > self.seen['risk_ns']:
            self.seen['risk_ns'] = t
            if risk.get('stop'):
                self.halt('Risk Monitor: ' + str(risk.get('reason') or 'stop')[:200], 'risk', now_ns)
            elif self.stop and self.stop['by'] == 'risk':
                self.resume('risk', now_ns)
        age = (now_ns - self.feed_ns) / 1e9 if self.feed_ns else None
        if not self.paused and (not self.connected or age is None or age > s['stale_s']):
            self._pause(f'no BTC-USD message for {age:.0f} s' if age is not None else 'no feed', now_ns)
        self._limits(now_ns)

    def roll_day(self, now_ns):
        d = day_of(now_ns)
        if self.day is None:
            self.day, self.day_start = d, self.pos.total(self.mid)
        elif d != self.day:
            self.day, self.day_start = d, self.pos.total(self.mid)
            self.fills_today, self.volume_today = 0, 0.0
            self._event(now_ns, 'day', day=d, day_start=round(self.day_start, 6))
            if self.stop and self.stop['by'] != 'person':
                self.resume('new UTC day', now_ns)

    # ---- stop, flatten, resume
    def halt(self, reason, by, now_ns):
        if self.stop:
            if by == 'person':
                self.stop.update(by=by, reason=reason)
            self._event(now_ns, 'stop', by=by, reason=reason, already=True)
            return
        for side in ('buy', 'sell'):
            self._cancel(side, 'stop', now_ns)
        self.stop = {'reason': reason, 'by': by, 't_ns': now_ns}
        self.since_ns = now_ns
        self._event(now_ns, 'stop', by=by, reason=reason)
        self.pending_flatten = True
        self._flatten(now_ns)

    def _flatten(self, now_ns):
        """A simulated fill at the far touch: sell at the bid, buy at the ask."""
        if abs(self.pos.qty) <= MIN_SIZE:
            self.pending_flatten = False
            return
        if not self.book:
            return                              # no book seen yet: done on the first quote
        side = 'sell' if self.pos.qty > 0 else 'buy'
        price = self.book['bid'] if side == 'sell' else self.book['ask']
        age = round((now_ns - self.book['local_ns']) / 1e9, 3)
        self.pending_flatten = False
        self._fill(side, price, abs(self.pos.qty), now_ns, 'flatten', book_age_s=age)

    def resume(self, by, now_ns):
        if not self.stop:
            return
        self.stop, self.pending_flatten, self.since_ns = None, False, now_ns
        self._event(now_ns, 'resume', by=by)

    def _pause(self, why, now_ns):
        self.feed_why = why
        if self.paused:
            return
        self.paused, self.since_ns = True, now_ns
        for side in ('buy', 'sell'):
            self._cancel(side, 'feed stale', now_ns)
        self._event(now_ns, 'feed_stale', reason=why)

    def _limits(self, now_ns):
        """True when stopped (the day's loss limit stops it here)."""
        lim = self.cfg()['daily_loss_limit']
        if not self.stop and lim > 0 and self.day_pnl() <= -lim:
            self.halt(f'day loss limit reached: {self.day_pnl():.2f} USD against a limit of {lim:g} USD',
                      'loss', now_ns)
        return bool(self.stop)

    # ---- quotes and fills (all simulated)
    def _requote(self, now_ns):
        s, bid, ask = self.cfg(), self.book['bid'], self.book['ask']
        mid, cap = (bid + ask) / 2, s['max_position']
        lean = max(-1.0, min(1.0, self.pos.qty / cap)) if cap > 0 else 0.0
        centre = mid - mid * s['skew_bps'] / 1e4 * lean       # long: both quotes lower
        half = mid * s['half_spread_bps'] / 1e4
        tb = min(math.floor((centre - half) / TICK + 1e-9) * TICK, ask - TICK)   # never crosses the book
        ta = max(math.ceil((centre + half) / TICK - 1e-9) * TICK, bid + TICK)
        if ta <= tb:
            ta = tb + TICK
        want = {'buy': (round(tb, 2), min(s['quote_size'], cap - self.pos.qty)),
                'sell': (round(ta, 2), min(s['quote_size'], cap + self.pos.qty))}
        move = mid * s['requote_bps'] / 1e4
        for side, (price, size) in want.items():
            q, size = self.quotes[side], round(size, 8)
            if size <= MIN_SIZE:                 # this side would go past the position limit
                self._cancel(side, 'position limit', now_ns)
                continue
            if q and (abs(q['price'] - price) > move + 1e-9 or q['left'] > size + MIN_SIZE):
                self._cancel(side, 'requote', now_ns)
                q = None
            if not q:
                self.seq += 1
                self.quotes[side] = {'id': self.seq, 'price': price, 'size': size, 'left': size}
                self.emit('quote', self._row(now_ns, type='quote', id=self.seq, side=side, price=price,
                                             size=size, mid=round(mid, 3), bid=bid, ask=ask))

    def _cancel(self, side, reason, now_ns):
        q, self.quotes[side] = self.quotes[side], None
        if q:
            self.emit('cancel', self._row(now_ns, type='cancel', id=q['id'], side=side, price=q['price'],
                                          left=q['left'], reason=reason))

    def _fill(self, side, price, size, now_ns, reason, quote_id=None, ev=None, **extra):
        pnl = self.pos.fill(side, price, size)
        self.seq += 1
        self.fills_today += 1
        self.volume_today = round(self.volume_today + size, 8)
        row = self._row(now_ns, type='fill', id=self.seq, side=side, price=price, size=size, reason=reason,
                        quote_id=quote_id, fill_pnl=round(pnl, 6), position=self.pos.qty,
                        avg_price=round(self.pos.avg, 6), realised=round(self.pos.realised, 6),
                        mid=round(self.mid, 3) if self.mid else None, day=self.day,
                        day_pnl=round(self.day_pnl(), 6), **extra)
        if ev:
            row.update(recv_ns=ev.get('recv_ns'), trade_id=ev.get('trade_id'), trade_price=ev.get('price'),
                       trade_size=ev.get('size'), maker_side=ev.get('maker_side'))
        self.emit('fill', row)

    # ---- what the heartbeat, the log and the page show
    def snapshot(self, now_ns):
        mid, q = self.mid, self.quotes
        state = 'stopped' if self.stop else 'paused' if self.paused else 'quoting'
        why = self.stop['reason'] if self.stop else self.feed_why if self.paused else ''
        side = lambda x: {'price': x['price'], 'size': x['left']} if x else None
        return self._row(
            now_ns, type='snapshot', state=state, why=why, stopped_by=self.stop['by'] if self.stop else '',
            since_ns=self.since_ns, position=self.pos.qty, avg_price=round(self.pos.avg, 6),
            mid=round(mid, 3) if mid else None, bid=self.book['bid'] if self.book else None,
            ask=self.book['ask'] if self.book else None, realised=round(self.pos.realised, 6),
            unrealised=round(self.pos.unrealised(mid), 6), day=self.day, day_pnl=round(self.day_pnl(), 6),
            fills_today=self.fills_today, volume_today=self.volume_today,
            quote_bid=side(q['buy']), quote_ask=side(q['sell']))
