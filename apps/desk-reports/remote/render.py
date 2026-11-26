"""One report as an HTML email, a plain-text part and a short Slack message.

sections() makes every table once, as strings; the HTML and the text are both
drawn from it, so they carry the same numbers."""
import html as _html
import time

import conf

DASH = '–'


def usd(v):
    return DASH if v is None else f'{v:+,.2f}'


def qty(v, sign=False):
    return DASH if v is None else (f'{v:+.4f}' if sign else f'{v:.4f}')


def dur(s):
    s = int(max(0, s))
    if s < 60:
        return f'{s} s'
    if s < 3600:
        return f'{s // 60} m {s % 60:02d} s'
    if s < 86400:
        return f'{s // 3600} h {s % 3600 // 60:02d} m'
    return f'{s // 86400} d {s % 86400 // 3600} h'


def when(t, day=True):
    return time.strftime('%Y-%m-%d %H:%M:%S' if day else '%H:%M:%S', time.gmtime(t))


def size(b):
    if b is None:
        return DASH
    for unit, div in (('TB', 1e12), ('GB', 1e9), ('MB', 1e6), ('kB', 1e3)):
        if b >= div:
            return f'{b / div:,.1f} {unit}'
    return f'{int(b)} B'


def days_left(d):
    return DASH if d is None else 'over 10 years' if d > 3650 else f'{d:,.0f} days'


def markout(cell, min_n):
    n = cell['n']
    if n < max(1, min_n) or cell['avg_bps'] is None:
        return f'too few (n={n})'
    return f"{cell['avg_bps']:+.2f} bps (n={n})"


