"""Builds one report as plain data (render.py turns it into HTML, text and Slack).

Fill rules are never mixed: every fill belongs to exactly one group, by the mark it
carries (rule_of). Fills with no mark were made under the original rule. Flatten
fills (a stop closing the position) are not made by a fill rule and are kept apart."""
import os
import time

import conf
import sources
from _components.markouts import HORIZONS, summary

ORIGINAL = 'original rule'
LATENCY = 'latency-aware rule'
WHAT = {
    ORIGINAL: "any trade strictly through the quote fills it; the quote's age is not checked. It is known to "
              "fill quotes a real exchange could not have filled, so read these numbers with that in mind.",
    LATENCY: "a quote fills only on a trade whose exchange time is later than the quote's trigger plus the "
             "latency setting.",
}
PROBLEM = ('error', 'disconnect', 'reconnect', 'fail', 'pause', 'gap', 'timeout')


def rule_of(fill):
    """The fill rule a fill was made under, from its mark (fill_rule, or rule)."""
    v = fill.get('fill_rule') or fill.get('rule')
    text = str(v).strip().lower() if v else ''
    if text in ('', 'original', 'through', 'v1', 'none'):
        return ORIGINAL
    if 'latency' in text:
        ms = fill.get('latency_ms')
        return LATENCY + (f' ({ms:g} ms)' if isinstance(ms, (int, float)) and not isinstance(ms, bool) else '')
    return text if text.endswith('rule') else text + ' rule'


def _side_stats(fills):
    out = {k: {'n': 0, 'size': 0.0, 'notional': 0.0} for k in ('buy', 'sell', 'all')}
    for f in fills:
        for k in (f.get('side'), 'all'):
            if k in out:
                out[k]['n'] += 1
                out[k]['size'] += float(f.get('size') or 0)
                out[k]['notional'] += float(f.get('size') or 0) * float(f.get('price') or 0)
    return out


def _pnl(fills):
    return sum(float(f.get('fill_pnl') or 0) for f in fills)


def _group(fills):
    groups = {}
    for f in fills:
        groups.setdefault('flatten' if f.get('reason') == 'flatten' else rule_of(f), []).append(f)
    return groups


def _trading(days, as_of, as_of_ns):
    fdir, mdir = os.path.join(conf.MAKER_DATA, 'fills'), os.path.join(conf.MAKER_DATA, 'markouts')
    marks, every, by_day = {}, [], []
    for d in days + [conf.day_of(conf.day_start(days[-1]) + 86400)]:      # a markout is logged the day it completes
        for r in sources.rows(mdir, d):
            marks[r.get('id')] = r
    for d in days:
        fills = sources.upto(fdir, d, as_of_ns)
        snap = sources.last_snapshot(d, as_of_ns) or {}
        end = conf.day_start(d) + 86400
        every += fills
        by_day.append({
            'day': d, 'to': None if as_of >= end else time.strftime('%H:%M', time.gmtime(as_of)),
            'has': bool(fills or snap), 'fills': len(fills), 'realised': _pnl(fills),
            'by_rule': {k: _pnl(v) for k, v in _group(fills).items()},
            'unrealised': snap.get('unrealised'), 'position': snap.get('position'),
            'day_pnl': snap.get('day_pnl'), 'mid': snap.get('mid'), 'state': snap.get('state')})
    groups = _group(every)
    flat = groups.pop('flatten', [])
    rules = []
    for label in sorted(groups, key=lambda k: (k != ORIGINAL, k)):
        fs = groups[label]
        done = [marks[f['id']] for f in fs
                if f.get('id') in marks and marks[f['id']].get('local_ns') == f.get('local_ns')
                and f['local_ns'] + max(HORIZONS) * 10**9 <= as_of_ns]
        rules.append({'label': label, 'what': WHAT.get(LATENCY if label.startswith(LATENCY) else label, ''),
                      'sides': _side_stats(fs), 'realised': _pnl(fs), 'markouts': summary(done, HORIZONS)})
    return by_day, rules, {'n': len(flat), 'size': sum(float(f.get('size') or 0) for f in flat), 'pnl': _pnl(flat)}


def _risk(days, as_of, as_of_ns):
    merged = {}
    for d in days:
        for r in sources.rows(os.path.join(conf.RISK_DATA, 'events'), d):
            if r.get('id') and (r.get('opened') or 0) <= as_of:
                merged[r['id']] = r                     # one row per change: the newest wins
    events = []
    for e in sorted(merged.values(), key=lambda e: e.get('opened') or 0):
        if e.get('kind') != 'breach':
            continue
        rec = e.get('recovered') or 0
        rec = rec if 0 < rec <= as_of else 0
        events.append({'check': e.get('check'), 'reason': e.get('reason') or '', 'opened': e['opened'],
                       'recovered': rec, 'lasted': (rec or as_of) - e['opened'], 'stop_sent': bool(e.get('stop_sent'))})
    stops, stale, cur, quiet = [], {'n': 0, 'seconds': 0.0}, None, None
    for d in days:
        for r in sources.upto(os.path.join(conf.MAKER_DATA, 'events'), d, as_of_ns):
            t, kind = r['local_ns'] / 1e9, r.get('type')
            if kind == 'stop':
                cur = {'t': t, 'by': r.get('by') or '', 'reason': r.get('reason') or '', 'ended': 0}
                stops.append(cur)
            elif kind in ('resume', 'day') and cur:
                cur['ended'], cur = t, None
            elif kind == 'feed_stale':
                quiet = t
                stale['n'] += 1
            elif kind == 'feed_ok' and quiet:
                stale['seconds'] += t - quiet
                quiet = None
    if quiet:
        stale['seconds'] += as_of - quiet
    for s in stops:
        s['lasted'] = (s['ended'] or as_of) - s['t']
    return events, stops, stale


