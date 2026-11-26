"""python3 test_risk.py: the fills replay, the checks and the stop logic, on made-up data."""
import gzip
import json
import os
import tempfile
import unittest

from fills import FillBook
from rules import evaluate
from tracker import Tracker

S = {'stale_s': 10, 'hb_stale_s': 5, 'max_position': 0.25, 'max_day_loss': 300, 'min_free_gb': 20,
     'remind_min': 5, 'ack': '', 'clear_at': 0}
DAY1, DAY2 = 1795651200, 1795737600           # 2026-11-26 and 2026-11-27, 00:00 UTC
OK = {'feed_age': {'BTC-USD': 0.3, 'ETH-USD': 1}, 'recorder_age': 0.5, 'maker_age': 0.5,
      'position': 0.1, 'day_pnl': -20.0, 'free_gb': 600}


def fill(side, price, size, t):
    return json.dumps({'side': side, 'price': price, 'size': size, 'mid': price, 'local_ns': int(t * 1e9)}) + '\n'


class Fills(unittest.TestCase):
    def setUp(self):
        self.root = tempfile.mkdtemp()
        os.makedirs(os.path.join(self.root, 'fills'))

    def path(self, name):
        return os.path.join(self.root, 'fills', name)

    def test_replay_follow_and_new_day(self):
        with open(self.path('2026-11-26.jsonl'), 'w') as f:
            f.write(fill('buy', 60000, 0.1, DAY1 + 10) + fill('sell', 60100, 0.04, DAY1 + 20))
            f.write('{"side":"buy","pri')                           # a row still being written
        b = FillBook()
        self.assertTrue(b.poll(self.root, int((DAY1 + 30) * 1e9), 60200))
        n = b.numbers(60200)
        self.assertAlmostEqual(n['position'], 0.06)
        self.assertAlmostEqual(n['realised'], 4.0)
        self.assertAlmostEqual(n['day_pnl'], 4.0 + 0.06 * 200)      # nothing carried into the day
        self.assertEqual(n['fills_today'], 2)
        with open(self.path('2026-11-26.jsonl'), 'w') as f:
            f.write(fill('buy', 60000, 0.1, DAY1 + 10) + fill('sell', 60100, 0.04, DAY1 + 20)
                    + fill('buy', 60300, 0.01, DAY1 + 40))
        b.poll(self.root, int((DAY1 + 50) * 1e9), 60300)
        self.assertAlmostEqual(b.numbers(60300)['position'], 0.07)
        # The next UTC day: 0.07 BTC carried over, marked at the mid at midnight (60300).
        b.poll(self.root, int((DAY2 + 1) * 1e9), 60300)
        with open(self.path('2026-11-27.jsonl'), 'w') as f:
            f.write(fill('sell', 60500, 0.07, DAY2 + 5))
        b.poll(self.root, int((DAY2 + 6) * 1e9), 60500)
        n = b.numbers(60500)
        self.assertAlmostEqual(n['position'], 0.0)
        self.assertAlmostEqual(n['day_pnl'], 0.07 * 200, places=4)
        self.assertEqual(n['fills_today'], 1)

    def test_packed_days_and_restart(self):
        with gzip.open(self.path('2026-11-26.jsonl.gz'), 'wt') as f:
            f.write(fill('sell', 60000, 0.3, DAY1 + 10))
        with open(self.path('2026-11-27.jsonl'), 'w') as f:
            f.write(fill('buy', 59000, 0.1, DAY2 + 500))
        b = FillBook()
        b.poll(self.root, int((DAY2 + 600) * 1e9), 59000)
        n = b.numbers(59000)
        self.assertAlmostEqual(n['position'], -0.2)
        self.assertAlmostEqual(n['realised'], 100.0)
        self.assertEqual(n['fills_today'], 1)


class Rules(unittest.TestCase):
    def test_each_check(self):
        self.assertTrue(all(c['state'] == 'ok' for c in evaluate(OK, S).values()))
        cases = {'feed_btc': {'feed_age': {'BTC-USD': 10.5, 'ETH-USD': 1}},
                 'feed_eth': {'feed_age': {'BTC-USD': 1, 'ETH-USD': 11}},
                 'recorder_hb': {'recorder_age': None}, 'maker_hb': {'maker_age': 6},
                 'position': {'position': -0.2501}, 'loss': {'day_pnl': -300.0}, 'disk': {'free_gb': 19.9}}
        for key, change in cases.items():
            got = evaluate(dict(OK, **change), S)
            self.assertEqual([k for k, c in got.items() if c['state'] == 'breach'], [key])
        self.assertEqual(evaluate(dict(OK, position=0.25), S)['position']['state'], 'ok')
        self.assertEqual(evaluate(dict(OK, position=None), S)['position']['state'], 'unknown')


class Stop(unittest.TestCase):
    def test_breach_stop_ack_clear(self):
        sent = []
        folder = tempfile.mkdtemp()
        tr = Tracker(folder, lambda stop, why: sent.append((stop, why)))
        self.assertEqual(tr.update(evaluate(OK, S), S, 100), [])
        over = evaluate(dict(OK, position=0.26), S)
        ev = tr.update(over, S, 101)[0]
        self.assertEqual((ev['check'], ev['stop_sent']), ('position', True))
        self.assertEqual(sent, [(True, 'position +0.2600 BTC beyond 0.25')])
        self.assertEqual(tr.update(over, S, 102, 'stopped'), [])    # once per event
        # Clear is refused while the breach lasts; a restart keeps the stop and the open event.
        tr = Tracker(folder, lambda stop, why: sent.append((stop, why)))
        tr.update(over, dict(S, clear_at=103), 103, 'stopped')
        self.assertTrue(tr.stop and tr.note)
        self.assertEqual(len(sent), 1)
        got = tr.update(evaluate(OK, S), dict(S, clear_at=103, ack=ev['id']), 104, 'stopped')
        self.assertTrue(got[0]['recovered'] and got[0]['acked'])
        self.assertTrue(tr.stop)                                    # recovered, but the stop stays
        got = tr.update(evaluate(OK, S), dict(S, clear_at=105), 105, 'stopped')
        self.assertEqual((got[0]['kind'], tr.stop, sent[-1]), ('clear', None, (False, 'cleared')))

    def test_resend_and_release(self):
        sent = []
        tr = Tracker(None, lambda stop, why: sent.append(stop))
        stale = evaluate(dict(OK, feed_age={'BTC-USD': 12, 'ETH-USD': 12}), S)
        got = tr.update(stale, S, 100, 'quoting')
        self.assertEqual([(e['check'], e['stop_sent']) for e in got], [('feed_btc', True), ('feed_eth', False)])
        tr.update(stale, S, 120, 'quoting')
        self.assertEqual(sent, [True])
        tr.update(stale, S, 131, 'quoting')                         # still quoting after 30 s: again
        self.assertEqual(sent, [True, True])
        got = tr.update(evaluate(OK, S), S, 140, 'quoting')         # resumed at the strategy itself
        self.assertEqual([e.get('kind') for e in got], ['breach', 'breach', 'released'])
        self.assertIsNone(tr.stop)


if __name__ == '__main__':
    unittest.main()
