"""Desk Reports: the service. Paper only: it reads files and sends messages.

It sends no order and writes only under ~/desk-reports-data (state, send log) and
its own folder (status, streams, logs). There is no cron here: the loop below is the
clock, and state.json records the last report sent, so a restart neither repeats
nor skips one.

    python3 reporter.py                  run
    python3 reporter.py --print daily    build today's report, print its text part, send nothing
    python3 reporter.py --print weekly
"""
import copy
import html
import json
import os
import signal
import sys
import threading
import time

os.chdir(os.path.dirname(os.path.abspath(__file__)))
import alerts
import channels
import conf
import render
import report
import sources

try:
    import studio_stream
except Exception:
    studio_stream = None

LATE_S = 120            # a report sent later than this after its time is marked late
CHANNELS = ('email', 'slack')


def log(msg):
    print(time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime()) + ' ' + channels.scrub(msg), flush=True)


def week_days(day):
    end = conf.day_start(day)
    return [conf.day_of(end - i * 86400) for i in range(6, -1, -1)]


class Reporter:
    def __init__(self):
        os.makedirs(os.path.join(conf.DATA, 'sends'), exist_ok=True)
        self.lock = threading.RLock()
        self.state_file = os.path.join(conf.DATA, 'state.json')
        self.st = sources.read_json(self.state_file) or {}
        self.cache = sources.read_json(os.path.join(conf.DATA, 'cache.json')) or {}
        self.built, self.row, self.row_t = {}, '', 0
        for k, v in (('since', time.time()), ('outbox', []), ('reports', {}), ('alerts', {}), ('disk', []), ('last_error', None)):
            self.st.setdefault(k, v)

    def save(self):
        conf.write_json(self.state_file, self.st)

    # ---- which channels a message goes to, decided when it is queued
    def route(self, s, what):
        return {'email': 'pending' if s[f'email_{what}'] and channels.email_ready(s) else 'off',
                'slack': 'pending' if s[f'slack_{what}'] and channels.has('slack_webhook') else 'off'}

    def queue(self, item, s, what, now):
        item.update(t=now, ch=self.route(s, what), err={}, tries=0, next=0)
        self.st['outbox'].append(item)
        log(f"queued {item['id']}")
        return item

    # ---- the clock
    def due(self, kind, now, s, ahead=False):
        at = conf.hhmm(s[f'{kind}_time'])
        last, today = self.st.get(f'last_{kind}') or '', conf.day_start(conf.day_of(now))
        out = []
        for back in (range(0, -9, -1) if ahead else range(15, -1, -1)):
            start = today - back * 86400
            if kind == 'weekly' and conf.WEEKDAYS[time.gmtime(start).tm_wday] != s['weekly_day'].lower()[:3]:
                continue
            t, day = start + at, conf.day_of(start)
            if ahead:
                if t > now and day > last:
                    return t
            elif self.st['since'] < t <= now and day > last:
                out.append((day, t))
        return None if ahead else out[-7:]

    def schedule(self, now, s):
        did = False
        for kind in ('daily', 'weekly'):                # the daily first: the weekly follows it
            for day, t in self.due(kind, now, s):
                late = now - t if now - t > LATE_S else 0
                item = self.queue({'id': f'{kind}-{day}', 'kind': kind, 'day': day, 'as_of': t, 'late_s': round(late)}, s, 'reports', now)
                self.st[f'last_{kind}'] = day
                self.st['reports'][kind] = {'id': item['id'], 'day': day, 'due': t, 'queued': now, 'late_s': round(late),
                                            'ch': dict(item['ch']), 'err': {}}
                did = True
        test = s['test_at']
        if 'seen_test' not in self.st:
            self.st['seen_test'], did = test, True
        elif test > self.st['seen_test']:
            self.st['seen_test'] = test
            item = self.queue({'id': f'test-{int(test)}', 'kind': 'test', 'day': conf.day_of(now), 'as_of': now, 'late_s': 0},
                              s, 'reports', now)
            self.st['reports']['test'] = {'id': item['id'], 'day': item['day'], 'due': now, 'queued': now, 'late_s': 0,
                                          'ch': dict(item['ch']), 'err': {}}
            did = True
        if not self.st['disk'] or now - self.st['disk'][-1][0] >= 3600:
            du = sources.disk()
            if du:
                self.st['disk'] = (self.st['disk'] + [[round(now), du['free']]])[-200:]
                did = True
        return did

    def watch(self, now, s):
        before = json.dumps([self.st.get('follow'), self.st.get('alerts'), self.st.get('flaps')], sort_keys=True)
        rows = alerts.read_new(self.st, now)
        rm = sources.read_json(os.path.join(conf.RISK_DATA, 'state.json'))
        for m in alerts.step(self.st, rows, rm, now, s):
            item = self.queue(dict(m, kind='alert'), s, 'alerts', now)
            self.st['alerts'][m['event']]['sent'][m['phase']] = dict(item['ch'])
        return before != json.dumps([self.st.get('follow'), self.st.get('alerts'), self.st.get('flaps')], sort_keys=True)

    # ---- sending (its own thread, so a slow mail server never stops the clock)
    def content(self, item, s):
        if item['kind'] == 'alert':
            body = ''.join(f'<p style="font-family:Arial,Helvetica,sans-serif;font-size:14px;margin:0 0 8px;">{html.escape(x)}</p>'
                           for x in item['lines'])
            return item['subject'], '\n'.join(item['lines']) + '\n', body, item['slack']
        if item['id'] not in self.built:
            weekly, test = item['kind'] == 'weekly', item['kind'] == 'test'
            rep = report.build('weekly' if weekly else 'daily', week_days(item['day']) if weekly else [item['day']],
                               item['as_of'], s, cache=self.cache, samples=self.st['disk'], late_s=item['late_s'], test=test)
            self.built = {item['id']: (render.subject(rep), render.text(rep), render.html(rep), render.slack(rep))}
            conf.write_json(os.path.join(conf.DATA, 'cache.json'), self.cache)
        return self.built[item['id']]

    def send_one(self):
        now = time.time()
        with self.lock:
            item = next((i for i in self.st['outbox'] if i['next'] <= now), None)
            if not item:
                return False
            item = copy.deepcopy(item)
        s, results = conf.settings(), {}
        todo = [c for c in CHANNELS if item['ch'].get(c) == 'pending']
        try:
            subject, text, page, slack = self.content(item, s) if todo else ('', '', '', '')
        except Exception as e:
            results = {c: channels.scrub(f'could not build it: {type(e).__name__}: {e}') for c in todo}
            todo = []
        for c in todo:
            try:
                channels.send_email(s, subject, text, page) if c == 'email' else channels.send_slack(slack)
                results[c] = ''
            except channels.SendError as e:
                results[c] = str(e)
            except Exception as e:
                results[c] = channels.scrub(f'{type(e).__name__}: {e}')
        now = time.time()
        with self.lock:
            live = next((i for i in self.st['outbox'] if i['id'] == item['id']), None)
            if not live:
                return True
            month = time.strftime('%Y-%m', time.gmtime(now))
            with open(os.path.join(conf.DATA, 'sends', month + '.jsonl'), 'a') as f:
                for c, err in results.items():
                    f.write(json.dumps({'t': round(now, 3), 'id': item['id'], 'kind': item['kind'], 'channel': c,
                                        'ok': not err, 'error': err, 'try': live['tries'] + 1}, separators=(',', ':')) + '\n')
            for c, err in results.items():
                live['ch'][c] = 'pending' if err else 'sent'
                live['err'][c] = err
                log(f"{item['id']} by {c}: " + (f'FAILED: {err}' if err else 'sent'))
                if err:
                    self.st['last_error'] = {'t': round(now), 'id': item['id'], 'channel': c, 'error': err}
            live['tries'] += 1
            waiting = [c for c in CHANNELS if live['ch'].get(c) == 'pending']
            if waiting and now - live['t'] > s['retry_hours'] * 3600:
                for c in waiting:
                    live['ch'][c] = 'failed'
                log(f"{item['id']}: gave up after {s['retry_hours']:g} h")
                waiting = []
            if waiting:
                live['next'] = now + min(600, 15 * 2 ** min(live['tries'], 6))
            else:
                self.st['outbox'].remove(live)
                self.built.pop(item['id'], None)
            where = self.st['reports'].get('test' if item['kind'] == 'test' else item['kind']) if item['kind'] != 'alert' \
                else None
            if where and where.get('id') == item['id']:
                where.update(ch=dict(live['ch']), err=dict(live['err']), sent=round(now), tries=live['tries'])
            rec = self.st['alerts'].get(item.get('event')) if item['kind'] == 'alert' else None
            if rec:
                rec['sent'][item['phase']] = dict(live['ch'])
            self.save()
        return True

    def work(self):
        while True:
            try:
                busy = self.send_one()
            except Exception as e:
                log(f'send pass failed: {type(e).__name__}: {e}')
                busy = False
            time.sleep(0.2 if busy else 1)

    # ---- what the page and Studio see
    def publish(self, now, s):
        st = self.st
        failing = [i for i in st['outbox'] if any(i['err'].values())]
        failed = [k for k in ('daily', 'weekly') if 'failed' in (st['reports'].get(k) or {}).get('ch', {}).values()]
        bad = bool(failing or failed)
        err = st['last_error']['error'] if bad and st['last_error'] else ''
        daily = st['reports'].get('daily')
        note = (f"last daily {daily['day']}" if daily else 'no report sent yet') + \
            f" · next {time.strftime('%a %H:%M', time.gmtime(self.due('daily', now, s, True) or 0))} UTC" + \
            (f" · {len(st['outbox'])} waiting" if st['outbox'] else '')
        os.makedirs('status', exist_ok=True)
        conf.write_json('status/reporter.json', {'t': now, 'ok': not bad, 'last': now, 'lag': 0, 'error': err, 'note': note})
        recent = sorted(st['alerts'].items(), key=lambda kv: kv[1]['opened'])[-8:]
        row = {'since': round(st['since']), 'reports': st['reports'], 'next_daily': self.due('daily', now, s, True),
               'next_weekly': self.due('weekly', now, s, True),
               'alerts': [dict(id=k, **{f: r.get(f) for f in ('check', 'opened', 'reason', 'recovered', 'raise', 'clear', 'sent')})
                          for k, r in recent],
               'waiting': [{'id': i['id'], 'tries': i['tries'], 'next': round(i['next']), 'err': i['err']} for i in st['outbox']][:10],
               'failing': bad, 'last_error': st['last_error'],
               'secrets': {'slack_webhook': channels.has('slack_webhook'), 'smtp_password': channels.has('smtp_password')},
               'settings': s}
        text = json.dumps(row, sort_keys=True)
        if studio_stream and (text != self.row or now - self.row_t >= 60):
            self.row, self.row_t = text, now
            try:
                studio_stream.write('state', row, keep_days=2)
            except Exception as e:
                log(f'stream: {e}')

    def tick(self):
        now, s = time.time(), conf.settings()
        with self.lock:
            a = self.schedule(now, s)
            b = self.watch(now, s)
            if a or b:
                self.save()
            self.publish(now, s)

    def run(self):
        log(f'desk reports: started; data in {conf.DATA}; paper only')
        threading.Thread(target=self.work, daemon=True).start()
        while True:
            start = time.monotonic()
            try:
                self.tick()
            except Exception as e:
                log(f'tick failed: {type(e).__name__}: {e}')
                try:
                    conf.write_json('status/reporter.json', {'t': time.time(), 'ok': False, 'last': 0, 'lag': 0,
                                                             'error': channels.scrub(repr(e)), 'note': 'a pass failed'})
                except OSError:
                    pass
            time.sleep(max(0.2, 1.0 - (time.monotonic() - start)))


def _term(*_):
    raise SystemExit(0)


if __name__ == '__main__':
    signal.signal(signal.SIGTERM, _term)
    if '--print' in sys.argv:
        kind, now = sys.argv[sys.argv.index('--print') + 1], time.time()
        day = conf.day_of(now)
        rep = report.build(kind, week_days(day) if kind == 'weekly' else [day], now, conf.settings(), test=True)
        print(render.subject(rep) + '\n\n' + render.text(rep) + '\n--- Slack ---\n' + render.slack(rep))
    else:
        Reporter().run()
