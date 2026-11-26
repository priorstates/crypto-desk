"""Risk Monitor: the service.

It reads Market Recorder's heartbeat and live feed, the Paper Market Maker's
heartbeat and fills log, and the disk. It writes its own state, and one file of
the strategy's: control/risk.json, the stop signal. No network, no orders.

    python3 monitor.py           run
    python3 monitor.py --once    measure once, print it, write nothing
"""
import json
import os
import shutil
import signal
import sys
import threading
import time

os.chdir(os.path.dirname(os.path.abspath(__file__)))
import conf
from fills import FillBook
from live_client import follow
from rules import CHECKS, evaluate
from tracker import Tracker, _num

try:
    import studio_stream
except Exception:
    studio_stream = None


def log(msg):
    print(time.strftime('%Y-%m-%d %H:%M:%S', time.gmtime()) + 'Z ' + msg, flush=True)


def read_json(path):
    try:
        with open(path) as f:
            return json.load(f)
    except (OSError, ValueError):
        return None


class Monitor:
    def __init__(self, dry=False):
        self.dry, self.started, self.error = dry, time.time(), ''
        self.live = {'last_ns': {}, 'mid': None, 'mid_ns': 0}     # filled by the feed reader
        self.hb = {'recorder': None, 'maker': None}               # the last good heartbeat of each
        self.book = FillBook()
        self.tracker = Tracker(None if dry else conf.path(conf.DATA), self.write_signal)
        self.ticks = 0

    # ---- the live feed (its own thread): when each product last spoke, and the BTC-USD mid
    def read_feed(self):
        for ev in follow(conf.path(conf.RECORDER, 'live.sock')):
            p = ev.get('product')
            if ev.get('type') not in ('quote', 'trade') or not p:
                continue
            t = ev.get('recv_ns') or 0          # the recorder's receive time: an old snapshot stays old
            if t > self.live['last_ns'].get(p, 0):
                self.live['last_ns'][p] = t
            if ev['type'] == 'quote' and p == conf.BOOK:
                try:
                    bid, ask = float(ev['bid']), float(ev['ask'])
                except (KeyError, TypeError, ValueError):
                    continue
                if 0 < bid < ask:
                    self.live['mid'], self.live['mid_ns'] = (bid + ask) / 2, t

    def write_signal(self, stop, why):
        if self.dry:
            return
        folder = conf.path(conf.MAKER, 'control')
        os.makedirs(folder, exist_ok=True)
        conf.write_json(os.path.join(folder, 'risk.json'),
                        {'stop': bool(stop), 'reason': why, 't_ns': time.time_ns()})
        log(f"stop signal: {'STOP' if stop else 'clear'} ({why})")

    def measure(self, now, s):
        m, ages = {'feed_age': {}}, {}
        for who, folder in (('recorder', conf.RECORDER), ('maker', conf.MAKER)):
            hb = read_json(conf.path(folder, 'heartbeat.json'))
            if isinstance(hb, dict) and hb.get('t'):
                self.hb[who] = hb
            hb = self.hb[who]
            ages[who] = max(0.0, now - hb['t']) if hb else None
        m['recorder_age'], m['maker_age'] = ages['recorder'], ages['maker']
        rec, mk = self.hb['recorder'] or {}, self.hb['maker'] or {}
        for p in conf.PRODUCTS:
            last = max(self.live['last_ns'].get(p, 0), ((rec.get('products') or {}).get(p) or {}).get('last_ns') or 0)
            # Never heard at all: stale once this service has waited that long itself.
            m['feed_age'][p] = max(0.0, now - last / 1e9) if last else now - self.started
        mid = self.live['mid'] if now - self.live['mid_ns'] / 1e9 < 60 else None
        root = os.path.expanduser(str(mk.get('data_dir') or conf.MAKER_DATA))
        try:
            good = self.book.poll(root, int(now * 1e9), mid)
        except Exception as e:                  # a damaged row must not stop the other checks
            good, self.book.error = False, f'fills: {e}'
        nums = self.book.numbers(mid) if good else {}
        m['position'], m['day_pnl'] = nums.get('position'), nums.get('day_pnl')
        free = []
        for path in {conf.path('~'), root, str((rec.get('disk') or {}).get('data_dir') or conf.path('~'))}:
            try:
                free.append(shutil.disk_usage(path).free / 1e9)
            except OSError:
                pass
        m['free_gb'] = round(min(free), 2) if free else None
        return m, nums, mid

    def tick(self):
        now, s = time.time(), conf.settings()
        m, nums, mid = self.measure(now, s)
        checks = evaluate(m, s)
        mk = self.hb['maker'] or {}
        maker_state = mk.get('state') if checks['maker_hb']['state'] == 'ok' else None
        changed = self.tracker.update(checks, s, now, maker_state)
        tr = self.tracker
        for ev in changed:
            log('event ' + json.dumps(ev))
        row = dict(nums, mid=round(mid, 3) if mid else None, free_gb=m['free_gb'],
                   checks={k: {'state': checks[k]['state'], 'value': _num(checks[k]['value']),
                               'limit': checks[k]['limit'], 'since': tr.since[k][1]} for k in CHECKS},
                   stop=tr.stop, can_clear=bool(tr.stop) and not tr.breached_stops(checks), note=tr.note,
                   open=[e['id'] for e in tr.open.values()],
                   maker={'state': maker_state, 'position': mk.get('position'), 'day_pnl': mk.get('day_pnl'),
                          'stopped_by': mk.get('stopped_by'), 'why': mk.get('why')},
                   error=self.book.error, settings=s)
        if self.dry:
            return row
        bad = [k for k in CHECKS if checks[k]['state'] == 'breach']
        note = (f"{len(bad)} breached: {', '.join(bad)}" if bad else 'all clear') + \
            (' · stop on' if tr.stop else '')
        if nums.get('position') is not None:
            note += f" · position {nums['position']:+.4f} BTC"
        if nums.get('day_pnl') is not None:
            note += f" · day {nums['day_pnl']:+.2f} USD"
        os.makedirs('status', exist_ok=True)
        conf.write_json('status/monitor.json', {'t': now, 'ok': not self.book.error, 'last': now, 'lag': 0,
                                                'error': self.book.error, 'note': note})
        conf.write_json('heartbeat.json', dict(row, t=round(now, 3)))
        self.ticks += 1
        if studio_stream:
            try:
                for ev in changed:
                    studio_stream.write('events', ev, keep_days=30)
                if changed or self.ticks % 2 == 0:
                    studio_stream.write('state', row, keep_days=2)
            except Exception as e:
                log(f'stream: {e}')
        return row

    def run(self):
        threading.Thread(target=self.read_feed, daemon=True).start()
        if self.dry:
            time.sleep(2.5)
            print(json.dumps(self.tick(), indent=1))
            return
        log('risk monitor: watching the feed and the paper strategy')
        while True:
            start = time.monotonic()
            try:
                self.tick()
            except Exception as e:              # keep watching; the status file carries the problem
                log(f'tick failed: {e!r}')
                try:
                    conf.write_json('status/monitor.json', {'t': time.time(), 'ok': False, 'last': 0, 'lag': 0,
                                                            'error': f'{e!r}'[:300], 'note': 'a check pass failed'})
                except OSError:
                    pass
            time.sleep(max(0.2, 1.0 - (time.monotonic() - start)))


def _term(*_):
    raise SystemExit(0)


if __name__ == '__main__':
    signal.signal(signal.SIGTERM, _term)
    Monitor(dry='--once' in sys.argv).run()
