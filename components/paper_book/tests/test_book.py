import os
import sys
import unittest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))
from paper_book import Position, through_fill, replay


class TestPosition(unittest.TestCase):
    def test_open_extend_average(self):
        p = Position()
        self.assertEqual(p.fill('buy', 100, 1), 0.0)
        p.fill('buy', 110, 1)
        self.assertAlmostEqual(p.qty, 2)
        self.assertAlmostEqual(p.avg, 105)
        self.assertAlmostEqual(p.unrealised(107), 4)

    def test_reduce_realises(self):
        p = Position()
        p.fill('buy', 100, 2)
        self.assertAlmostEqual(p.fill('sell', 103, 1), 3)
        self.assertAlmostEqual(p.qty, 1)
        self.assertAlmostEqual(p.avg, 100)
        self.assertAlmostEqual(p.realised, 3)
        self.assertAlmostEqual(p.total(101), 4)

    def test_flip(self):
        p = Position()
        p.fill('buy', 100, 1)
        self.assertAlmostEqual(p.fill('sell', 90, 3), -10)
        self.assertAlmostEqual(p.qty, -2)
        self.assertAlmostEqual(p.avg, 90)
        self.assertAlmostEqual(p.unrealised(85), 10)

    def test_short_round_trip_and_flat(self):
        p = Position()
        p.fill('sell', 50000, 0.01)
        self.assertAlmostEqual(p.fill('buy', 49900, 0.01), 1.0)
        self.assertEqual(p.qty, 0.0)
        self.assertEqual(p.avg, 0.0)
        self.assertEqual(p.unrealised(60000), 0.0)

    def test_small_sizes_do_not_drift(self):
        p = Position()
        for _ in range(25):
            p.fill('buy', 90000, 0.01)
        for _ in range(25):
            p.fill('sell', 90000, 0.01)
        self.assertEqual(p.qty, 0.0)

    def test_bad_input(self):
        with self.assertRaises(ValueError):
            Position().fill('hold', 1, 1)
        with self.assertRaises(ValueError):
            Position().fill('buy', 1, 0)

    def test_dict_and_replay(self):
        fills = [{'side': 'buy', 'price': 100, 'size': 1}, {'side': 'sell', 'price': 104, 'size': 0.5}]
        p = replay(fills)
        q = Position.from_dict(p.as_dict())
        self.assertAlmostEqual(q.qty, 0.5)
        self.assertAlmostEqual(q.realised, 2)


class TestThrough(unittest.TestCase):
    def test_touch_never_fills(self):
        self.assertEqual(through_fill('buy', 100, 1, 100, 5), 0.0)
        self.assertEqual(through_fill('sell', 100, 1, 100, 5), 0.0)

    def test_through(self):
        self.assertEqual(through_fill('buy', 100, 1, 99.99, 5), 1.0)
        self.assertEqual(through_fill('sell', 100, 1, 100.01, 5), 1.0)
        self.assertEqual(through_fill('buy', 100, 1, 100.01, 5), 0.0)
        self.assertEqual(through_fill('sell', 100, 1, 99.99, 5), 0.0)

    def test_size_is_the_smaller(self):
        self.assertEqual(through_fill('buy', 100, 0.01, 99, 0.004), 0.004)
        self.assertEqual(through_fill('sell', 100, 0.01, 101, 3), 0.01)

    def test_strings_from_the_feed(self):
        self.assertEqual(through_fill('buy', '90000.01', '0.01', '90000.00', '0.00012345'), 0.00012345)


if __name__ == '__main__':
    unittest.main()
