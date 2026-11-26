"""Read one recorded day, and find the gaps in it.

Time is the exchange's own (exch_ns). A file still being written, or left by a
crash, ends without a gzip trailer: its complete rows are read and the rest dropped.
"""
import glob
import gzip
import json
import os
import zlib
from bisect import bisect_right

NS = 10**9


def day_start_ns(day):
    import calendar
    import time
    return calendar.timegm(time.strptime(day, '%Y-%m-%d')) * NS


def next_day(day, step=1):
    import time
    return time.strftime('%Y-%m-%d', time.gmtime(day_start_ns(day) // NS + step * 86400))


def _lines(path):
    try:
        with gzip.open(path, 'rt') as f:
            next(f, None)                       # the header
            for line in f:
                yield line
    except (EOFError, OSError, zlib.error):
        return


def files(root, product, stream, day):
    return sorted(glob.glob(os.path.join(root, product, stream, day + '.*.csv.gz')))


def sizes(root, product, day):
    """File names and sizes of a day: a day's results are computed again when these change."""
    out = []
    for stream in ('quotes', 'trades'):
        out += [(os.path.basename(p), stream, os.path.getsize(p)) for p in files(root, product, stream, day)]
    g = os.path.join(root, 'gaps', day + '.jsonl')
    if os.path.exists(g):
        out.append(('gaps', '', os.path.getsize(g)))
    return out


class Quotes:
    """Top of book in exchange-time order: ts (ns), bid, ask, mid; bad rows left out."""

    def __init__(self):
        self.ts, self.bid, self.ask, self.mid = [], [], [], []
        self.bad = 0
        self.parts = []                         # (first ts, last ts) of each file

    def read(self, paths, until_ns=None):
        ts, bid, ask, mid = self.ts, self.bid, self.ask, self.mid
        for path in paths:
            first = len(ts)
            for line in _lines(path):
                p = line.split(',')
                try:
                    t, b, a = int(p[1]), float(p[3]), float(p[5])
                    p[6]
                except (ValueError, IndexError):
                    self.bad += 1
                    continue
                if not 0 < b < a:
                    self.bad += 1
                    continue
                if until_ns is not None and t > until_ns:
                    break
                ts.append(t); bid.append(b); ask.append(a); mid.append((a + b) / 2)
            if len(ts) > first:
                self.parts.append((ts[first], ts[-1]))
        if any(ts[i] > ts[i + 1] for i in range(len(ts) - 1)):
            order = sorted(range(len(ts)), key=ts.__getitem__)
            for name in ('ts', 'bid', 'ask', 'mid'):
                col = getattr(self, name)
                setattr(self, name, [col[i] for i in order])
        return self

    def at(self, t):
        """Index of the last quote at or before t, or -1."""
        return bisect_right(self.ts, t) - 1


def quotes(root, product, day, head_s=0):
    """The day's quotes, plus the first head_s seconds of the next day (for horizons past midnight)."""
    q = Quotes().read(files(root, product, 'quotes', day))
    q.n_day, q.n_parts = len(q.ts), len(q.parts)
    if head_s and q.ts:
        nxt = files(root, product, 'quotes', next_day(day))
        if nxt:
            q.read(nxt[:1], until_ns=day_start_ns(day) + 86400 * NS + head_s * NS)
    return q


def trades(root, product, day):
    """Rows (exch_ns, recv_ns, price, size, sign, trade_id): sign +1 when the taker bought."""
    out, bad = [], 0
    for path in files(root, product, 'trades', day):
        for line in _lines(path):
            p = line.split(',')
            try:
                side = p[6].strip()
                row = (int(p[1]), int(p[0]), float(p[4]), float(p[5]), 1 if side == 'sell' else -1, int(p[3]))
            except (ValueError, IndexError):
                bad += 1
                continue
            if side not in ('buy', 'sell') or row[2] <= 0 or row[3] <= 0:
                bad += 1
                continue
            out.append(row)
    return out, bad


def fills(root, day):
    """The paper strategy's fills of a day, oldest first."""
    rows = []
    for path, opener in ((os.path.join(root, 'fills', day + '.jsonl.gz'), gzip.open),
                         (os.path.join(root, 'fills', day + '.jsonl'), open)):
        if not os.path.exists(path):
            continue
        try:
            with opener(path, 'rt') as f:
                for line in f:
                    try:
                        r = json.loads(line)
                        float(r['price']), float(r['size']), int(r['exch_ns']), r['side']
                        rows.append(r)
                    except (ValueError, KeyError, TypeError):
                        pass
        except (EOFError, OSError, zlib.error):
            pass
        break
    rows.sort(key=lambda r: r.get('local_ns', 0))
    return rows


class Gaps:
    """Stretches with no trustworthy data, merged and sorted: [start_ns, end_ns, reason]."""

    def __init__(self, items):
        merged = []
        for a, b, why in sorted(i for i in items if i[1] > i[0]):
            if merged and a <= merged[-1][1]:
                merged[-1][1] = max(merged[-1][1], b)
                if merged[-1][2] == 'no quotes':        # keep the reason that says more
                    merged[-1][2] = why
            else:
                merged.append([a, b, why])
        self.items = merged
        self.starts = [g[0] for g in merged]

    def overlaps(self, a, b):
        i = bisect_right(self.starts, b) - 1
        return i >= 0 and self.items[i][1] > a and self.items[i][0] < b

    def seconds(self):
        return sum(b - a for a, b, _ in self.items) / NS


def gaps(root, product, day, q, silence_s, trade_rows=None):
    """Gaps of a day: the recorder's own list, restarts, silences, and missing trade ids."""
    items = []
    try:
        with open(os.path.join(root, 'gaps', day + '.jsonl')) as f:
            for line in f:
                try:
                    g = json.loads(line)
                    if g.get('product') in (product, '', None) and g.get('end_ns'):
                        items.append((int(g['start_ns']), int(g['end_ns']), 'recorder: ' + str(g.get('reason', ''))[:60]))
                except (ValueError, KeyError, TypeError):
                    pass
    except OSError:
        pass
    for (_, last), (first, _) in zip(q.parts[:q.n_parts], q.parts[1:q.n_parts]):
        items.append((last, first, 'recorder restarted'))
    lim = int(silence_s * NS)
    ts = q.ts
    # the day's edges: silence up to midnight counts when the day before / after was recorded too
    t0 = day_start_ns(day)
    t1 = t0 + 86400 * NS
    if q.n_day:
        if ts[0] - t0 > lim and files(root, product, 'quotes', next_day(day, -1)):
            items.append((t0, ts[0], 'no quotes'))
        if t1 - ts[q.n_day - 1] > lim and files(root, product, 'quotes', next_day(day)):
            items.append((ts[q.n_day - 1], t1, 'no quotes'))
    for i in range(len(ts) - 1):
        if ts[i + 1] - ts[i] > lim:
            items.append((ts[i], ts[i + 1], 'no quotes'))
    for a, b in zip(trade_rows or [], (trade_rows or [])[1:]):
        if b[5] - a[5] > 1:
            items.append((a[0], max(b[0], a[0] + 1), f'{b[5] - a[5] - 1} trades missing'))
    return Gaps(items)
