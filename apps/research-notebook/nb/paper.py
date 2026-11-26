"""Study 4: the paper strategy's simulated fills.

Markout: the mid at fill time + horizon against the fill price, signed so that +
is good for us, on the recorded quotes and the exchange's clock.

PnL, marked to the mid, splits exactly into
  spread earned  = Σ (mid when filled − fill price) × signed size, for quote fills
  flatten cost   = the same for the fills that closed the position at a stop
  inventory      = Σ position held × the mid's move while it was held
using the mid the strategy logged with each fill, and the recorded mid at the
day's first and last quote.
"""
import os

from . import common, load

NS = 10**9
MS = 10**6


def horizons(P):
    return [0] + list(P['markout_ms'])


def _acc(nh):
    return {'n': 0, 's': [0.0] * nh, 'ss': [0.0] * nh, 'usd': [0.0] * nh}


def _carried(froot, d):
    """The position held into a day with no fills: the last fill before it."""
    for back in range(1, 31):
        rows = load.fills(froot, load.next_day(d, -back))
        if rows:
            return float(rows[-1].get('position', 0.0))
    return 0.0


def day(root, froot, d, P):
    product, H = P['paper_product'], horizons(P)
    hmax = int(H[-1] * MS)
    q = load.quotes(root, product, d, head_s=H[-1] / 1000 + 60)
    gaps = load.gaps(root, product, d, q, P['gap_silence_s'])
    fills = load.fills(froot, d)
    ts, mid = q.ts, q.mid
    lim = int(P['gap_silence_s'] * NS)
    has_q = q.n_day > 0
    acc = {}
    skipped = {'no_market_data': 0, 'stale_quote': 0, 'gap': 0, 'end_of_data': 0, 'flatten': 0}
    out = {'fills': len(fills), 'buys': 0, 'sells': 0, 'volume': 0.0, 'spread': 0.0, 'flatten': 0.0,
           'inventory': 0.0, 'no_market': not has_q, 'own_day_pnl': None, 'at_last_fill': None}
    pos = float(fills[0]['position']) - (1 if fills[0]['side'] == 'buy' else -1) * float(fills[0]['size']) \
        if fills else _carried(froot, d)
    out['pos_start'] = pos
    prev_mid = mid[0] if has_q else None
    for f in fills:
        sign = 1 if f['side'] == 'buy' else -1
        price, size, t = float(f['price']), float(f['size']), int(f['exch_ns'])
        fmid = float(f.get('mid') or price)
        if prev_mid is not None:
            out['inventory'] += pos * (fmid - prev_mid)
        prev_mid = fmid
        edge = sign * (fmid - price) * size
        flat = f.get('reason') == 'flatten'
        out['flatten' if flat else 'spread'] += edge
        out['buys' if sign > 0 else 'sells'] += 1
        out['volume'] += price * size
        pos = float(f.get('position', pos + sign * size))
        if flat:
            skipped['flatten'] += 1
            continue
        if not has_q:
            skipped['no_market_data'] += 1
            continue
        i0 = q.at(t)
        if i0 < 0 or t - ts[i0] > lim:
            skipped['stale_quote'] += 1
            continue
        if t + hmax > ts[-1]:
            skipped['end_of_data'] += 1
            continue
        if gaps.items and gaps.overlaps(ts[i0], t + hmax):
            skipped['gap'] += 1
            continue
        for key in ('all', 'buy' if sign > 0 else 'sell'):
            a = acc.setdefault(key, _acc(len(H)))
            a['n'] += 1
            for x, h in enumerate(H):
                move = sign * (mid[q.at(t + int(h * MS))] - price)
                b = move / price * 1e4
                a['s'][x] += b; a['ss'][x] += b * b; a['usd'][x] += move * size
    if fills:
        out['at_last_fill'] = out['spread'] + out['flatten'] + out['inventory']
        out['own_day_pnl'] = fills[-1].get('day_pnl')
    if has_q and prev_mid is not None:
        out['inventory'] += pos * (mid[q.n_day - 1] - prev_mid)
    out['pos_end'] = pos
    out.update({'cov': common.coverage(d, q, gaps), 'acc': acc, 'skipped': skipped})
    return out


def combine(aggs, P):
    H = horizons(P)
    out = {'sample': common.sample(aggs), 'horizons': H, 'product': P['paper_product'], 'daily': [], 'curves': {}}
    tot = {k: 0.0 for k in ('fills', 'buys', 'sells', 'volume', 'spread', 'flatten', 'inventory')}
    acc = {}
    skipped = {}
    for a in aggs:
        for k in tot:
            tot[k] += a[k]
        for k, v in a['skipped'].items():
            skipped[k] = skipped.get(k, 0) + v
        for key, src in a['acc'].items():
            if len(src['s']) != len(H):
                continue
            into = acc.setdefault(key, _acc(len(H)))
            into['n'] += src['n']
            for f in ('s', 'ss', 'usd'):
                into[f] = [x + y for x, y in zip(into[f], src[f])]
        if a['fills'] or a['pos_start']:
            out['daily'].append({k: a[k] for k in ('fills', 'volume', 'spread', 'flatten', 'inventory', 'pos_start',
                                                   'pos_end', 'own_day_pnl', 'at_last_fill', 'no_market')}
                                | {'day': a['cov']['day'], 'total': a['spread'] + a['flatten'] + a['inventory']})
    tot['total'] = tot['spread'] + tot['flatten'] + tot['inventory']
    tot['spread_bps'] = tot['spread'] / tot['volume'] * 1e4 if tot['volume'] else None
    out['totals'] = tot
    out['skipped'] = skipped
    for key in ('all', 'buy', 'sell'):
        a = acc.get(key, _acc(len(H)))
        pts = []
        for x, h in enumerate(H):
            m, se = common.mean_se(a['n'], a['s'][x], a['ss'][x])
            pts.append({'ms': h, 'mean': m, 'se': se, 'usd': a['usd'][x]})
        out['curves'][key] = {'n': a['n'], 'curve': pts}
    return out


def has_day(froot, d):
    return any(os.path.exists(os.path.join(froot, 'fills', d + ext)) for ext in ('.jsonl', '.jsonl.gz'))
