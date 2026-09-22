"""Monthly date expansion using only the standard library.

Pure date arithmetic on datetime.date; never reads the local timezone.
"""

from datetime import date


def _days_in_month(year, month):
    if month == 12:
        nxt = date(year + 1, 1, 1)
    else:
        nxt = date(year, month + 1, 1)
    return (nxt - date(year, month, 1)).days


def _add_one_month(year, month):
    if month == 12:
        return year + 1, 1
    return year, month + 1


def expand_monthly(start, count, anchor_day=None):
    """Expand `count` monthly dates starting from `start`.

    - anchor_day defaults to start.day; when the target month lacks that
      day, clamp to the month's last day (Jan 31 -> Feb 28/29) instead of
      drifting into the next month or dropping the month entirely.
    - Duplicated days are emitted only once.
    - If a computed candidate does not fall strictly after the last
      confirmed date (a gap in the middle), stop expanding rather than
      pulling later dates forward.
    """
    if count <= 0:
        return []
    if anchor_day is None:
        anchor_day = start.day
    if not 1 <= anchor_day <= 31:
        raise ValueError("anchor_day must be within 1..31")

    result = [start]
    seen = {start}
    year, month = start.year, start.month
    while len(result) < count:
        year, month = _add_one_month(year, month)
        day = min(anchor_day, _days_in_month(year, month))
        candidate = date(year, month, day)
        if candidate in seen:
            break
        if candidate <= result[-1]:
            break
        seen.add(candidate)
        result.append(candidate)
    return result
