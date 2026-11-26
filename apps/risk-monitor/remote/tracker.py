"""Events and the stop signal.

An event opens when a check goes to breach and closes (recovered) when it is ok
again. A breach of a stopping check writes the stop signal once; the stop then
stays until the person clears it on the page. Everything here survives a restart.
"""
import json
import os
import time

from rules import CHECKS, reason

RESEND_S = 30           # the stop is written again when the strategy is not stopped and the breach lasts
KEEP = 50               # closed events kept in state.json, for a late acknowledge


def _num(v):
    return None if v is None or v != v or v in (float('inf'), float('-inf')) else round(v, 6)


class Tracker:
    def __init__(self, folder=None, signal=None):
        self.folder = folder                    # None: nothing is written (a dry run, tests)
        self.signal = signal or (lambda stop, why: None)
        self.open, self.recent = {}, []         # check -> event; closed events, newest last
        self.since = {}                         # check -> [state, unix seconds it began]
        self.stop = None                        # {t, reason, check, event, sent, resent}
        self.seen_clear = None
        self.note = ''
        st = self._load()
        if st:
            self.open, self.recent = st.get('open', {}), st.get('recent', [])
            self.since, self.stop = st.get('since', {}), st.get('stop')
            self.seen_clear = st.get('seen_clear')

    def _load(self):
        try:
            with open(os.path.join(self.folder, 'state.json')) as f:
                return json.load(f)
        except (OSError, ValueError, TypeError):
            return None

    def _save(self, changed, now):
        if not self.folder:
            return
        os.makedirs(os.path.join(self.folder, 'events'), exist_ok=True)
        if changed:
            day = time.strftime('%Y-%m-%d', time.gmtime(now))
            with open(os.path.join(self.folder, 'events', day + '.jsonl'), 'a') as f:
                for ev in changed:
                    f.write(json.dumps(dict(ev, logged=round(now, 3)), separators=(',', ':')) + '\n')
        tmp = os.path.join(self.folder, 'state.json.tmp')
        with open(tmp, 'w') as f:
            json.dump({'open': self.open, 'recent': self.recent[-KEEP:], 'since': self.since,
                       'stop': self.stop, 'seen_clear': self.seen_clear}, f, separators=(',', ':'))
        os.replace(tmp, tmp[:-4])

    def breached_stops(self, checks):
        return [k for k in CHECKS if checks[k]['stops'] and checks[k]['state'] == 'breach']

    def update(self, checks, s, now, maker_state=None):
        """One pass. Returns the events that changed (to log and stream)."""
        changed, before = [], json.dumps([self.since, self.stop, self.seen_clear])
        for key in CHECKS:
            c = checks[key]
            if self.since.get(key, [None])[0] != c['state']:
                self.since[key] = [c['state'], round(now, 3)]
            ev = self.open.get(key)
            if c['state'] == 'breach' and not ev:
                ev = {'id': f'{key}-{int(now * 1000)}', 'kind': 'breach', 'check': key, 'opened': round(now, 3),
                      'value': _num(c['value']), 'limit': c['limit'], 'stops': c['stops'],
                      'stop_sent': False, 'acked': 0, 'recovered': 0, 'reason': reason(key, c)}
                if c['stops'] and not self.stop:
                    self._send(True, ev['reason'], now, key, ev['id'])
                    ev['stop_sent'] = True
                self.open[key] = ev
                changed.append(ev)
            elif c['state'] == 'ok' and ev:
                ev['recovered'] = round(now, 3)
                del self.open[key]
                self.recent.append(ev)
                changed.append(ev)
        # Acknowledged on the page.
        ids = {x.strip() for x in str(s.get('ack') or '').split(',') if x.strip()}
        for ev in list(self.open.values()) + self.recent[-KEEP:]:
            if ev['kind'] == 'breach' and ev['id'] in ids and not ev['acked']:
                ev['acked'] = round(now, 3)
                changed.append(ev)
        still = self.breached_stops(checks)
        # Clear stop pressed on the page: only when nothing that stops is still breached.
        clear_at = s.get('clear_at') or 0
        if self.seen_clear is None:
            self.seen_clear = clear_at
        if clear_at > self.seen_clear:
            self.seen_clear = clear_at
            if self.stop and not still:
                self._send(False, 'cleared', now)
                changed.append(self._action('clear', now))
                self.note = ''
            elif self.stop:
                self.note = 'clear refused: ' + ', '.join(still) + ' still breached'
        # The strategy is not stopped although the stop is on (Resume pressed there, or a new UTC day).
        if self.stop and maker_state and maker_state != 'stopped' and now - self.stop['sent'] > 5:
            if still:
                if now - self.stop['sent'] >= RESEND_S:
                    self.signal(True, reason(still[0], checks[still[0]]))
                    self.stop['sent'], self.stop['resent'] = round(now, 3), self.stop.get('resent', 0) + 1
            else:
                self.stop = None
                changed.append(self._action('released', now))
        if changed or before != json.dumps([self.since, self.stop, self.seen_clear]):
            self._save(changed, now)
        return changed

    def _send(self, stop, why, now, check='', event=''):
        self.signal(stop, why)
        self.stop = {'t': round(now, 3), 'reason': why, 'check': check, 'event': event,
                     'sent': round(now, 3), 'resent': 0} if stop else None

    def _action(self, what, now):
        ev = {'id': f'{what}-{int(now * 1000)}', 'kind': what, 'opened': round(now, 3)}
        self.recent.append(ev)
        return ev