def _recorder(days, as_of, as_of_ns, cache, live):
    hb = (sources.read_json(os.path.join(conf.RECORDER, 'heartbeat.json')) or {}) if live else {}
    out, first_last_day = [], 0
    for p in conf.PRODUCTS:
        n = {'quotes': 0, 'trades': 0}
        minutes, restarts = 0.0, 0
        for d in days:
            span = []
            for kind in n:
                key = f'{p}/{kind}/{d}'
                whole = as_of > conf.day_start(d) + 86400 + 120
                st = cache.get(key) if whole else None
                if not st:
                    st = sources.csv_stats(p, kind, d, as_of_ns)
                    if whole:
                        cache[key] = st                 # a finished day does not change
                n[kind] += st['rows']
                if st['rows']:
                    span += [st['first_ns'], st['last_ns']]
                    if d == days[-1]:
                        first_last_day = min(first_last_day or st['first_ns'], st['first_ns'])
                restarts = max(restarts, 0) + (max(0, st['parts'] - 1) if kind == 'quotes' else 0)
            if span:
                minutes += (max(span) - min(span)) / 60e9
        gaps = [g for d in days for g in sources.rows(os.path.join(conf.MARKET_DATA, 'gaps'), d)
                if g.get('product') == p and (g.get('start_ns') or 0) <= as_of_ns]
        total = n['quotes'] + n['trades']
        out.append({'product': p, 'quotes': n['quotes'], 'trades': n['trades'], 'minutes': minutes,
                    'per_min': total / minutes if minutes >= 1 else None,
                    'now_per_min': ((hb.get('products') or {}).get(p) or {}).get('msgs_min'),
                    'gaps': len(gaps), 'gap_s': sum(float(g.get('seconds') or 0) for g in gaps),
                    'missed': sum(int(g.get('missed_trades') or 0) for g in gaps), 'restarts': restarts,
                    'list': [{'start': (g.get('start_ns') or 0) / 1e9, 'seconds': float(g.get('seconds') or 0),
                              'reason': str(g.get('reason') or '')} for g in gaps[-10:]]})
    log = {'starts': 0, 'problems': 0, 'last': ''}
    try:
        with open(os.path.join(conf.RECORDER, 'logs', 'recorder.log'), 'rb') as f:
            f.seek(max(0, os.fstat(f.fileno()).st_size - 400_000))
            for line in f.read().decode('utf-8', 'replace').splitlines():
                if line[:10] not in days or line[:20] > time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime(as_of)):
                    continue
                low = line.lower()
                if 'recorder started' in low:
                    log['starts'] += 1
                elif any(w in low for w in PROBLEM):
                    log['problems'] += 1
                    log['last'] = line[:160]
    except OSError:
        pass
    return out, log, first_last_day


def _disk(days, as_of, first_ns, samples):
    du = sources.disk()
    folders = [{'path': p.replace(os.path.expanduser('~'), '~'), 'bytes': sources.folder_bytes(p)}
               for p in (conf.MARKET_DATA, conf.MAKER_DATA, conf.RISK_DATA, conf.DATA)]
    out = {'free': du and du['free'], 'total': du and du['total'], 'used': du and du['used'], 'folders': folders,
           'per_day': None, 'days_left': None, 'trend_per_day': None, 'trend_days_left': None}
    if not du:
        return out
    day = days[-1]
    written = sum(sources.folder_bytes(p, prefix=day) for p in (conf.MARKET_DATA, conf.MAKER_DATA, conf.RISK_DATA))
    began = max(conf.day_start(day), first_ns / 1e9) if first_ns else conf.day_start(day)
    elapsed = min(as_of, conf.day_start(day) + 86400) - began
    if written and elapsed >= 600:
        out['per_day'] = written / elapsed * 86400
        out['days_left'] = du['free'] / out['per_day']
    old = [s for s in samples or [] if 6 * 3600 <= as_of - s[0] <= 8 * 86400]
    if old:                                             # the whole disk, whoever fills it
        t0, free0 = old[0]
        fall = (free0 - du['free']) / (as_of - t0) * 86400
        out['trend_per_day'] = fall
        out['trend_days_left'] = du['free'] / fall if fall > 0 else None
    return out


def build(kind, days, as_of, s, cache=None, samples=None, late_s=0, test=False, now=None):
    """kind: daily | weekly. days: UTC days, oldest first. as_of: unix seconds; nothing later is counted."""
    now = time.time() if now is None else now
    as_of_ns = int(as_of * 1e9)
    by_day, rules, flatten = _trading(days, as_of, as_of_ns)
    prev = None                 # a daily also shows the day before, whole: the hours after its own report
    if kind == 'daily':
        prev = _trading([conf.day_of(conf.day_start(days[0]) - 86400)], as_of, as_of_ns)[0][0]
    events, stops, stale = _risk(days, as_of, as_of_ns)
    recorder, reclog, first_ns = _recorder(days, as_of, as_of_ns, {} if cache is None else cache, now - as_of < 120)
    return {'kind': kind, 'days': days, 'as_of': as_of, 'built': now, 'late_s': late_s, 'test': test,
            'min_n': int(s.get('min_n') or 0), 'by_day': by_day, 'prev': prev, 'rules': rules, 'flatten': flatten,
            'events': events, 'stops': stops, 'stale': stale, 'recorder': recorder, 'reclog': reclog,
            'disk': _disk(days, as_of, first_ns, samples)}
