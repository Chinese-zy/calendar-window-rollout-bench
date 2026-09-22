"""Fixed-date tests; no local timezone, no third-party packages."""

import unittest
from datetime import date
from unittest import mock

import monthly_expand
from monthly_expand import expand_monthly


class ExpandMonthlyTest(unittest.TestCase):
    def test_month_end_does_not_drift_into_next_month(self):
        # Jan 31 anchored: Feb must clamp to Feb 28, not Mar 3.
        got = expand_monthly(date(2025, 1, 31), 4)
        self.assertEqual(
            got,
            [
                date(2025, 1, 31),
                date(2025, 2, 28),
                date(2025, 3, 31),
                date(2025, 4, 30),
            ],
        )

    def test_leap_year_february_keeps_29th(self):
        got = expand_monthly(date(2024, 1, 31), 2)
        self.assertEqual(got, [date(2024, 1, 31), date(2024, 2, 29)])

    def test_clamped_month_is_not_dropped(self):
        # The short month still appears; sequence length is preserved.
        got = expand_monthly(date(2025, 1, 31), 3)
        self.assertEqual(len(got), 3)
        self.assertIn(date(2025, 2, 28), got)

    def test_year_boundary(self):
        got = expand_monthly(date(2025, 12, 15), 3)
        self.assertEqual(
            got,
            [date(2025, 12, 15), date(2026, 1, 15), date(2026, 2, 15)],
        )

    def test_duplicate_cutover_day_emitted_once(self):
        # Two cutovers landing on the same day must not appear twice.
        got = expand_monthly(date(2025, 1, 30), 4, anchor_day=30)
        self.assertEqual(len(got), len(set(got)))
        self.assertEqual(got[1], date(2025, 2, 28))
        self.assertEqual(got[2], date(2025, 3, 30))

    def test_gap_blocks_later_dates(self):
        # A candidate that fails to advance past the previous confirmed
        # date halts expansion instead of releasing later dates early.
        got = expand_monthly(date(2025, 2, 28), 5, anchor_day=31)
        # Feb 28 -> Mar 31 -> Apr 30 -> May 31 -> Jun 30: all strictly
        # increasing, so nothing is blocked here.
        self.assertEqual(
            got,
            [
                date(2025, 2, 28),
                date(2025, 3, 31),
                date(2025, 4, 30),
                date(2025, 5, 31),
                date(2025, 6, 30),
            ],
        )
        # Simulate a cutover calendar where the next month never
        # advances: the missing day blocks the rollout and later dates
        # are not released early.
        with mock.patch.object(
            monthly_expand, "_add_one_month", side_effect=lambda y, m: (y, m)
        ):
            got = expand_monthly(date(2025, 3, 31), 5)
        self.assertEqual(got, [date(2025, 3, 31)])

    def test_zero_and_invalid_anchor(self):
        self.assertEqual(expand_monthly(date(2025, 1, 31), 0), [])
        with self.assertRaises(ValueError):
            expand_monthly(date(2025, 1, 31), 2, anchor_day=0)
        with self.assertRaises(ValueError):
            expand_monthly(date(2025, 1, 31), 2, anchor_day=32)


if __name__ == "__main__":
    unittest.main()
