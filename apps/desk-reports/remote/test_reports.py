"""Tests on made-up files in a temp folder: python3 test_reports.py"""
import gzip
import json
import os
import sys
import tempfile
import unittest

HERE = os.path.dirname(os.path.abspath(__file__))
TMP = tempfile.mkdtemp(prefix='desk-reports-test-')
for name in ('MAKER_DATA', 'RISK_DATA', 'RECORDER', 'MARKET_DATA', 'DATA', 'SECRETS'):
    os.environ['DR_' + name] = os.path.join(TMP, name.lower())
sys.path[:0] = [HERE, os.path.dirname(HERE)]        # _components sits beside remote/ in the app
os.chdir(TMP)

import alerts
import channels
import conf
import render
import report
from reporter import Reporter

DAY = '2026-11-26'
T0 = conf.day_start(DAY)
S = dict(conf.DEFAULTS)


def put(folder, name, rows):
    os.makedirs(folder, exist_ok=True)
    with open(os.path.join(folder, name), 'w') as f:
        for r in rows:
            f.write(json.dumps(r) + '\n')


def fill(i, side, price, t, pnl=0.0, **more):
    return dict({'id': i, 'side': side, 'price': price, 'size': 0.01, 'reason': 'through', 'fill_pnl': pnl,
                 'local_ns': int((T0 + t) * 1e9)}, **more)


def mark(f, m):
    return dict(f, m1=m, m5=m, m30=m)


