"""Alerts: one message when Risk Monitor raises a breach or a feed goes stale, one when it clears.

Risk Monitor decides what a breach is; this only follows its events file and its
state.json (both read only). Each message is keyed by Risk Monitor's event id and
remembered in this service's state, so a restart repeats nothing.

A flapping check: after a raise for a check, another raise for the same check waits
alert_min_gap_s. If that breach clears while waiting, neither its raise nor its clear
is sent (it is counted and told with the next raise)."""
import json
import os

import conf
from render import dur, when

NAMES = {'position': 'position limit', 'loss': 'day-loss limit', 'stop': 'stop signal',
         'feed_btc': 'BTC-USD feed stale', 'feed_eth': 'ETH-USD feed stale', 'recorder_hb': 'recorder heartbeat',
         'maker_hb': 'strategy heartbeat', 'disk': 'disk space'}
KEEP = 100


def wanted(s):
    return {c.strip() for c in str(s.get('alert_checks') or '').split(',') if c.strip()}


def read_new(st, now):
    """The rows Risk Monitor added to its events file since the last look."""
    folder, today = os.path.join(conf.RISK_DATA, 'events'), conf.day_of(now)
    first = 'follow' not in st
    follow = st.setdefault('follow', {'day': today, 'offset': 0})
    out = []
    for day in ([follow['day']] if follow['day'] == today else [follow['day'], today]):
        offset = follow['offset'] if follow['day'] == day else 0
        try:
            with open(os.path.join(folder, day + '.jsonl'), 'rb') as f:
                size = os.fstat(f.fileno()).st_size
                if first:
                    offset = size               # the first start ever: history is not announced
                elif size < offset:
                    offset = 0
                f.seek(offset)
                data = f.read()
            data = data[:data.rfind(b'\n') + 1]         # whole lines only
            offset += len(data)
            for line in data.splitlines():
                try:
                    row = json.loads(line)
                except ValueError:
                    continue
                if isinstance(row, dict) and row.get('id'):
                    out.append(row)
        except OSError:
            pass
        follow['day'], follow['offset'] = day, offset
    return out


def _message(key, rec, phase, flaps=0):
    name = NAMES.get(rec['check'], rec['check'])
    lines = []
    if phase == 'raise':
        subject = f"[{conf.DESK}] ALERT {name}: {rec['reason'] or 'breached'}"
        lines.append(f"ALERT: {name}. {rec['reason']}".rstrip())
        lines.append(f"Raised by Risk Monitor at {when(rec['opened'])} UTC.")
        if rec.get('stop_sent'):
            lines.append('Risk Monitor sent the stop signal: the paper strategy flattens and stops quoting.')
        if flaps:
            lines.append(f'This check opened and closed {flaps} more time(s) since the last alert; those were not sent.')
        slack = f":red_circle: *ALERT {name}*: {rec['reason']} (since {when(rec['opened'], False)} UTC)"
    else:
        lasted = dur(rec['recovered'] - rec['opened'])
        subject = f"[{conf.DESK}] CLEARED {name} after {lasted}"
        lines.append(f"CLEARED: {name}. It lasted {lasted}.")
        lines.append(f"Raised {when(rec['opened'])} UTC, cleared {when(rec['recovered'])} UTC. It was: {rec['reason']}")
        slack = f":large_green_circle: *CLEARED {name}* after {lasted} (was: {rec['reason']})"
    lines.append('Paper trading only: no real orders.')
    return {'id': f'{key}:{phase}', 'event': key, 'phase': phase, 'subject': subject[:160], 'lines': lines, 'slack': slack}


def step(st, rows, rm, now, s):
    """One pass. rows: new rows of the events file; rm: Risk Monitor's state.json (or None).
    Returns the messages to send; st remembers what was decided."""
    want, gap = wanted(s), float(s.get('alert_min_gap_s') or 0)
    recs, last = st.setdefault('alerts', {}), st.setdefault('last_raise', {})
    flaps = st.setdefault('flaps', {})
    seen = [r for r in rows if r.get('kind') == 'breach']
    if isinstance(rm, dict):
        seen += [e for e in (rm.get('open') or {}).values() if isinstance(e, dict) and e.get('id')]
        seen += [e for e in rm.get('recent') or [] if isinstance(e, dict) and e.get('id') in recs]
        stop = rm.get('stop')
        key = f"stop-{int(stop['t'] * 1000)}" if stop and stop.get('t') else None
        if key:
            seen.append({'id': key, 'check': 'stop', 'opened': stop['t'], 'reason': stop.get('reason') or '', 'recovered': 0})
        ended = max([r.get('opened') or 0 for r in rows if r.get('kind') in ('clear', 'released')], default=0)
        for k, rec in recs.items():
            if rec['check'] == 'stop' and not rec['recovered'] and k != key:
                seen.append({'id': k, 'check': 'stop', 'recovered': ended if ended > rec['opened'] else now})
    out = []
    for ev in seen:
        key, rec = ev['id'], recs.get(ev['id'])
        if not rec:
            if ev.get('check') not in want or not ev.get('opened'):
                continue
            rec = recs[key] = {'check': ev['check'], 'opened': ev['opened'], 'reason': str(ev.get('reason') or ''),
                               'stop_sent': bool(ev.get('stop_sent')), 'recovered': 0, 'raise': '', 'clear': '', 'sent': {}}
            if rec['check'] in last and now - last[rec['check']] < gap:
                rec['raise'], rec['hold_until'] = 'held', last[rec['check']] + gap
            else:
                rec['raise'], last[rec['check']] = 'queued', now
                out.append(_message(key, rec, 'raise', flaps.pop(rec['check'], 0)))
        if ev.get('recovered') and not rec['recovered']:
            rec['recovered'] = ev['recovered']
            if rec['raise'] == 'held':
                rec['raise'] = 'suppressed'
                flaps[rec['check']] = flaps.get(rec['check'], 0) + 1
            elif rec['raise'] == 'queued':
                rec['clear'] = 'queued'
                out.append(_message(key, rec, 'clear'))
    for key, rec in recs.items():               # a held raise whose wait is over, still breached
        if rec['raise'] == 'held' and not rec['recovered'] and now >= rec.get('hold_until', 0):
            rec['raise'], last[rec['check']] = 'queued', now
            out.append(_message(key, rec, 'raise', flaps.pop(rec['check'], 0)))
    if len(recs) > KEEP:
        closed = sorted((k for k, r in recs.items() if r['recovered']), key=lambda k: recs[k]['opened'])
        for k in closed[:len(recs) - KEEP]:
            del recs[k]
    return out
