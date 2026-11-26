"""Paper Market Maker: the service.

PAPER ONLY. It reads Market Recorder's live feed from a local Unix socket and
writes files. It opens no network connection, holds no exchange credentials,
and has no code that sends an order: every quote, cancel and fill is simulated.

    python3 maker.py
"""
import json
import os
import queue
import signal
import sys
import threading
import time

os.chdir(os.path.dirname(os.path.abspath(__file__)))
import conf
from engine import Engine
from journal import Journal
from live_client import follow
from markout import Markouts

try:
    import studio_stream
except Exception:
    studio_stream = None

RISK_FILE = 'control/risk.json'     # written by Risk Monitor: {"stop": true, "reason": "...", "t_ns": ...}


def log(msg):
    print(time.strftime('%Y-%m-%d %H:%M:%S', time.gmtime()) + 'Z ' + msg, flush=True)


def stream(name, row, keep_days):
    if studio_stream:
        try:
            studio_stream.write(name, row, keep_days=keep_days)
        except Exception as e:
            log(f'stream {name}: {e}')


class Service:
    def __init__(self):
        self.error = ''
        self.journal = Journal(conf.data_dir, lambda: conf.number('keep_days'))
        os.makedirs(conf.data_dir(), exist_ok=True)
        os.makedirs('control', exist_ok=True)
        os.makedirs('status', exist_ok=True)
        self.state_path = os.path.join(conf.data_dir(), 'state.json')
        try:
            with open(self.state_path) as f:
                state = json.load(f)
        except (OSError, ValueError):
            state = None
        now = time.time_ns()
        self.mk = Markouts(conf.PRODUCT, conf.data_dir, lambda: conf.number('stale_s'), log)
        self.eng = Engine(conf.settings, self.emit, state, now)
        self.emit('event', {'local_ns': now, 'exch_ns': 0, 'type': 'start',
                            'position': self.eng.pos.qty, 'restored': state is not None})
        self.risk = (None, None)            # (mtime, contents)
        self.ticks = 0

    def emit(self, kind, row):
        try:
            self.journal.write(kind, row)
            self.error = ''
        except OSError as e:
            self.error = f'could not write the log: {e}'
        if kind == 'markout':
            stream('markouts', row, 30)
        elif kind == 'fill':
            self.mk.on_fill(row)
            stream('fills', row, 30)
            log(f"fill {row['reason']} {row['side']} {row['size']} @ {row['price']}"
                f" position {row['position']} day {row['day_pnl']:.2f}")
        elif kind == 'event':
            stream('events', row, 30)
            log('event ' + json.dumps({k: v for k, v in row.items() if k not in ('local_ns', 'exch_ns')}))

    def handle(self, ev):
        now, kind = time.time_ns(), ev.get('type')
        if kind in ('quote', 'trade'):
            if ev.get('product') == conf.PRODUCT:
                if kind == 'quote':
                    self.markouts(now)          # with the mid as it stood before this quote
                (self.eng.on_quote if kind == 'quote' else self.eng.on_trade)(ev, now)
        elif kind == 'status':
            self.eng.on_status(ev, now)
        elif kind == 'hello' and not ev.get('connected', True):
            self.eng.on_status({'state': 'disconnected',
                                'reason': 'the recorder is not connected to the exchange'}, now)

    def markouts(self, now):
        eng = self.eng
        mid = eng.mid if eng.book and not eng.paused else None
        for row in self.mk.advance(now, mid):
            self.emit('markout', row)

    def risk_signal(self):
        try:
            m = os.stat(RISK_FILE).st_mtime_ns
            if m != self.risk[0]:
                with open(RISK_FILE) as f:
                    self.risk = (m, json.load(f))
        except FileNotFoundError:
            self.risk = (None, None)
        except (OSError, ValueError):
            pass                            # being written: keep the last good one
        return self.risk[1] if isinstance(self.risk[1], dict) else None

    def tick(self):
        now, eng = time.time_ns(), self.eng
        self.markouts(now)
        eng.on_timer(now, self.risk_signal())
        snap = eng.snapshot(now)
        self.emit('snapshot', snap)
        try:
            self.journal.flush()
        except OSError as e:
            self.error = f'could not write the log: {e}'
        s = conf.settings()
        age = round((now - eng.feed_ns) / 1e9, 3) if eng.feed_ns else None
        hb = dict(snap, t=round(now / 1e9, 3), t_ns=now, paper=True, product=conf.PRODUCT,
                  feed={'connected': eng.connected, 'age_s': age}, error=self.error,
                  data_dir=conf.data_dir(), risk_file=os.path.abspath(RISK_FILE), settings=s)
        del hb['type'], hb['local_ns']
        note = f"{snap['state']} · position {snap['position']:+.4f} BTC · day {snap['day_pnl']:+.2f} USD"
        status = {'t': now / 1e9, 'ok': not self.error, 'last': eng.feed_ns / 1e9 if eng.feed_ns else 0,
                  'lag': age or 0, 'error': self.error, 'note': note}
        try:
            conf.write_json('heartbeat.json', hb)
            conf.write_json('status/maker.json', status)
            conf.write_json(self.state_path, eng.state())
        except OSError as e:
            self.error = f'could not write the heartbeat: {e}'
        self.ticks += 1
        if self.ticks % 2 == 0:
            stream('status', hb, 2)
        if self.ticks % 30 == 1:
            stream('pnl', {'day': snap['day'], 'day_pnl': snap['day_pnl'], 'position': snap['position'],
                           'realised': snap['realised'], 'unrealised': snap['unrealised'],
                           'mid': snap['mid'], 'state': snap['state']}, 30)

    def run(self):
        q = queue.Queue(maxsize=50000)

        def reader():
            for ev in follow():
                q.put(ev)
        threading.Thread(target=reader, daemon=True).start()
        log(f'paper market maker on {conf.PRODUCT}: simulated quotes only, no orders are sent')
        due = time.monotonic()
        try:
            while True:
                try:
                    self.handle(q.get(timeout=max(0.0, min(0.25, due - time.monotonic()))))
                except queue.Empty:
                    pass
                if time.monotonic() >= due:
                    due = max(due + 1, time.monotonic() + 0.5)
                    self.tick()
        finally:
            try:
                conf.write_json(self.state_path, self.eng.state())
                self.journal.close()
            except OSError:
                pass


def _term(*_):
    raise SystemExit(0)


if __name__ == '__main__':
    signal.signal(signal.SIGTERM, _term)
    Service().run()
