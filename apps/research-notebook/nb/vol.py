"""Study 2: realised volatility of the mid at several horizons, by hour, and against the spread.

The mid is sampled once a second on the exchange's clock (the last quote at or
before each second). Returns are log returns over windows that do not overlap;
a window that touches a gap, or a second with no fresh quote, is left out.
"""
import math

from . import common, load

NS = 10**9
YEAR_S = 365 * 86400


def day(root, product, d, P):
    q = load.quotes(root, product, d)
    gaps = load.gaps(root, product, d, q, P['gap_silence_s'])
    ts, mid, bid, ask = q.ts, q.mid, q.bid, q.ask
    n, lim, t0 = len(ts), int(P['gap_silence_s'] * NS), load.day_start_ns(d)
    logm, sprd = [None] * 86400, [0.0] * 86400
    j = -1
    for sec in range(86400):
        g = t0 + sec * NS
        while j + 1 < n and ts[j + 1] <= g:
            j += 1
        if j < 0 or j == n - 1 and g > ts[j]:      # before the first quote, after the last
            continue
        if g - ts[j] > lim or gaps.overlaps(ts[j], g):
            continue
        logm[sec] = math.log(mid[j])
        sprd[sec] = (ask[j] - bid[j]) / mid[j] * 1e4
    bad = [0] * 86401                               # how many seconds before this one are missing
    for sec in range(86400):
        bad[sec + 1] = bad[sec] + (logm[sec] is None)
    hz = {}
    for h in P['vol_horizons_s']:
        rows = [[0, 0.0] for _ in range(24)]        # per hour: windows, sum of squared returns
        for k in range(0, 86400 - h, h):
            if bad[k + h + 1] - bad[k]:
                continue
            r = logm[k + h] - logm[k]
            row = rows[k // 3600]
            row[0] += 1
            row[1] += r * r
        hz[str(h)] = rows
    pairs = []                                      # per minute: mean spread (bps), 1 s volatility (bps per √min)
    for m in range(1440):
        k = m * 60
        if bad[k + 60] - bad[k] or k + 60 >= 86400 or logm[k + 60] is None:
            continue
        ss = sum((logm[i + 1] - logm[i]) ** 2 for i in range(k, k + 60))
        pairs.append([round(sum(sprd[k:k + 60]) / 60, 4), round(math.sqrt(ss) * 1e4, 4)])
    return {'cov': common.coverage(d, q, gaps, {'seconds': 86400 - bad[86400]}), 'hz': hz, 'pairs': pairs}


def _vol(n, ss, h):
    """(typical move over the horizon in bps, the same as a yearly rate in %)."""
    if not n:
        return None, None
    v = ss / n
    return math.sqrt(v) * 1e4, math.sqrt(v * YEAR_S / h) * 100


def combine(aggs, P):
    out = {'sample': common.sample(aggs), 'seconds': sum(a['cov']['seconds'] for a in aggs),
           'horizons': [], 'hours': [], 'daily': []}
    hs = [str(h) for h in P['vol_horizons_s']]
    tot = {h: [[0, 0.0] for _ in range(24)] for h in hs}
    for a in aggs:
        row = {'day': a['cov']['day'], 'ann': []}
        for h in hs:
            rows = a['hz'].get(h, [])
            for into, src in zip(tot[h], rows):
                into[0] += src[0]; into[1] += src[1]
            row['ann'].append(_vol(sum(r[0] for r in rows), sum(r[1] for r in rows), int(h))[1])
        if a['cov']['seconds']:
            out['daily'].append(row)
    for h in hs:
        n, ss = sum(r[0] for r in tot[h]), sum(r[1] for r in tot[h])
        b, ann = _vol(n, ss, int(h))
        out['horizons'].append({'s': int(h), 'n': n, 'bps': b, 'ann': ann})
    out['hours'] = [{'h': i, 'n': [tot[h][i][0] for h in hs],
                     'ann': [_vol(tot[h][i][0], tot[h][i][1], int(h))[1] for h in hs]} for i in range(24)]
    # against the spread: minutes sorted by their spread, in ten groups of equal size
    pairs = sorted(p for a in aggs for p in a['pairs'])
    out['pairs'] = len(pairs)
    out['rank_corr'] = common.spearman(pairs)
    groups = []
    k = min(10, len(pairs) // 20)
    k = k if k >= 2 else 0                          # under 40 minutes: no groups
    for g in range(k):
        part = pairs[len(pairs) * g // k: len(pairs) * (g + 1) // k]
        groups.append({'n': len(part), 'lo': part[0][0], 'hi': part[-1][0],
                       'spread': sum(p[0] for p in part) / len(part),
                       'vol': math.sqrt(sum(p[1] ** 2 for p in part) / len(part))})
    out['groups'] = groups
    return out
