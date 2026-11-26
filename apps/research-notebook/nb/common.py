"""Pieces every study shares: what a day covered, its gaps, and small statistics."""
import math

from . import load

NS = 10**9


def coverage(day, q, gaps, extra=None):
    """The part of a day's result that says what it is based on."""
    n = q.n_day
    t0 = load.day_start_ns(day)
    t1 = t0 + 86400 * NS
    first, last = (q.ts[0], q.ts[n - 1]) if n else (0, 0)
    own = [[max(a, t0), min(b, t1), why] for a, b, why in gaps.items if a < t1 and b > t0]   # within this day
    inside = sum(max(0, min(b, last) - max(a, first)) for a, b, _ in own) / NS
    out = {'day': day, 'quotes': n, 'bad_rows': q.bad, 'first_ns': first, 'last_ns': last,
           'gaps': own[:200], 'gap_count': len(own), 'gap_s': round(sum(b - a for a, b, _ in own) / NS, 3),
           'covered_s': max(0.0, (last - first) / NS - inside)}
    out.update(extra or {})
    return out


def sample(aggs):
    """Sample size and skipped gaps over all the days of a study."""
    covs = [a['cov'] for a in aggs]
    gaps = sorted((g + [c['day']] for c in covs for g in c['gaps']), key=lambda g: g[0] - g[1])
    reasons = {}
    for g in gaps:
        key = 'trades missing' if g[2].endswith('trades missing') else g[2]
        r = reasons.setdefault(key, {'n': 0, 's': 0.0})
        r['n'] += 1
        r['s'] += (g[1] - g[0]) / NS
    return {
        'days': [c['day'] for c in covs if c['quotes']],
        'empty_days': [c['day'] for c in covs if not c['quotes']],
        'quotes': sum(c['quotes'] for c in covs),
        'bad_rows': sum(c['bad_rows'] for c in covs),
        'covered_s': sum(c['covered_s'] for c in covs),
        'first_ns': min((c['first_ns'] for c in covs if c['quotes']), default=0),
        'last_ns': max((c['last_ns'] for c in covs), default=0),
        'gap_count': sum(c['gap_count'] for c in covs),
        'gap_s': sum(c['gap_s'] for c in covs),
        'gap_reasons': [{'reason': k, 'n': v['n'], 's': round(v['s'], 1)} for k, v in sorted(reasons.items())],
        'gaps': [{'start_ns': g[0], 's': round((g[1] - g[0]) / NS, 1), 'reason': g[2]} for g in gaps[:12]],
    }


def add_hist(into, hist):
    for k, v in hist.items():
        k = int(k)
        into[k] = into.get(k, 0) + v
    return into


def quantiles(hist, qs, value=lambda k: k):
    """Quantiles of a weighted histogram {key: weight}; value(key) turns a key into its number."""
    total = sum(hist.values())
    out, acc, keys, i = [], 0.0, sorted(hist), 0
    for q in qs:
        want = q * total
        while i < len(keys) - 1 and acc + hist[keys[i]] < want:
            acc += hist[keys[i]]
            i += 1
        out.append(value(keys[i]) if keys else None)
    return out


def mean_se(n, s, ss):
    """Mean and its standard error from a count, a sum and a sum of squares."""
    if not n:
        return None, None
    m = s / n
    var = max(0.0, ss / n - m * m)
    return m, (math.sqrt(var / (n - 1)) if n > 1 else None)


def spearman(pairs):
    n = len(pairs)
    if n < 10:
        return None

    def ranks(vals):
        order = sorted(range(n), key=vals.__getitem__)
        r, i = [0.0] * n, 0
        while i < n:
            j = i
            while j + 1 < n and vals[order[j + 1]] == vals[order[i]]:
                j += 1
            for k in range(i, j + 1):
                r[order[k]] = (i + j) / 2
            i = j + 1
        return r
    rx, ry = ranks([p[0] for p in pairs]), ranks([p[1] for p in pairs])
    mx = (n - 1) / 2
    sxy = sum((a - mx) * (b - mx) for a, b in zip(rx, ry))
    sxx = sum((a - mx) ** 2 for a in rx)
    syy = sum((b - mx) ** 2 for b in ry)
    return sxy / math.sqrt(sxx * syy) if sxx and syy else None
