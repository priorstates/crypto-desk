#!/usr/bin/env python3
"""Market Recorder: one connection to Coinbase's public market data feed.

Records top of book (the ticker channel) and trades (the matches channel) into
daily compressed files, logs every gap, writes a heartbeat, and passes every
quote and trade on to other programs on this machine through live.sock.
Public data only: it subscribes and reads. It never signs in or sends an order.
"""
import collections
import json
import os
import random
import signal
import time

import conf
import store
from conf import iso_ns, ns_iso, write_json
from live import LiveServer
from wsclient import WS

try:
    import studio_stream
except Exception:
    studio_stream = None

WS_URL = os.environ.get('COINBASE_WS', 'wss://ws-feed.exchange.coinbase.com')
STALL_S = 15            # no message at all for this long: connect again
GB = 1024 ** 3


class FeedError(Exception):
    pass


class Resubscribe(Exception):
    pass


def log(msg):
    print(time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime()), msg, flush=True)


class Product:
    def __init__(self, name):
        self.last_ns = 0            # receive time of the last message of any kind
        self.quote = self.trade = None
        self.last_trade_id = 0
        self.lag_ns = 0
        self.buckets = collections.deque()
        self.gap = None             # {start_ns, reason, end_ns?, missed_trades?}
        self.await_last = False
        self.gaps_day, self.gaps_n = '', 0
        self.qw = store.DayWriter(name, 'quotes', store.QUOTE_COLS)
        self.tw = store.DayWriter(name, 'trades', store.TRADE_COLS)

    def count(self, sec):
        b = self.buckets
        if b and b[-1][0] == sec:
            b[-1][1] += 1
        else:
            b.append([sec, 1])
        while b and b[0][0] <= sec - 60:
            b.popleft()


