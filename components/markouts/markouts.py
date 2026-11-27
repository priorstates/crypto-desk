"""Markouts: where the mid is a fixed time after a fill, seen from the fill.

signed() is positive when the fill made money by then: for a buy the mid is
above the fill price, for a sell below it. A market maker whose markouts turn
negative as the horizon grows is being adversely selected.

Standard library only, no I/O. Times are integer nanoseconds.
"""
import bisect

HORIZONS = (1, 5, 30)       # seconds
S = 10**9


def signed(side, price, later_mid):
    if side == 'buy':
        return float(later_mid) - float(price)
    if side == 'sell':
        return float(price) - float(later_mid)
    raise ValueError("side is 'buy' or 'sell': %r" % (side,))


def _put(row, h, mid):
    row['mid%d' % h] = None if mid is None else round(float(mid), 3)
    row['m%d' % h] = None if mid is None else round(signed(row['side'], row['price'], mid), 4)


class Tracker:
    """Live markouts. add() each fill; call advance(now_ns, mid) with the mid
    as it stood just BEFORE now (so: before applying a new quote, and on a
    timer). mid is None when there is no trustworthy mid (a stale feed)."""

    def __init__(self, horizons=HORIZONS):
        self.horizons = tuple(sorted(horizons))
        self._open = []         # [row, index of the next horizon]

    @property
    def pending(self):
        return len(self._open)

    def add(self, fill):
        signed(fill['side'], fill['price'], fill['price'])      # checks the side and the price
        self._open.append([dict(fill), 0])

    def advance(self, now_ns, mid):
        done, keep = [], []
        for item in self._open:
            row, i = item
            while i < len(self.horizons) and now_ns >= row['local_ns'] + self.horizons[i] * S:
                _put(row, self.horizons[i], mid)
                i += 1
            item[1] = i
            (done if i == len(self.horizons) else keep).append(item)
        self._open = keep
        return [row for row, _ in done]


def from_series(times_ns, mids, fill, horizons=HORIZONS, max_age_ns=10 * S):
    """The same row as Tracker gives, from a recorded series (times_ns sorted,
    mids beside it): each horizon takes the last mid at or before fill time +
    horizon. None when the series ends before the longest horizon (not known
    yet); a horizon whose last mid is older than max_age_ns is None."""
    if not times_ns or times_ns[-1] < fill['local_ns'] + max(horizons) * S:
        return None
    row = dict(fill)
    for h in sorted(horizons):
        at = fill['local_ns'] + h * S
        i = bisect.bisect_right(times_ns, at) - 1
        ok = i >= 0 and at - times_ns[i] <= max_age_ns
        _put(row, h, mids[i] if ok else None)
    return row


def summary(rows, horizons=HORIZONS):
    """Average markout by side and horizon, weighted by fill size.
    avg is in price units per unit of size; avg_bps is the same against the
    fill prices. n and size count the fills that have that horizon."""
    out = {}
    for side in ('buy', 'sell', 'all'):
        out[side] = {}
        for h in horizons:
            n, size, pnl, notional = 0, 0.0, 0.0, 0.0
            for r in rows:
                m = r.get('m%d' % h)
                if m is None or (side != 'all' and r['side'] != side):
                    continue
                w = float(r['size'])
                n, size, pnl, notional = n + 1, size + w, pnl + m * w, notional + float(r['price']) * w
            out[side][h] = {'n': n, 'size': round(size, 8),
                            'avg': pnl / size if size else None,
                            'avg_bps': pnl / notional * 1e4 if notional else None}
    return out