class Reports(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        old = [fill(i, 'sell' if i % 2 else 'buy', 60000.0, 100 + i, 1.0) for i in range(40)]
        new = [fill(100 + i, 'buy', 60000.0, 5000 + i, 2.0, fill_rule='latency', latency_ms=250) for i in range(3)]
        flat = [fill(900, 'sell', 60000.0, 6000, -5.0, reason='flatten')]
        put(os.path.join(conf.MAKER_DATA, 'fills'), DAY + '.jsonl', old + new + flat)
        put(os.path.join(conf.MAKER_DATA, 'markouts'), DAY + '.jsonl', [mark(f, 6.0) for f in old] + [mark(f, -12.0) for f in new])
        put(os.path.join(conf.MAKER_DATA, 'snapshots'), DAY + '.jsonl',
            [{'local_ns': int((T0 + t) * 1e9), 'realised': 1.0, 'unrealised': 0.5, 'position': 0.02, 'day_pnl': t / 1000}
             for t in (50, 7000, 80000)])
        put(os.path.join(conf.MAKER_DATA, 'events'), DAY + '.jsonl',
            [{'local_ns': int((T0 + 6000) * 1e9), 'type': 'stop', 'by': 'risk', 'reason': 'position'},
             {'local_ns': int((T0 + 6090) * 1e9), 'type': 'resume', 'by': 'risk'}])
        os.makedirs(os.path.join(conf.MARKET_DATA, 'BTC-USD', 'quotes'))
        with gzip.open(os.path.join(conf.MARKET_DATA, 'BTC-USD', 'quotes', DAY + '.000.csv.gz'), 'wt') as f:
            f.write('recv_ns,exch_ns\n' + ''.join(f'{int((T0 + 60 * i) * 1e9)},0\n' for i in range(121)))
        cls.rep = report.build('daily', [DAY], T0 + 7200, S, now=T0 + 7200)

    def test_rules_are_never_mixed(self):
        rules = {r['label']: r for r in self.rep['rules']}
        self.assertEqual(set(rules), {'original rule', 'latency-aware rule (250 ms)'})
        self.assertEqual(rules['original rule']['sides']['all']['n'], 40)       # no mark: the original rule
        self.assertEqual(rules['latency-aware rule (250 ms)']['sides']['buy']['n'], 3)
        self.assertAlmostEqual(rules['original rule']['realised'], 40.0)
        self.assertEqual(self.rep['flatten'], {'n': 1, 'size': 0.01, 'pnl': -5.0})
        self.assertAlmostEqual(rules['original rule']['markouts']['all'][30]['avg_bps'], 1.0)

    def test_too_few_and_n(self):
        text = render.text(self.rep)
        self.assertIn('+1.00 bps (n=40)', text)
        self.assertIn('too few (n=3)', text)
        self.assertIn('too few (n=20)', text)           # 20 buys under the original rule
        self.assertNotIn('-2.00 bps', text)             # the 3 latency fills never show a number

    def test_as_of_cuts(self):
        d = self.rep['by_day'][0]
        self.assertEqual((d['to'], d['fills'], d['day_pnl']), ('02:00', 44, 7.0))
        early = report.build('daily', [DAY], T0 + 120, S, now=T0 + 99999)
        self.assertEqual(early['by_day'][0]['fills'], 21)
        self.assertEqual(early['recorder'][0]['quotes'], 3)
        self.assertEqual(early['rules'][0]['markouts']['all'][30]['n'], 0)      # none is 30 s old yet

    def test_daily_shows_the_day_before_whole(self):
        nxt = conf.day_of(T0 + 86400)
        rep = report.build('daily', [nxt], T0 + 86400 + 3600, S, now=T0 + 86400 + 3600)
        self.assertEqual((rep['prev']['day'], rep['prev']['fills'], rep['prev']['day_pnl']), (DAY, 44, 80.0))
        self.assertIn(DAY + ' (whole day)', render.text(rep))
        self.assertEqual(rep['rules'], [])               # yesterday's fills are in no table of today's

    def test_recorder_and_stops(self):
        r = self.rep['recorder'][0]
        self.assertEqual((r['quotes'], round(r['per_min'])), (121, 1))
        self.assertEqual([(s['by'], round(s['lasted'])) for s in self.rep['stops']], [('risk', 90)])

    def test_html_and_text_carry_the_same_numbers(self):
        page = render.html(self.rep)
        for s in render.sections(self.rep):
            for row in s['rows']:
                for cell in row:
                    self.assertIn(render._html.escape(cell), page)


class Alerts(unittest.TestCase):
    def ev(self, check, opened, recovered=0):
        return {'id': f'{check}-{int(opened * 1000)}', 'kind': 'breach', 'check': check, 'opened': opened,
                'recovered': recovered, 'reason': f'{check} breached', 'stop_sent': False}

    def test_one_raise_one_clear_no_repeat(self):
        st = {}
        a = alerts.step(st, [self.ev('position', 1000)], None, 1000, S)
        b = alerts.step(st, [self.ev('position', 1000)], {'open': {'position': self.ev('position', 1000)}}, 1001, S)
        c = alerts.step(st, [self.ev('position', 1000, 1090)], None, 1090, S)
        d = alerts.step(json.loads(json.dumps(st)), [self.ev('position', 1000, 1090)], None, 1091, S)   # after a restart
        self.assertEqual([[m['phase'] for m in x] for x in (a, b, c, d)], [['raise'], [], ['clear'], []])
        self.assertIn('1 m 30 s', c[0]['subject'])

    def test_flapping_is_held(self):
        st, sent = {}, []
        for i in range(10):                             # 10 flaps, 20 s apart, 5 s each
            t = 1000 + 20 * i
            sent += alerts.step(st, [self.ev('feed_btc', t)], None, t, S)
            sent += alerts.step(st, [self.ev('feed_btc', t, t + 5)], None, t + 5, S)
        self.assertEqual([m['phase'] for m in sent], ['raise', 'clear'])
        late = alerts.step(st, [self.ev('feed_btc', 1290)], None, 1290, S)       # still inside the gap: waits
        self.assertEqual(late, [])
        late = alerts.step(st, [], None, 1301, S)
        self.assertEqual(len(late), 1)
        self.assertIn('9 more time', ' '.join(late[0]['lines']))

    def test_stop_and_unwanted_checks(self):
        st = {}
        a = alerts.step(st, [self.ev('disk', 50)], {'open': {}, 'stop': {'t': 60.5, 'reason': 'position 0.26 BTC beyond 0.25'}}, 61, S)
        b = alerts.step(st, [{'id': 'clear-90000', 'kind': 'clear', 'opened': 90}], {'open': {}, 'stop': None}, 91, S)
        self.assertEqual([(m['event'], m['phase']) for m in a + b], [('stop-60500', 'raise'), ('stop-60500', 'clear')])
        self.assertIn('29 s', b[0]['subject'])


class Clock(unittest.TestCase):
    def test_no_repeat_no_skip_and_late(self):
        r = Reporter()
        sun = conf.day_start('2026-11-29')              # a Sunday
        r.st.update(since=sun - 2 * 86400 + 1000, outbox=[], reports={}, seen_test=0)
        r.schedule(sun - 2 * 86400 + 20 * 3600, S)                              # before 21:00: nothing
        self.assertEqual(r.st['outbox'], [])
        r.schedule(sun - 2 * 86400 + 21 * 3600 + 5, S)
        self.assertEqual([i['id'] for i in r.st['outbox']], ['daily-2026-11-27'])
        self.assertEqual(r.st['outbox'][0]['late_s'], 0)
        r2 = Reporter()                                 # down for two days, back on Sunday 23:00
        r2.st = json.loads(json.dumps(r.st))
        r2.st['outbox'] = []
        r2.schedule(sun + 23 * 3600, S)
        self.assertEqual([i['id'] for i in r2.st['outbox']], ['daily-2026-11-28', 'daily-2026-11-29', 'weekly-2026-11-29'])
        self.assertTrue(all(i['late_s'] > 0 for i in r2.st['outbox']))
        r2.schedule(sun + 23 * 3600 + 5, S)
        self.assertEqual(len(r2.st['outbox']), 3)                               # no repeat
        self.assertEqual(r2.due('daily', sun + 23 * 3600, S, True), sun + 86400 + 21 * 3600)

    def test_secret_never_in_errors(self):
        os.makedirs(conf.SECRETS, exist_ok=True)
        with open(os.path.join(conf.SECRETS, 'slack_webhook'), 'w') as f:
            f.write('http://127.0.0.1:9/services/T000/B000/XXXXSECRETXXXX\n')
        with self.assertRaises(channels.SendError) as e:
            channels.send_slack('x')
        self.assertNotIn('SECRET', str(e.exception))
        self.assertNotIn('127.0.0.1', str(e.exception))
        self.assertNotIn('SECRET', channels.scrub('boom http://127.0.0.1:9/services/T000/B000/XXXXSECRETXXXX and T000/B000/XXXXSECRETXXXX'))
        os.remove(os.path.join(conf.SECRETS, 'slack_webhook'))


if __name__ == '__main__':
    unittest.main()
