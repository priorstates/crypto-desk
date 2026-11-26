"""python3 test_engine.py — the strategy on a made-up feed (no network, no files)."""
import unittest

from conf import DEFAULTS
from engine import Engine

S = 10**9
T0 = 1795000000 * S          # some second of a UTC day, far from midnight


def q(bid, ask, t):
    return {'type': 'quote', 'product': 'BTC-USD', 'bid': str(bid), 'ask': str(ask), 'exch_ns': t, 'recv_ns': t}


def tr(price, size, t):
    return {'type': 'trade', 'product': 'BTC-USD', 'price': str(price), 'size': str(size),
            'trade_id': 1, 'maker_side': 'buy', 'exch_ns': t, 'recv_ns': t}


class Base(unittest.TestCase):
    def setUp(self):
        self.s = dict(DEFAULTS)
        self.rows = []
        self.e = Engine(lambda: self.s, lambda kind, row: self.rows.append((kind, row)), None, T0)
        self.e.on_status({'state': 'connected'}, T0)

    def kinds(self, kind):
        return [r for k, r in self.rows if k == kind]

    def start(self, bid=100000.00, ask=100000.02):
        self.e.on_quote(q(bid, ask, T0), T0)


class TestQuotes(Base):
    def test_quotes_around_the_mid(self):
        self.start()
        b, a = self.e.quotes['buy'], self.e.quotes['sell']
        self.assertAlmostEqual(b['price'], 99980.00)      # mid 100000.01 less 2 bps, rounded away from the mid
        self.assertAlmostEqual(a['price'], 100020.02)
        self.assertEqual(b['size'], 0.01)
        self.assertEqual(self.e.snapshot(T0)['state'], 'quoting')

    def test_requote_only_past_the_threshold(self):
        self.start()
        self.e.on_quote(q(100005.00, 100005.02, T0 + S), T0 + S)      # 0.5 bp: keep
        self.assertEqual(len(self.kinds('quote')), 2)
        self.e.on_quote(q(100015.00, 100015.02, T0 + 2 * S), T0 + 2 * S)  # 1.5 bp: replace both
        self.assertEqual(len(self.kinds('quote')), 4)
        self.assertEqual([c['reason'] for c in self.kinds('cancel')], ['requote', 'requote'])

    def test_touch_does_not_fill_through_does(self):
        self.start()
        self.e.on_trade(tr(99980.00, 5, T0 + 1), T0 + 1)
        self.assertEqual(self.kinds('fill'), [])
        self.e.on_trade(tr(99979.99, 0.004, T0 + 2), T0 + 2)          # smaller than our quote
        f = self.kinds('fill')[0]
        self.assertEqual((f['side'], f['price'], f['size'], f['reason']), ('buy', 99980.00, 0.004, 'through'))
        self.assertEqual(f['exch_ns'], T0 + 2)
        self.assertEqual(self.e.quotes['buy']['left'], 0.006)
        self.e.on_trade(tr(100020.03, 3, T0 + 3), T0 + 3)             # through the ask, bigger than our quote
        f = self.kinds('fill')[1]
        self.assertEqual((f['side'], f['size']), ('sell', 0.01))
        self.assertAlmostEqual(self.e.pos.qty, -0.006)
        self.assertAlmostEqual(self.e.pos.realised, 0.004 * 40.02, places=6)

    def test_skew_and_position_limit(self):
        self.s.update(quote_size=0.2)
        self.start()
        self.e.on_trade(tr(99000, 9, T0 + 1), T0 + 1)                 # long 0.2
        self.e.on_quote(q(100000.00, 100000.02, T0 + 2), T0 + 2)
        b, a = self.e.quotes['buy'], self.e.quotes['sell']
        self.assertAlmostEqual(b['size'], 0.05)                       # only up to 0.25
        self.assertAlmostEqual(a['price'], 100004.02)                 # 16 USD lower: 2 bps x 0.2/0.25
        self.e.on_trade(tr(99000, 9, T0 + 3), T0 + 3)                 # long 0.25
        self.e.on_quote(q(100000.00, 100000.02, T0 + 4), T0 + 4)
        self.assertIsNone(self.e.quotes['buy'])                       # the side that would go past it
        self.assertIsNotNone(self.e.quotes['sell'])
        self.assertAlmostEqual(self.e.pos.qty, 0.25)


