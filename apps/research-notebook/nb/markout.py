"""Study 3: how the mid moves after a trade (the markout, or price impact, curve).

All on the exchange's clock. Prints with the same exchange time and side are one
taker order and count as one trade. The reference is the mid of the last quote
strictly before the trade; the move at a horizon is the mid of the last quote at
or before trade time + horizon, signed so that + means the price went the
taker's way. Horizon 0 is the book right after the trade.
"""
from bisect import bisect_left, bisect_right

from . import common, load

NS = 10**9
MS = 10**6


def horizons(P):
    return [0] + list(P['markout_ms'])


def _acc(nh):
    return {'n': 0, 'prints': 0, 'usd': 0.0, 'eff': 0.0, 'hs': 0.0,
            's': [0.0] * nh, 'ss': [0.0] * nh, 'w': [0.0] * nh}


def bucket_of(usd, edges):
    return bisect_right(edges, usd)


def day(root, product, d, P):
    H = horizons(P)
    hmax = int(H[-1] * MS)
    q = load.quotes(root, product, d, head_s=H[-1] / 1000 + 60)
    rows, bad = load.trades(root, product, d)
    gaps = load.gaps(root, product, d, q, P['gap_silence_s'], rows)
    ts, mid, bid, ask = q.ts, q.mid, q.bid, q.ask
    edges, lim = P['size_buckets_usd'], int(P['gap_silence_s'] * NS)
    acc = {}
    skipped = {'no_quote_before': 0, 'stale_quote': 0, 'gap': 0, 'end_of_data': 0}
    delay = {}
    for r in rows:
        ms = max(-200, min(5000, (r[1] - r[0]) // MS))
        delay[ms] = delay.get(ms, 0) + 1
    last_ts = ts[-1] if ts else 0
    i, n = 0, len(rows)
    while i < n:
        t, sign = rows[i][0], rows[i][4]
        size = usd = 0.0
        j = i
        while j < n and rows[j][0] == t and rows[j][4] == sign:
            size += rows[j][3]
            usd += rows[j][2] * rows[j][3]
            j += 1
        prints, i = j - i, j
        i0 = bisect_left(ts, t) - 1
        if i0 < 0:
            skipped['no_quote_before'] += 1
            continue
        if t - ts[i0] > lim:
            skipped['stale_quote'] += 1
            continue
        if t + hmax > last_ts:
            skipped['end_of_data'] += 1
            continue
        if gaps.items and gaps.overlaps(ts[i0], t + hmax):
            skipped['gap'] += 1
            continue
        m0 = mid[i0]
        k = sign / m0 * 1e4
        eff = (usd / size - m0) * k
        hs = (ask[i0] - bid[i0]) / 2 / m0 * 1e4
        moves = [(mid[bisect_right(ts, t + int(h * MS)) - 1] - m0) * k for h in H]
        for key in ('all', 'b%d' % bucket_of(usd, edges), 'buy' if sign > 0 else 'sell'):
            a = acc.get(key)
            if a is None:
                a = acc[key] = _acc(len(H))
            a['n'] += 1; a['prints'] += prints; a['usd'] += usd; a['eff'] += eff; a['hs'] += hs
            s, ss, w = a['s'], a['ss'], a['w']
            for x, mv in enumerate(moves):
                s[x] += mv; ss[x] += mv * mv; w[x] += mv * usd
    cov = common.coverage(d, q, gaps, {'prints': len(rows), 'bad_trades': bad})
    return {'cov': cov, 'acc': acc, 'skipped': skipped, 'delay': delay}


def curve(a, H):
    """One group's result: sample size and, per horizon, mean, standard error, size-weighted mean (bps)."""
    pts = []
    for x, h in enumerate(H):
        m, se = common.mean_se(a['n'], a['s'][x], a['ss'][x])
        pts.append({'ms': h, 'mean': m, 'se': se, 'vw': a['w'][x] / a['usd'] if a['usd'] else None})
    n = a['n']
    return {'n': n, 'prints': a['prints'], 'usd': a['usd'], 'eff': a['eff'] / n if n else None,
            'hs': a['hs'] / n if n else None, 'curve': pts}


def merge(aggs, H):
    tot = {}
    for a in aggs:
        for key, src in a['acc'].items():
            if len(src['s']) != len(H):
                continue
            into = tot.setdefault(key, _acc(len(H)))
            for f in ('n', 'prints', 'usd', 'eff', 'hs'):
                into[f] += src[f]
            for f in ('s', 'ss', 'w'):
                into[f] = [x + y for x, y in zip(into[f], src[f])]
    return tot


def combine(aggs, P):
    H = horizons(P)
    tot = merge(aggs, H)
    edges = P['size_buckets_usd']
    out = {'sample': common.sample(aggs), 'horizons': H,
           'prints': sum(a['cov']['prints'] for a in aggs),
           'skipped': {k: sum(a['skipped'][k] for a in aggs) for k in ('no_quote_before', 'stale_quote', 'gap', 'end_of_data')},
           'all': curve(tot.get('all', _acc(len(H))), H),
           'buy': curve(tot.get('buy', _acc(len(H))), H),
           'sell': curve(tot.get('sell', _acc(len(H))), H),
           'buckets': []}
    for b in range(len(edges) + 1):
        c = curve(tot.get('b%d' % b, _acc(len(H))), H)
        c['lo'] = edges[b - 1] if b else None
        c['hi'] = edges[b] if b < len(edges) else None
        out['buckets'].append(c)
    delay = {}
    for a in aggs:
        common.add_hist(delay, a['delay'])
    n = sum(delay.values())
    if n:
        out['delay'] = {'n': n, 'mean': sum(k * v for k, v in delay.items()) / n,
                        'q': common.quantiles(delay, [0.01, 0.5, 0.9, 0.99]), 'max': max(delay)}
    return out
