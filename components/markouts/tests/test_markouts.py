import os
import sys
import unittest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))
from markouts import HORIZONS, signed, Tracker, from_series, summary

S = 10**9
T = 1795000000 * S


def fill(side, price, size=0.01, t=T, **kw):
    return dict({'id': 1, 'side': side, 'price': price, 'size': size, 'local_ns': t}, **kw)


class TestSigned(unittest.TestCase):
    def test_positive_means_the_fill_made_money(self):
        self.assertEqual(signed('buy', 100, 103), 3)
        self.assertEqual(signed('buy', 100, 98), -2)
        self.assertEqual(signed('sell', 100, 98), 2)
        self.assertEqual(signed('sell', 100, 103), -3)
        with self.assertRaises(ValueError):
            signed('hold', 1, 1)


class TestTracker(unittest.TestCase):
    def test_each_horizon_takes_the_mid_then(self):
        tr = Tracker()
        tr.add(fill('buy', 100.0))
        self.assertEqual(tr.advance(T + S // 2, 100.5), [])
        self.assertEqual(tr.advance(T + 1 * S, 101.0), [])
        self.assertEqual(tr.advance(T + 6 * S, 99.0), [])
        self.assertEqual(tr.pending, 1)
        rows = tr.advance(T + 30 * S, 97.5)
        self.assertEqual(len(rows), 1)
        r = rows[0]
        self.assertEqual((r['m1'], r['m5'], r['m30']), (1.0, -1.0, -2.5))
        self.assertEqual((r['mid1'], r['mid5'], r['mid30']), (101.0, 99.0, 97.5))
        self.assertEqual(r['id'], 1)
        self.assertEqual(tr.pending, 0)

    def test_a_long_silence_fills_every_horizon_at_once(self):
        tr = Tracker()
        tr.add(fill('sell', 100.0))
        r = tr.advance(T + 60 * S, 99.0)[0]
        self.assertEqual((r['m1'], r['m5'], r['m30']), (1.0, 1.0, 1.0))

    def test_no_mid_is_none(self):
        tr = Tracker()
        tr.add(fill('sell', 100.0))
        tr.advance(T + 2 * S, 99.0)
        r = tr.advance(T + 31 * S, None)[0]
        self.assertEqual((r['m1'], r['m5'], r['m30']), (1.0, None, None))

    def test_bad_side(self):
        with self.assertRaises(ValueError):
            Tracker().add(fill('hold', 1))


class TestSeries(unittest.TestCase):
    def setUp(self):
        self.times = [T - S, T + S // 2, T + 4 * S, T + 20 * S, T + 31 * S]
        self.mids = [100.0, 101.0, 102.0, 99.0, 98.0]

    def test_last_mid_at_or_before(self):
        r = from_series(self.times, self.mids, fill('buy', 100.0))
        self.assertEqual((r['mid1'], r['mid5'], r['mid30']), (101.0, 102.0, 99.0))
        self.assertEqual((r['m1'], r['m5'], r['m30']), (1.0, 2.0, -1.0))

    def test_not_known_yet(self):
        self.assertIsNone(from_series(self.times[:4], self.mids[:4], fill('buy', 100.0)))
        self.assertIsNone(from_series([], [], fill('buy', 100.0)))

    def test_stale_mid_is_none(self):
        r = from_series(self.times, self.mids, fill('buy', 100.0), max_age_ns=5 * S)
        self.assertEqual((r['m1'], r['m5']), (1.0, 2.0))
        self.assertIsNone(r['m30'])          # the last mid before +30 s was 10 s old

    def test_same_answer_as_the_tracker(self):
        tr, out = Tracker(), []
        tr.add(fill('sell', 100.0))
        mid = None
        for t, m in zip(self.times, self.mids):
            out += tr.advance(t, mid)
            mid = m
        a, b = out[0], from_series(self.times, self.mids, fill('sell', 100.0))
        self.assertEqual([a['m%d' % h] for h in HORIZONS], [b['m%d' % h] for h in HORIZONS])


class TestSummary(unittest.TestCase):
    def test_weighted_by_size(self):
        rows = [dict(fill('buy', 100.0, 0.03), m1=1.0, m5=None, m30=-1.0),
                dict(fill('buy', 100.0, 0.01), m1=-3.0, m5=2.0, m30=-1.0),
                dict(fill('sell', 200.0, 0.02), m1=0.5, m5=0.5, m30=4.0)]
        s = summary(rows)
        self.assertAlmostEqual(s['buy'][1]['avg'], 0.0)
        self.assertEqual((s['buy'][5]['n'], s['buy'][1]['n']), (1, 2))
        self.assertAlmostEqual(s['buy'][5]['avg'], 2.0)
        self.assertAlmostEqual(s['sell'][30]['avg_bps'], 200.0)
        self.assertAlmostEqual(s['all'][30]['avg'], (-0.04 + 0.08) / 0.06)
        self.assertAlmostEqual(s['all'][30]['size'], 0.06)

    def test_empty(self):
        s = summary([])
        self.assertIsNone(s['all'][1]['avg'])
        self.assertEqual(s['sell'][30]['n'], 0)


if __name__ == '__main__':
    unittest.main()
