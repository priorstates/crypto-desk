"""Position and day PnL rebuilt from the Paper Market Maker's fills log alone.

The strategy's own position and PnL numbers are never used here: every fill
row (side, price, size) is replayed through the paper_book component.

    <folder>/fills/<YYYY-MM-DD>.jsonl       today, being written
    <folder>/fills/<YYYY-MM-DD>.jsonl.gz    a finished day
"""
import gzip
import json
import os
import sys
import time

_here = os.path.dirname(os.path.abspath(__file__))
for _p in (_here, os.path.dirname(_here)):
    if os.path.isdir(os.path.join(_p, '_components')) and _p not in sys.path:
        sys.path.insert(0, _p)
from _components.paper_book import Position


def day_of(ns):
    return time.strftime('%Y-%m-%d', time.gmtime(ns // 10**9))


def _copy(p):
    return Position.from_dict(p.as_dict())


class FillBook:
    def __init__(self):
        self.root = None
        self._reset()

    def _reset(self):
        self.day = None
        self.pos0 = Position()      # every fill before today (UTC), in order
        self.pos = Position()       # every fill
        self.today = []             # today's fills (side, price, size)
        self.rows = {}              # day -> rows applied
        self.offset = {}            # day -> bytes read of its .jsonl
        self.done = set()           # finished days, read to the end
        self.last = None            # the newest fill row
        self.mark0 = None           # the mid at 00:00 UTC, for the position carried into today
        self.error = ''

    def poll(self, root, now_ns, mid=None):
        """Read what is new. True when the numbers can be relied on."""
        today = day_of(now_ns)
        if root != self.root:
            self._reset()
            self.root = root
        if self.day and today != self.day:      # a new UTC day: yesterday's end is today's start
            self.pos0, self.today = _copy(self.pos), []
            self.mark0 = mid if mid else (self.last or {}).get('mid')
        self.day = today
        folder = os.path.join(root, 'fills')
        try:
            names = sorted(os.listdir(folder))
        except FileNotFoundError:
            self.error = ''                     # no fill yet
            return os.path.isdir(root)
        except OSError as e:
            self.error = f'the fills log cannot be read: {e}'
            return False
        days = sorted({n[:10] for n in names if n.startswith('20') and '.jsonl' in n})
        late = False
        try:
            for day in days:
                if day in self.done or day > today:
                    continue
                for row in self._new_rows(folder, day, names, now_ns):
                    late |= self._apply(row, day < today)
        except _Shrunk:
            self.root = None                    # the log was replaced: read it all again next time
            return False
        except OSError as e:
            self.error = f'the fills log cannot be read: {e}'
            return False
        if late:                                # an earlier day's fill arrived: replay today on top
            self.pos = _copy(self.pos0)
            for side, price, size in self.today:
                self.pos.fill(side, price, size)
        if self.mark0 is None and abs(self.pos0.qty) > 1e-9:
            self.mark0 = _first_mid(root, today)
        self.error = ''
        return True

    def _new_rows(self, folder, day, names, now_ns):
        plain, packed = day + '.jsonl', day + '.jsonl.gz'
        finished = day < self.day
        if plain in names:
            path = os.path.join(folder, plain)
            start = self.offset.get(day, 0)
            if os.path.getsize(path) < start:
                raise _Shrunk()
            with open(path, 'rb') as f:
                f.seek(start)
                data = f.read()
            data = data[:data.rfind(b'\n') + 1]             # whole lines only
            self.offset[day] = start + len(data)
            lines = data.splitlines()
            # A finished day stays open for two minutes, for rows written just before midnight.
            if finished and now_ns // 10**9 % 86400 > 120:
                self.done.add(day)
        elif packed in names:
            with gzip.open(os.path.join(folder, packed), 'rb') as f:
                lines = f.read().splitlines()[self.rows.get(day, 0):]
            self.done.add(day)
        else:
            return []
        self.rows[day] = self.rows.get(day, 0) + len(lines)
        out = []
        for line in lines:
            try:
                out.append(json.loads(line))
            except ValueError:
                pass
        return out

    def _apply(self, row, earlier):
        try:
            side, price, size = row['side'], float(row['price']), float(row['size'])
            if earlier:
                self.pos0.fill(side, price, size)
                if not self.today:
                    self.pos.fill(side, price, size)
            else:
                self.pos.fill(side, price, size)
                self.today.append((side, price, size))
        except (KeyError, TypeError, ValueError):
            return False
        self.last = row
        return earlier and bool(self.today)

    def numbers(self, mid):
        """Position and PnL at this mid. day_pnl is None while there is no price to mark with."""
        mark = mid if mid else (self.last or {}).get('mid')
        open_now = abs(self.pos.qty) > 1e-9
        start = self.pos0.total(self.mark0 if self.mark0 else self.pos0.avg)
        return {
            'position': self.pos.qty, 'avg_price': round(self.pos.avg, 6),
            'realised': round(self.pos.realised, 6),
            'unrealised': round(self.pos.unrealised(mark), 6) if mark else None,
            'day_pnl': round(self.pos.total(mark) - start, 6) if (mark or not open_now) else None,
            'day': self.day, 'fills_today': len(self.today),
            'last_fill_ns': (self.last or {}).get('local_ns'),
        }


class _Shrunk(Exception):
    pass


def _first_mid(root, day):
    """The market's mid in the first snapshots of the day: a price, not a PnL number.
    Only needed when this service was not running at 00:00 UTC and a position was carried over."""
    try:
        with open(os.path.join(root, 'snapshots', day + '.jsonl')) as f:
            for _ in range(120):
                mid = json.loads(f.readline() or '{}').get('mid')
                if mid:
                    return float(mid)
    except (OSError, ValueError, TypeError):
        pass
    return None
