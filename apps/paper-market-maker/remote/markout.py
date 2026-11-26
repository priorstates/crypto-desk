"""Markouts of the simulated fills: the mid 1 s, 5 s and 30 s after each fill,
signed so positive means the fill made money (the component `markouts`).

Live: every fill is tracked and its row is ready 30 s later. After a start, the
fills of today that have no markout yet (made before this feature, or within
30 s of a restart) get theirs from Market Recorder's recorded quotes.
It only reads files on this machine.
"""
import glob
import gzip
import json
import os
import queue
import sys
import threading
import time

_here = os.path.dirname(os.path.abspath(__file__))
for _p in (_here, os.path.dirname(_here)):
    if os.path.isdir(os.path.join(_p, '_components')) and _p not in sys.path:
        sys.path.insert(0, _p)
from _components.markouts import Tracker, from_series

KEEP = ('id', 'side', 'price', 'size', 'reason', 'local_ns', 'exch_ns', 'mid', 'day')
RECORDER = '~/market-recorder/heartbeat.json'      # names the recorder's data folder
WAIT_S = 45         # after a start: the 30 s horizon, and the recorder's 10 s file sync


class Markouts:
    def __init__(self, product, data_dir, stale_s, log):
        self.product, self.data_dir, self.stale_s, self.log = product, data_dir, stale_s, log
        self.tracker = Tracker()
        self.found = queue.Queue()                  # rows from the catch-up thread
        self.start_ns = time.time_ns()
        threading.Thread(target=self._catch_up, daemon=True).start()

    def on_fill(self, row):
        self.tracker.add({k: row.get(k) for k in KEEP})

    def advance(self, now_ns, mid):
        """Rows that are complete now. mid: as it stood just before now, None when stale."""
        rows = self.tracker.advance(now_ns, mid)
        for r in rows:
            r['done_ns'] = now_ns
        try:
            while True:
                rows.append(self.found.get_nowait())
        except queue.Empty:
            pass
        return rows

    # ---- fills that have no markout yet, from the recorded quotes
    def _catch_up(self):
        time.sleep(WAIT_S)
        try:
            day = time.strftime('%Y-%m-%d', time.gmtime(self.start_ns // 10**9))
            root = self.data_dir()
            have = {(r.get('id'), r.get('local_ns')) for r in _rows(os.path.join(root, 'markouts', day + '.jsonl'))}
            todo = [f for f in _rows(os.path.join(root, 'fills', day + '.jsonl'))
                    if (f.get('id'), f.get('local_ns')) not in have and f.get('local_ns', 0) <= self.start_ns]
            if not todo:
                return
            times, mids = recorded_mids(self.product, day, min(f['local_ns'] for f in todo) - 60 * 10**9)
            n = 0
            for f in todo:
                row = from_series(times, mids, {k: f.get(k) for k in KEEP},
                                  max_age_ns=int(self.stale_s() * 1e9))
                if row:
                    row.update(done_ns=time.time_ns(), from_files=True)
                    self.found.put(row)
                    n += 1
            self.log(f'markouts: {n} of {len(todo)} earlier fills filled in from the recorded quotes')
        except Exception as e:                       # never takes the service down
            self.log(f'markouts: could not fill in earlier fills: {e!r}')


def _rows(path):
    out = []
    try:
        with open(path) as f:
            for line in f:
                try:
                    out.append(json.loads(line))
                except ValueError:
                    pass
    except OSError:
        pass
    return out


def recorded_mids(product, day, since_ns):
    """(times_ns, mids) from the recorder's quote files of that UTC day, by receive time."""
    folder = '~/market-data'
    try:
        with open(os.path.expanduser(RECORDER)) as f:
            folder = json.load(f)['disk']['data_dir']
    except (OSError, ValueError, KeyError, TypeError):
        pass
    times, mids = [], []
    for path in sorted(glob.glob(os.path.join(os.path.expanduser(folder), product, 'quotes', day + '.*.csv.gz'))):
        try:
            with gzip.open(path, 'rt') as f:
                for line in f:                       # recv_ns,exch_ns,seq,bid,bid_size,ask,ask_size
                    p = line.split(',')
                    try:
                        t = int(p[0])
                        if t >= since_ns:
                            times.append(t)
                            mids.append((float(p[3]) + float(p[5])) / 2)
                    except (ValueError, IndexError):
                        pass
        except (OSError, EOFError):
            pass                                     # today's file has no end yet: the rows read so far count
    if any(a > b for a, b in zip(times, times[1:])):
        order = sorted(range(len(times)), key=times.__getitem__)
        times, mids = [times[i] for i in order], [mids[i] for i in order]
    return times, mids