class TestStops(Base):
    def long(self):
        self.start()
        self.e.on_trade(tr(99900, 1, T0 + 1), T0 + 1)                 # long 0.01 at 99980.00

    def test_risk_stop_flattens_at_the_bid_and_stays_stopped(self):
        self.long()
        self.e.on_timer(T0 + S, {'stop': True, 'reason': 'feed stale', 't_ns': T0 + S})
        f = self.kinds('fill')[-1]
        self.assertEqual((f['reason'], f['side'], f['price'], f['size']), ('flatten', 'sell', 100000.00, 0.01))
        self.assertEqual(self.e.pos.qty, 0.0)
        self.assertEqual(self.e.quotes, {'buy': None, 'sell': None})
        snap = self.e.snapshot(T0 + S)
        self.assertEqual((snap['state'], snap['stopped_by']), ('stopped', 'risk'))
        self.assertAlmostEqual(snap['day_pnl'], 0.01 * (100000.00 - 99980.00), places=6)
        self.e.on_quote(q(100000.00, 100000.02, T0 + 2 * S), T0 + 2 * S)
        self.e.on_timer(T0 + 3 * S, {'stop': True, 'reason': 'feed stale', 't_ns': T0 + S})
        self.assertEqual(self.e.quotes, {'buy': None, 'sell': None})  # the same signal again: still stopped

    def test_person_resume_and_stop(self):
        self.long()
        self.e.on_timer(T0 + S, {'stop': True, 'reason': 'limit', 't_ns': T0 + S})
        self.s['resume_at'] = (T0 + 2 * S) / S
        self.e.on_timer(T0 + 2 * S, {'stop': True, 'reason': 'limit', 't_ns': T0 + S})
        self.e.on_quote(q(100000.00, 100000.02, T0 + 2 * S), T0 + 2 * S)
        self.assertEqual(self.e.snapshot(T0 + 2 * S)['state'], 'quoting')
        self.s['stop_at'] = (T0 + 3 * S) / S
        self.e.on_timer(T0 + 3 * S)
        self.assertEqual(self.e.stop['by'], 'person')
        self.e.on_timer(T0 + 86400 * S)                               # the next UTC day: your own Stop stays
        self.assertEqual(self.e.snapshot(T0 + 86400 * S)['state'], 'stopped')

    def test_next_utc_day_clears_a_risk_stop(self):
        self.long()
        self.e.on_timer(T0 + S, {'stop': True, 'reason': 'limit', 't_ns': T0 + S})
        t = T0 + 86400 * S
        self.e.on_timer(t, {'stop': True, 'reason': 'limit', 't_ns': T0 + S})
        self.assertIsNone(self.e.stop)
        self.assertEqual(self.e.fills_today, 0)
        self.assertAlmostEqual(self.e.day_pnl(), 0.0)

    def test_day_loss_limit(self):
        self.s.update(quote_size=0.25, daily_loss_limit=300)
        self.start()
        self.e.on_trade(tr(99900, 1, T0 + 1), T0 + 1)                 # long 0.25 at 99980.00
        self.e.on_quote(q(98700.00, 98700.02, T0 + 2), T0 + 2)        # -320 USD
        self.assertEqual(self.e.stop['by'], 'loss')
        self.assertEqual(self.e.pos.qty, 0.0)
        self.assertAlmostEqual(self.e.day_pnl(), 0.25 * (98700.00 - 99980.00), places=4)

    def test_stale_feed_pulls_quotes_without_flattening(self):
        self.long()
        self.e.on_timer(T0 + 11 * S)
        self.assertEqual(self.e.snapshot(T0 + 11 * S)['state'], 'paused')
        self.assertEqual(self.e.quotes, {'buy': None, 'sell': None})
        self.assertAlmostEqual(self.e.pos.qty, 0.01)
        self.e.on_quote(q(100000.00, 100000.02, T0 + 12 * S), T0 + 12 * S)
        self.assertEqual(self.e.snapshot(T0 + 12 * S)['state'], 'quoting')

    def test_state_survives_a_restart(self):
        self.long()
        e2 = Engine(lambda: self.s, lambda *a: None, self.e.state(), T0 + S)
        self.assertAlmostEqual(e2.pos.qty, 0.01)
        self.assertEqual(e2.fills_today, 1)


if __name__ == '__main__':
    unittest.main()
