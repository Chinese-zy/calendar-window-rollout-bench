// Pure civil-date arithmetic on (year, month, day) integer triples.
// No wall-clock or timezone APIs are used: nothing here reads the host
// machine's local timezone, DST rules, or current clock.

export const DAYS_IN_MONTH = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

export function isLeapYear(year) {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

export function daysInMonth(year, month) {
  if (month < 1 || month > 12) {
    throw new RangeError(`month must be in 1..12, got ${month}`);
  }
  if (month === 2 && isLeapYear(year)) return 29;
  return DAYS_IN_MONTH[month - 1];
}

export function makeDate(year, month, day) {
  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) {
    throw new TypeError('year, month and day must be integers');
  }
  if (day < 1 || day > daysInMonth(year, month)) {
    throw new RangeError(`invalid civil date ${year}-${month}-${day}`);
  }
  return { year, month, day };
}

export function parseDate(value) {
  if (typeof value !== 'string') {
    throw new TypeError(`expected YYYY-MM-DD string, got ${String(value)}`);
  }
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) {
    throw new RangeError(`date must be YYYY-MM-DD, got ${value}`);
  }
  return makeDate(Number(match[1]), Number(match[2]), Number(match[3]));
}

export function formatDate(date) {
  const y = String(date.year).padStart(4, '0');
  const m = String(date.month).padStart(2, '0');
  const d = String(date.day).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

// Chronological comparator: negative when a is earlier than b.
export function compareDate(a, b) {
  const ay = a.year - b.year;
  if (ay !== 0) return ay;
  const am = a.month - b.month;
  if (am !== 0) return am;
  return a.day - b.day;
}

export function isSameDate(a, b) {
  return compareDate(a, b) === 0;
}

// The same day-of-month in the target month, clamped to that month's
// last day. Day 31 lands on Feb 28/29, Apr 30, etc. — never spills
// forward into the next month and never gets dropped.
export function clampDay(year, month, day) {
  return makeDate(year, month, Math.min(day, daysInMonth(year, month)));
}

export function shiftMonth(year, month, offset) {
  const zeroBased = (year * 12 + (month - 1)) + offset;
  return { year: Math.floor(zeroBased / 12), month: (zeroBased % 12) + 1 };
}

export function addDays(date, amount) {
  if (amount < 0) throw new RangeError('addDays only supports non-negative amounts');
  let { year, month, day } = date;
  for (let remaining = amount; remaining > 0; ) {
    const leftInMonth = daysInMonth(year, month) - day;
    if (remaining <= leftInMonth) return makeDate(year, month, day + remaining);
    remaining -= leftInMonth + 1;
    const next = shiftMonth(year, month, 1);
    year = next.year;
    month = next.month;
    day = 1;
  }
  return makeDate(year, month, day);
}
