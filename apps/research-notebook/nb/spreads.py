"""Study 1: the quoted spread, weighted by the time it stood.

A quote row exists per ticker (one per trade), so a spread is held from its row
to the next one. A hold that crosses a gap is left out.
"""
import math

from . import common, load

NS = 10**9
LOGB = 40          # bins per unit of ln(bps): about 2.5 % wide


def day(root, product, d, P):
    q = load.quotes(root, product, d)
    gaps = load.gaps(root, product, d, q, P['gap_silence_s'])
    ts, bid, ask, mid = q.ts, q.bid, q.ask, q.mid
    cents, bps = {}, {}
    hours = [{'s': 0.0, 'usd': 0.0, 'bps': 0.0, 'cents': {}} for _ in range(24)]
    lim, has_gaps, used = int(P['gap_silence_s'] * NS), bool(gaps.items), 0
    for i in range(len(ts) - 1):
        dt = ts[i + 1] - ts[i]
        if dt <= 0 or dt > lim or (has_gaps and gaps.overlaps(ts[i], ts[i + 1])):
            continue
        dt /= NS
        sp = ask[i] - bid[i]
        b = sp / mid[i] * 1e4
        c = int(round(sp * 100))
        cents[c] = cents.get(c, 0.0) + dt
        k = math.floor(math.log(b) * LOGB)
        bps[k] = bps.get(k, 0.0) + dt
        h = hours[ts[i] // (3600 * NS) % 24]
        h['s'] += dt; h['usd'] += sp * dt; h['bps'] += b * dt
        h['cents'][c] = h['cents'].get(c, 0.0) + dt
        used += 1
    return {'cov': common.coverage(d, q, gaps, {'used': used}), 'cents': cents, 'bps': bps, 'hours': hours}


def _bps_of(k):
    return math.exp((k + 0.5) / LOGB)


def combine(aggs, P):
    cents, bps = {}, {}
    hours = [{'s': 0.0, 'usd': 0.0, 'bps': 0.0, 'cents': {}} for _ in range(24)]
    daily = []
    for a in aggs:
        common.add_hist(cents, a['cents'])
        common.add_hist(bps, a['bps'])
        s = usd = b = 0.0
        for h, src in zip(hours, a['hours']):
            for k in ('s', 'usd', 'bps'):
                h[k] += src[k]
            common.add_hist(h['cents'], src['cents'])
            s += src['s']; usd += src['usd']; b += src['bps']
        if s:
            daily.append({'day': a['cov']['day'], 'hours': s / 3600, 'mean_usd': usd / s, 'mean_bps': b / s,
                          'med_usd': common.quantiles(common.add_hist({}, a['cents']), [0.5])[0] / 100})
    total = sum(cents.values())
    out = {'sample': common.sample(aggs), 'seconds': total, 'daily': daily,
           'used': sum(a['cov']['used'] for a in aggs)}
    if not total:
        return out
    qs = [0.1, 0.25, 0.5, 0.75, 0.9, 0.99]
    out['q'] = qs
    out['usd'] = {'mean': sum(h['usd'] for h in hours) / total,
                  'q': [c / 100 for c in common.quantiles(cents, qs)]}
    out['bps'] = {'mean': sum(h['bps'] for h in hours) / total, 'q': common.quantiles(bps, qs, _bps_of)}
    # time at each spread: the most common values, the rest together
    top = sorted(cents.items(), key=lambda kv: -kv[1])[:12]
    rest = total - sum(v for _, v in top)
    out['top'] = [{'usd': c / 100, 'share': v / total, 's': v} for c, v in sorted(top)]
    out['rest_share'] = rest / total
    out['distinct'] = len(cents)
    # the distribution in basis points: 24 even bins up to the 99th percentile
    hi = out['bps']['q'][-1] * 1.05
    bins = [0.0] * 24
    over = 0.0
    for k, v in bps.items():
        x = _bps_of(k)
        if x >= hi:
            over += v
        else:
            bins[int(x / hi * 24)] += v
    out['hist_bps'] = {'hi': hi, 'bins': [v / total for v in bins], 'over': over / total}
    out['hours'] = [{'h': i, 'hours': h['s'] / 3600,
                     'mean_usd': h['usd'] / h['s'] if h['s'] else None,
                     'mean_bps': h['bps'] / h['s'] if h['s'] else None,
                     'med_usd': common.quantiles(h['cents'], [0.5])[0] / 100 if h['s'] else None}
                    for i, h in enumerate(hours)]
    return out