class Recorder:
    def __init__(self):
        self.p = {}
        self.stop = False
        self.connected = False
        self.error = 'connecting'
        self.paused, self.pause_why, self.pause_ns, self.dropped = False, '', 0, 0
        self.disk = {}
        self.root = conf.data_dir()
        self.t_tick = self.t_status = self.t_stream = 0.0
        self.t_keep = -1e9
        self.t_flush = time.monotonic()
        self.live = LiveServer(os.path.abspath('live.sock'), self.hello)

    # ---- products and what was known before a restart
    def sync_products(self, names):
        for name in [n for n in self.p if n not in names]:
            st = self.p.pop(name)
            st.qw.close()
            st.tw.close()
        for name in names:
            if name not in self.p:
                self.p[name] = Product(name)

    def restore(self):
        try:
            with open('heartbeat.json') as f:
                old = json.load(f).get('products', {})
        except (OSError, ValueError):
            old = {}
        for name, st in self.p.items():
            was = old.get(name) or {}
            if was.get('last_ns'):
                st.last_ns = was['last_ns']
                st.last_trade_id = was.get('last_trade_id') or 0
                st.gap = {'start_ns': st.last_ns, 'reason': 'the recorder was not running'}
        day = store.day_of(time.time_ns())
        try:
            with open(os.path.join(self.root, 'gaps', day + '.jsonl')) as f:
                for line in f:
                    st = self.p.get(json.loads(line).get('product'))
                    if st:
                        st.gaps_day, st.gaps_n = day, st.gaps_n + 1
        except (OSError, ValueError):
            pass

    # ---- the live feed for other programs
    def hello(self):
        lines = [{'type': 'hello', 'products': list(self.p), 'connected': self.connected,
                  'recv_ns': time.time_ns()}]
        lines += [dict(st.quote, snapshot=True) for st in self.p.values() if st.quote]
        return [(json.dumps(x) + '\n').encode() for x in lines]

    def say(self, obj):
        if self.live.clients:
            self.live.publish((json.dumps(obj) + '\n').encode())

    # ---- gaps
    def log_gap(self, name, st, g):
        end = g.get('end_ns') or time.time_ns()
        rec = {'product': name, 'start_ns': g['start_ns'], 'end_ns': end,
               'start': ns_iso(g['start_ns']), 'end': ns_iso(end),
               'seconds': round((end - g['start_ns']) / 1e9, 3), 'reason': g['reason'],
               'missed_trades': g.get('missed_trades')}
        day = store.day_of(end)
        if st.gaps_day != day:
            st.gaps_day, st.gaps_n = day, 0
        st.gaps_n += 1
        log(f"GAP {name} {rec['start']} -> {rec['end']} ({rec['seconds']} s): {rec['reason']}"
            + (f", {rec['missed_trades']} trades missed" if rec['missed_trades'] else ''))
        try:
            os.makedirs(os.path.join(self.root, 'gaps'), exist_ok=True)
            with open(os.path.join(self.root, 'gaps', day + '.jsonl'), 'a') as f:
                f.write(json.dumps(rec) + '\n')
        except OSError as e:
            log(f'could not write the gap file: {e}')
        if studio_stream:
            try:
                studio_stream.write('gaps', rec, keep_days=30)
            except Exception as e:
                log(f'stream gaps: {e}')
        self.say(dict(rec, type='gap'))

    def end_gap(self, name, st):
        g, st.gap = st.gap, None
        self.log_gap(name, st, g)

    def on_disconnect(self, reason):
        self.connected, self.error = False, reason
        for name, st in self.p.items():
            if st.gap and st.gap.get('end_ns'):
                self.end_gap(name, st)
            if not st.gap and st.last_ns:
                st.gap = {'start_ns': st.last_ns, 'reason': reason}
        self.say({'type': 'status', 'state': 'disconnected', 'reason': reason,
                  'recv_ns': time.time_ns()})

    # ---- files
    def write(self, writer, recv_ns, fields):
        if self.paused:
            self.dropped += 1
            return
        try:
            writer.write(self.root, recv_ns, fields)
        except OSError as e:
            self.pause(f'writing failed: {e}')

    def pause(self, why):
        if not self.paused:
            self.paused, self.pause_ns, self.dropped = True, time.time_ns(), 0
            log(f'PAUSED writing files: {why}')
            for st in self.p.values():
                st.qw.close()
                st.tw.close()
        self.pause_why = why

    def resume(self):
        self.paused = False
        log(f'writing files again ({self.dropped} rows were not written)')
        for name, st in self.p.items():
            self.log_gap(name, st, {'start_ns': self.pause_ns,
                                    'reason': 'files not written: ' + self.pause_why})

    def keep(self):
        root = conf.data_dir()
        if root != self.root:
            log(f'data folder is now {root}')
            self.root = root
        try:
            r = store.enforce(root, conf.number('cap_gb') * GB, conf.number('keep_days'),
                              conf.number('min_free_gb') * GB, log=log)
        except OSError as e:
            self.pause(f'data folder {root}: {e}')
            return
        self.disk = r
        if r['paused']:
            self.pause(r['why'])
        elif self.paused:
            self.resume()

    # ---- messages
    def on_msg(self, m, recv_ns):
        kind = m.get('type')
        if kind == 'error':
            raise FeedError(f"{m.get('message', 'error')} {m.get('reason', '')}".strip())
        if kind == 'subscriptions':
            self.connected, self.error = True, ''
            log('subscribed: ' + ', '.join(self.p))
            self.say({'type': 'status', 'state': 'connected', 'reason': '', 'recv_ns': recv_ns})
            return
        name = m.get('product_id')
        st = self.p.get(name)
        if st is None:
            return
        if kind == 'last_match':        # the last trade before we subscribed: not recorded
            tid = int(m.get('trade_id') or 0)
            if st.gap and st.last_trade_id and tid > st.last_trade_id:
                st.gap['missed_trades'] = tid - st.last_trade_id
            st.last_trade_id = max(st.last_trade_id, tid)
            st.await_last = False
            if st.gap and st.gap.get('end_ns'):
                self.end_gap(name, st)
            return
        if kind not in ('ticker', 'match', 'heartbeat'):
            return
        st.last_ns = recv_ns
        if st.gap and not st.gap.get('end_ns'):
            st.gap['end_ns'] = recv_ns
            if not st.await_last:
                self.end_gap(name, st)
        if kind == 'heartbeat':
            return
        exch_ns = iso_ns(m.get('time'))
        seq = m.get('sequence')
        st.count(recv_ns // 10**9)
        head = [str(recv_ns), str(exch_ns or ''), str(seq if seq is not None else '')]
        if kind == 'ticker':
            ev = {'type': 'quote', 'product': name, 'recv_ns': recv_ns, 'exch_ns': exch_ns,
                  'seq': seq, 'bid': str(m.get('best_bid') or ''),
                  'bid_size': str(m.get('best_bid_size') or ''),
                  'ask': str(m.get('best_ask') or ''),
                  'ask_size': str(m.get('best_ask_size') or '')}
            st.quote = ev
            self.write(st.qw, recv_ns, head + [ev['bid'], ev['bid_size'], ev['ask'], ev['ask_size']])
        else:
            tid = int(m.get('trade_id') or 0)
            if exch_ns:
                st.lag_ns = recv_ns - exch_ns
            if st.last_trade_id and tid > st.last_trade_id + 1:
                self.log_gap(name, st, {
                    'start_ns': st.trade['recv_ns'] if st.trade else recv_ns, 'end_ns': recv_ns,
                    'reason': 'trades missing in the feed',
                    'missed_trades': tid - st.last_trade_id - 1})
            st.last_trade_id = max(st.last_trade_id, tid)
            ev = {'type': 'trade', 'product': name, 'recv_ns': recv_ns, 'exch_ns': exch_ns,
                  'seq': seq, 'trade_id': tid, 'price': str(m.get('price') or ''),
                  'size': str(m.get('size') or ''), 'maker_side': str(m.get('side') or '')}
            st.trade = ev
            self.write(st.tw, recv_ns, head + [str(tid), ev['price'], ev['size'], ev['maker_side']])
        self.say(ev)

    # ---- once a second: heartbeat, flush, the size cap
    def tick(self):
        mono = time.monotonic()
        if mono - self.t_tick < 0.2:
            return
        self.t_tick = mono
        now_ns = time.time_ns()
        for name, st in self.p.items():
            if st.gap and st.gap.get('end_ns') and now_ns - st.gap['end_ns'] > 5e9:
                st.await_last = False
                self.end_gap(name, st)
        if mono - self.t_keep >= 60:
            self.t_keep = mono
            self.keep()
        if mono - self.t_flush >= 10 and not self.paused:
            self.t_flush = mono
            try:
                for st in self.p.values():
                    st.qw.flush()
                    st.tw.flush()
            except OSError as e:
                self.pause(f'writing failed: {e}')
        if mono - self.t_status >= 1:
            self.t_status = mono
            self.beat(now_ns, mono)

    def beat(self, now_ns, mono):
        sec, today, d = now_ns // 10**9, store.day_of(now_ns), self.disk
        prods = {}
        for name, st in self.p.items():
            open_gap = st.gap if st.gap and not st.gap.get('end_ns') else None
            prods[name] = {
                'last_ns': st.last_ns,
                'age_s': round((now_ns - st.last_ns) / 1e9, 3) if st.last_ns else None,
                'quote': st.quote, 'trade': st.trade, 'last_trade_id': st.last_trade_id,
                'msgs_min': sum(n for s, n in st.buckets if s > sec - 60),
                'lag_ms': round(st.lag_ns / 1e6, 1),
                'gaps_today': st.gaps_n if st.gaps_day == today else 0,
                'gap_open': open_gap,
                'files': d.get('today', {}).get(name, {'quotes': 0, 'trades': 0})}
        hb = {'t': now_ns / 1e9, 't_ns': now_ns, 'connected': self.connected,
              'error': self.error, 'paused': self.paused,
              'pause_why': self.pause_why if self.paused else '', 'products': prods,
              'disk': {'data_dir': self.root, 'used': d.get('used'), 'free': d.get('free'),
                       'total': d.get('total'), 'cap': conf.number('cap_gb') * GB,
                       'oldest_day': d.get('oldest_day', ''), 'days': d.get('days', 0)},
              'settings': conf.settings(), 'live_socket': self.live.path,
              'readers': len(self.live.clients), 'source': WS_URL}
        error = self.error if not self.connected else (
            'files not written: ' + self.pause_why if self.paused else '')
        status = {'t': now_ns / 1e9, 'ok': self.connected and not self.paused,
                  'last': max([st.last_ns for st in self.p.values()] or [0]) / 1e9,
                  'lag': round(max([st.lag_ns for st in self.p.values()] or [0]) / 1e9, 3),
                  'error': error,
                  'note': ' · '.join(f"{n} {v['msgs_min']:,}/min" for n, v in prods.items())}
        try:
            write_json('heartbeat.json', hb)
            os.makedirs('status', exist_ok=True)
            write_json('status/recorder.json', status)
        except OSError as e:
            log(f'could not write the heartbeat: {e}')
        if studio_stream and mono - self.t_stream >= 5:
            self.t_stream = mono
            try:
                studio_stream.write('heartbeat', hb, keep_days=2)
            except Exception as e:
                log(f'stream heartbeat: {e}')

    # ---- the connection
    def session(self, names):
        ws = WS(WS_URL, timeout=10)
        try:
            ws.send(json.dumps({'type': 'subscribe', 'product_ids': names,
                                'channels': ['ticker', 'matches', 'heartbeat']}))
            for st in self.p.values():
                st.await_last = True
            last = time.monotonic()
            while not self.stop:
                raw = ws.recv(1.0)
                if raw is not None:
                    last = time.monotonic()
                    self.on_msg(json.loads(raw), time.time_ns())
                elif time.monotonic() - last > STALL_S:
                    raise FeedError(f'no messages for {STALL_S} s')
                self.tick()
                if conf.products() != names:
                    raise Resubscribe('the product list changed')
        finally:
            ws.close()

    def run(self):
        self.sync_products(conf.products())
        self.restore()
        self.live.start()
        log(f'recorder started: {WS_URL}, data in {self.root}')
        backoff = 1.0
        while not self.stop:
            names = conf.products()
            self.sync_products(names)
            started, wait = time.monotonic(), 0.0
            try:
                self.session(names)
                reason = 'stopping'
            except Resubscribe as e:
                reason = str(e)
            except Exception as e:
                reason = f'{type(e).__name__}: {e}'
                if time.monotonic() - started > 30:
                    backoff = 1.0
                wait = backoff * (1 + random.random() * 0.3)
                backoff = min(backoff * 2, 60.0)
            if self.stop:
                break
            self.on_disconnect(reason)
            log(f'disconnected: {reason}; connecting again in {wait:.1f} s')
            end = time.monotonic() + wait
            while not self.stop and time.monotonic() < end:
                self.tick()
                time.sleep(0.2)
        self.connected, self.error = False, 'stopped'
        for st in self.p.values():
            st.qw.close()
            st.tw.close()
        self.beat(time.time_ns(), time.monotonic())
        self.live.close()
        log('recorder stopped')


if __name__ == '__main__':
    rec = Recorder()

    def stop(*_):
        rec.stop = True
    signal.signal(signal.SIGTERM, stop)
    signal.signal(signal.SIGINT, stop)
    rec.run()