def used_pct(d):
    """As df shows it: used out of what is used or free to this user, rounded up."""
    return -(-d['used'] * 100 // (d['used'] + d['free']))


def _right(s):
    """Which columns hold numbers (right-aligned); the first never is."""
    def num(c):
        return c == '' or c[0] in '+-0123456789' + DASH or c.startswith(('too few', 'over '))
    return [i > 0 and all(num(r[i]) for r in s['rows']) for i in range(len(s['rows'][0]))]


def _day(d):
    return d['day'] + (f" (to {d['to']})" if d['to'] else '')


def period(rep):
    days = rep['days']
    return days[0] if len(days) == 1 else f'{days[0]} to {days[-1]}'


def headline(rep):
    """The numbers Slack gets, and the top of the email."""
    seen = [d for d in rep['by_day'] if d['has']]
    pnl = sum(d['day_pnl'] or 0 for d in seen) if seen else None
    out = [('Paper PnL', f"{usd(pnl)} USD (realised {usd(sum(d['realised'] for d in seen))})" if seen else 'no data')]
    for r in rep['rules']:
        s = r['sides']
        out.append((f"Fills, {r['label']}", f"{s['buy']['n']} buy / {s['sell']['n']} sell"))
        out.append((f"30 s markout, {r['label']}", markout(r['markouts']['all'][30], rep['min_n'])))
    if not rep['rules']:
        out.append(('Fills', 'none'))
    stops, open_ev = rep['stops'], [e for e in rep['events'] if not e['recovered']]
    out.append(('Stops', f"{len(stops)}" + (f", {len(rep['events'])} risk events" if rep['events'] else '')
                + (f' ({len(open_ev)} still open)' if open_ev else '')))
    out.append(('Recorder gaps', ', '.join(f"{r['product']} {r['gaps']}" for r in rep['recorder'])))
    d = rep['disk']
    if d['free'] is not None:
        left = min([x for x in (d['days_left'], d['trend_days_left']) if x is not None], default=None)
        out.append(('Disk', f"{size(d['free'])} free, {used_pct(d):.0f}% used, {days_left(left)} left"))
    return out


def sections(rep):
    out, n_min, weekly = [], rep['min_n'], rep['kind'] == 'weekly'
    seen = [d for d in rep['by_day'] if d['has']]
    rows = [[_day(d), usd(d['realised']), usd(d['unrealised']), usd(d['day_pnl']), qty(d['position'], True),
             str(d['fills']), ', '.join(k for k in d['by_rule'] if k != 'flatten') or DASH] for d in seen]
    prev = rep.get('prev')
    if prev and prev['has']:
        rows.insert(0, [prev['day'] + ' (whole day)', usd(prev['realised']), usd(prev['unrealised']), usd(prev['day_pnl']),
                        qty(prev['position'], True), str(prev['fills']),
                        ', '.join(k for k in prev['by_rule'] if k != 'flatten') or DASH])
    if weekly and len(seen) > 1:
        rows.append(['Total', usd(sum(d['realised'] for d in seen)), '', usd(sum(d['day_pnl'] or 0 for d in seen)),
                     '', str(sum(d['fills'] for d in seen)), ''])
    missing = len(rep['by_day']) - len(seen)
    out.append({'title': 'Paper PnL by day (the whole book)',
                'note': 'USD; position in BTC. Realised is what the day\'s fills realised. Unrealised and position are the '
                        'book\'s at the end of the day (or at the report time), marked at the mid. The book is one position: '
                        'when a day has fills under more than one rule, only its realised PnL can be split by rule (below).'
                        + (' The day before is shown whole, with the hours after its own report.' if prev and prev['has'] else '')
                        + (f' {missing} of the {len(rep["by_day"])} days have no files.' if missing else ''),
                'head': ['Day (UTC)', 'Realised', 'Unrealised', 'Day PnL', 'End position', 'Fills', 'Fill rules'],
                'rows': rows, 'empty': 'No strategy files for this period.'})
    for r in rep['rules']:
        line = f"Fill rule of this table: {r['label']}: {r['what']}".rstrip(': ')
        s = r['sides']
        out.append({'title': f"Fills and volume: {r['label']}", 'note': line,
                    'head': ['Side', 'Fills', 'BTC', 'USD volume'],
                    'rows': [[name, str(s[k]['n']), qty(s[k]['size']), f"{s[k]['notional']:,.2f}"]
                             for k, name in (('buy', 'Buy'), ('sell', 'Sell'), ('all', 'Both'))]})
        m = r['markouts']
        out.append({'title': f"Markouts: {r['label']}",
                    'note': line + f' Average, weighted by size, in the fill\'s favour (positive: the fill made money); '
                                   f'n is the number of fills. Under {n_min} fills it reads \'too few\'.',
                    'head': ['Side', 'after 1 s', 'after 5 s', 'after 30 s'],
                    'rows': [[name] + [markout(m[k][h], n_min) for h in (1, 5, 30)]
                             for k, name in (('buy', 'Buy'), ('sell', 'Sell'), ('all', 'Both'))]})
    if not rep['rules']:
        out.append({'title': 'Fills, volume and markouts', 'note': '', 'head': [], 'rows': [],
                    'empty': 'No fills in this period.'})
    rows = [[r['label'], usd(r['realised']), str(r['sides']['all']['n'])] for r in rep['rules']]
    if rep['flatten']['n']:
        rows.append(['stop flattening (not a fill rule)', usd(rep['flatten']['pnl']), str(rep['flatten']['n'])])
    if rows:
        out.append({'title': 'Realised PnL by fill rule', 'note': 'USD. One row per rule; rules are never added together.',
                    'head': ['Fills made under', 'Realised', 'Fills'], 'rows': rows})
    out.append({'title': 'Risk events (from Risk Monitor)', 'note': '',
                'head': ['Check', 'What', 'Opened (UTC)', 'Lasted', 'Stop sent'],
                'rows': [[e['check'], e['reason'], when(e['opened']),
                          dur(e['lasted']) + ('' if e['recovered'] else ', still open'), 'yes' if e['stop_sent'] else '']
                         for e in rep['events']], 'empty': 'None.'})
    out.append({'title': 'Stops (the paper strategy)', 'note': '', 'head': ['By', 'Reason', 'When (UTC)', 'Lasted'],
                'rows': [[s['by'], s['reason'], when(s['t']), dur(s['lasted']) + ('' if s['ended'] else ', still stopped')]
                         for s in rep['stops']], 'empty': 'None.'})
    st, lg = rep['stale'], rep['reclog']
    note = f"Messages are quote and trade rows in the recorded files. The strategy saw the feed go stale {st['n']} time(s)" \
           + (f", {dur(st['seconds'])} in all" if st['n'] else '') + f". Recorder log: {lg['starts']} start(s), " \
           f"{lg['problems']} problem line(s)" + (f", the last: {lg['last']}" if lg['last'] else '') + '.'
    for r in rep['recorder']:
        for g in r['list']:
            note += f" Gap {r['product']} {when(g['start'])}, {dur(g['seconds'])}: {g['reason']}."
    out.append({'title': 'Recorder: gaps and message rates', 'note': note,
                'head': ['Product', 'Quotes', 'Trades', 'Per minute', 'Per minute now', 'Gaps', 'Gap time', 'Missed trades', 'Restarts'],
                'rows': [[r['product'], f"{r['quotes']:,}", f"{r['trades']:,}",
                          DASH if r['per_min'] is None else f"{r['per_min']:,.0f}",
                          DASH if r['now_per_min'] is None else f"{r['now_per_min']:,.0f}",
                          str(r['gaps']), dur(r['gap_s']) if r['gaps'] else DASH, str(r['missed']), str(r['restarts'])]
                         for r in rep['recorder']]})
    d = rep['disk']
    rows = []
    if d['free'] is not None:
        rows += [['Free', size(d['free'])], ['Used', f"{used_pct(d):.0f}% of {size(d['total'])}"]]
    rows += [[f['path'], size(f['bytes'])] for f in d['folders']]
    rows += [['Written by the data folders', DASH if d['per_day'] is None else size(d['per_day']) + ' a day'],
             ['Days left at that rate', days_left(d['days_left'])]]
    if d['trend_per_day'] is not None:
        rows += [['Whole disk, free space', ('falling ' + size(d['trend_per_day']) + ' a day') if d['trend_per_day'] > 0 else 'not falling'],
                 ['Days left at the whole disk\'s rate', days_left(d['trend_days_left'])]]
    out.append({'title': 'Disk on trade1', 'note': 'The rate is the last day\'s files, before finished days are compressed.',
                'head': ['', ''], 'rows': rows})
    return out


def subject(rep):
    name = 'Weekly' if rep['kind'] == 'weekly' else 'Daily'
    return f"[{conf.DESK}] {'TEST: ' if rep['test'] else ''}{name} report {period(rep)}" \
           f"{' (late)' if rep['late_s'] else ''}, paper"


def first_lines(rep):
    name = 'Weekly' if rep['kind'] == 'weekly' else 'Daily'
    out = [('TEST. ' if rep['test'] else '') + f"{name} desk report, {period(rep)} (UTC days), data to "
           f"{when(rep['as_of'])} UTC. Paper trading only: no real orders."]
    if rep['late_s']:
        out.append(f"LATE: it was due {when(rep['as_of'])} UTC and is sent {dur(rep['late_s'])} late "
                   f"(the service was not running). It counts nothing after the time it was due.")
    return out


def text(rep):
    out = first_lines(rep) + ['']
    out += [f'{k}: {v}' for k, v in headline(rep)]
    for s in sections(rep):
        out += ['', s['title'].upper()]
        if s['note']:
            out.append(s['note'])
        if not s['rows']:
            out.append(s.get('empty', 'None.'))
            continue
        table = ([s['head']] if any(s['head']) else []) + s['rows']
        wide = [max(len(r[i]) for r in table) for i in range(len(table[0]))]
        right = _right(s)
        for r in table:
            out.append('  '.join(c.rjust(wide[i]) if right[i] else c.ljust(wide[i]) for i, c in enumerate(r)).rstrip())
    return '\n'.join(out) + '\n'


def html(rep):
    e = _html.escape
    td = 'padding:6px 12px 6px 0;border-bottom:1px solid #e3e7ee;font-size:13px;white-space:nowrap;'
    out = ['<div style="font-family:Arial,Helvetica,sans-serif;color:#172033;max-width:860px;margin:0 auto;padding:8px 4px;">']
    lines = first_lines(rep)
    out.append(f'<p style="font-size:15px;font-weight:bold;margin:0 0 6px;">{e(lines[0])}</p>')
    for extra in lines[1:]:
        out.append(f'<p style="font-size:13px;color:#b45309;font-weight:bold;margin:0 0 6px;">{e(extra)}</p>')
    out.append('<table cellspacing="0" cellpadding="0" style="border-collapse:collapse;margin:10px 0 4px;">')
    for k, v in headline(rep):
        out.append(f'<tr><td style="{td}color:#5d6b82;">{e(k)}</td><td style="{td}font-weight:bold;">{e(v)}</td></tr>')
    out.append('</table>')
    for s in sections(rep):
        out.append(f'<h3 style="font-size:14px;margin:22px 0 4px;color:#0f2747;">{e(s["title"])}</h3>')
        if s['note']:
            out.append(f'<p style="font-size:12px;color:#5d6b82;margin:0 0 6px;line-height:1.45;">{e(s["note"])}</p>')
        if not s['rows']:
            out.append(f'<p style="font-size:13px;margin:0;">{e(s.get("empty", "None."))}</p>')
            continue
        out.append('<table cellspacing="0" cellpadding="0" style="border-collapse:collapse;">')
        side = ['right' if x else 'left' for x in _right(s)]
        if any(s['head']):
            out.append('<tr>' + ''.join(
                f'<th style="{td}text-align:{side[i]};color:#5d6b82;font-weight:normal;">{e(h)}</th>'
                for i, h in enumerate(s['head'])) + '</tr>')
        for r in s['rows']:
            out.append('<tr>' + ''.join(f'<td style="{td}text-align:{side[i]};">{e(c)}</td>'
                                        for i, c in enumerate(r)) + '</tr>')
        out.append('</table>')
    out.append('<p style="font-size:11px;color:#5d6b82;margin:22px 0 0;">Desk Reports on trade1. Paper trading only.</p></div>')
    return '\n'.join(out)


def slack(rep):
    name = 'Weekly' if rep['kind'] == 'weekly' else 'Daily'
    top = ('TEST. ' if rep['test'] else '') + f"*{name} desk report {period(rep)}* (paper, to {when(rep['as_of'])} UTC)" \
        + (f", sent {dur(rep['late_s'])} late" if rep['late_s'] else '')
    return '\n'.join([top] + [f'• {k}: {v}' for k, v in headline(rep)])
