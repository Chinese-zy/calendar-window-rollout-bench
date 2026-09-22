import {
  parseDate,
  formatDate,
  compareDate,
  clampDay,
  shiftMonth,
} from './date-utils.js';

// Normalize a rule so callers may pass either Date objects or strings.
// rule: { start: Date|'YYYY-MM-DD', day?: number, everyMonths?: number, end?: Date|'YYYY-MM-DD' }
export function normalizeRule(rule) {
  const start = parseDate(rule.start);
  const day = rule.day === undefined ? start.day : rule.day;
  if (!Number.isInteger(day) || day < 1 || day > 31) {
    throw new RangeError(`day must be an integer in 1..31, got ${day}`);
  }
  const everyMonths = rule.everyMonths ?? 1;
  if (!Number.isInteger(everyMonths) || everyMonths < 1) {
    throw new RangeError(`everyMonths must be a positive integer, got ${everyMonths}`);
  }
  return {
    __normalized: true,
    start,
    day,
    everyMonths,
    end: rule.end === undefined ? null : parseDate(rule.end),
  };
}

function* occurrences(normalized) {
  let offset = 0;
  for (;;) {
    const target = shiftMonth(
      normalized.start.year,
      normalized.start.month,
      offset,
    );
    const date = clampDay(target.year, target.month, normalized.day);
    yield date;
    if (normalized.end !== null && compareDate(date, normalized.end) >= 0) return;
    offset += normalized.everyMonths;
  }
}

// Expand one rule within [from, to], both inclusive. Dates before the
// rule start or after its end are never produced.
export function expandRule(rule, from, to) {
  const normalized = rule.__normalized === true ? rule : normalizeRule(rule);
  const fromDate = parseDate(from);
  const toDate = parseDate(to);
  if (compareDate(fromDate, toDate) > 0) {
    throw new RangeError('from must not be later than to');
  }

  const result = [];
  for (const date of occurrences(normalized)) {
    if (compareDate(date, toDate) > 0) break;
    if (compareDate(date, fromDate) >= 0) result.push(date);
  }
  return result;
}

// Expand many rules and merge them into one ascending, de-duplicated
// schedule. When two rules cut on the same calendar day that day is
// emitted exactly once; sources are retained on the entry.
export function expandWindow(rules, from, to) {
  const merged = new Map();
  for (const rule of rules) {
    for (const date of expandRule(rule, from, to)) {
      const key = formatDate(date);
      const existing = merged.get(key);
      if (existing === undefined) {
        merged.set(key, { date, sources: [rule] });
      } else {
        existing.sources.push(rule);
      }
    }
  }
  return [...merged.values()].sort((a, b) => compareDate(a.date, b.date));
}
