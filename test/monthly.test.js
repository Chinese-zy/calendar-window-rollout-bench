import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import {
  isLeapYear,
  daysInMonth,
  clampDay,
  addDays,
} from '../src/date-utils.js';
import { normalizeRule, expandRule, expandWindow } from '../src/monthly.js';
import { Rollout } from '../src/rollout.js';

const here = dirname(fileURLToPath(import.meta.url));
const fmt = (d) =>
  `${String(d.year).padStart(4, '0')}-${String(d.month).padStart(2, '0')}-${String(d.day).padStart(2, '0')}`;

test('calendar facts use fixed values, not the host clock', () => {
  assert.equal(isLeapYear(2024), true);
  assert.equal(isLeapYear(2023), false);
  assert.equal(isLeapYear(1900), false);
  assert.equal(isLeapYear(2000), true);
  assert.equal(daysInMonth(2025, 2), 28);
  assert.equal(daysInMonth(2024, 2), 29);
});

test('day 31 clamps to the last day of February instead of spilling forward', () => {
  assert.deepEqual(clampDay(2025, 2, 31), { year: 2025, month: 2, day: 28 });
  assert.deepEqual(clampDay(2024, 2, 31), { year: 2024, month: 2, day: 29 });
  assert.deepEqual(clampDay(2025, 4, 31), { year: 2025, month: 4, day: 30 });
  assert.deepEqual(clampDay(2025, 1, 31), { year: 2025, month: 1, day: 31 });
});

test('a 31st-of-month rule lands inside every month and is never dropped', () => {
  const rule = normalizeRule({ start: '2025-01-31', day: 31 });
  const dates = expandRule(rule, '2025-01-01', '2025-06-30').map(fmt);
  assert.deepEqual(dates, [
    '2025-01-31',
    '2025-02-28',
    '2025-03-31',
    '2025-04-30',
    '2025-05-31',
    '2025-06-30',
  ]);
});

test('a leap-year run keeps the clamped Feb 29 occurrence', () => {
  const rule = normalizeRule({ start: '2023-12-31', day: 31 });
  const dates = expandRule(rule, '2023-12-01', '2024-04-30').map(fmt);
  assert.deepEqual(dates, [
    '2023-12-31',
    '2024-01-31',
    '2024-02-29',
    '2024-03-31',
    '2024-04-30',
  ]);
});

test('start/end and interval are respected', () => {
  const rule = normalizeRule({
    start: '2025-01-15',
    day: 15,
    everyMonths: 2,
    end: '2025-07-15',
  });
  const dates = expandRule(rule, '2020-01-01', '2030-01-01').map(fmt);
  assert.deepEqual(dates, [
    '2025-01-15',
    '2025-03-15',
    '2025-05-15',
    '2025-07-15',
  ]);
});

test('two rules cutting on the same day merge into one entry', () => {
  const endOfMonth = { start: '2025-01-31', day: 31 };
  const lastDay = { start: '2025-02-28', day: 28 };
  const window = expandWindow([endOfMonth, lastDay], '2025-01-01', '2025-03-31');
  const dates = window.map((entry) => fmt(entry.date));

  assert.deepEqual(dates, ['2025-01-31', '2025-02-28', '2025-03-28', '2025-03-31']);
  assert.equal(window[1].sources.length, 2);

  const counts = dates.reduce((acc, key) => acc.set(key, (acc.get(key) ?? 0) + 1), new Map());
  for (const count of counts.values()) assert.equal(count, 1);
});

test('a missing day blocks later days from being released early', () => {
  const rule = { start: '2025-01-31', day: 31 };
  const schedule = expandWindow([rule], '2025-01-01', '2025-05-31');
  const rollout = new Rollout(schedule);

  // Jan and Mar arrive; Feb has not been cut yet.
  rollout.feed('2025-01-31');
  rollout.feed('2025-03-31');

  // Even though it is already April, March must not pass the Feb gap.
  const released = rollout.releaseUpTo('2025-04-30').map((entry) => fmt(entry.date));
  assert.deepEqual(released, ['2025-01-31']);
  assert.deepEqual(fmt(rollout.nextExpected()), '2025-02-28');
  assert.equal(rollout.isBlocked(), true);

  // Feeding Feb unblocks everything through the cutoff at once.
  rollout.feed('2025-02-28');
  rollout.feed('2025-04-30');
  rollout.feed('2025-05-31');
  const caughtUp = rollout.releaseUpTo('2025-05-31').map((entry) => fmt(entry.date));
  assert.deepEqual(caughtUp, ['2025-02-28', '2025-03-31', '2025-04-30', '2025-05-31']);
  assert.equal(rollout.isBlocked(), false);
});

test('feeding the same cut twice never produces it twice', () => {
  const schedule = expandWindow(
    [{ start: '2025-01-15', day: 15 }],
    '2025-01-01',
    '2025-03-31',
  );
  const rollout = new Rollout(schedule);

  rollout.feed('2025-01-15');
  rollout.feed('2025-01-15'); // duplicate cut
  const first = rollout.releaseUpTo('2025-01-31').map((entry) => fmt(entry.date));
  assert.deepEqual(first, ['2025-01-15']);

  const again = rollout.releaseUpTo('2025-01-31').map((entry) => fmt(entry.date));
  assert.deepEqual(again, []);

  // Re-feeding an already-released day is rejected rather than replayed.
  const result = rollout.feed('2025-01-15');
  assert.equal(result.accepted, false);
  assert.equal(result.reason, 'already-released');
});

test('out-of-order cuts are buffered and released in schedule order', () => {
  const schedule = expandWindow(
    [{ start: '2025-01-10', day: 10 }],
    '2025-01-01',
    '2025-04-30',
  );
  const rollout = new Rollout(schedule);
  rollout.feed('2025-03-10');
  rollout.feed('2025-02-10');
  rollout.feed('2025-01-10');

  const released = rollout.releaseUpTo('2025-12-31').map((entry) => fmt(entry.date));
  assert.deepEqual(released, ['2025-01-10', '2025-02-10', '2025-03-10']);
  assert.equal(rollout.isBlocked(), true);
  assert.deepEqual(fmt(rollout.nextExpected()), '2025-04-10');
});

test('addDays walks month and year boundaries with fixed data', () => {
  assert.deepEqual(fmt(addDays({ year: 2024, month: 2, day: 28 }, 1)), '2024-02-29');
  assert.deepEqual(fmt(addDays({ year: 2025, month: 2, day: 28 }, 1)), '2025-03-01');
  assert.deepEqual(fmt(addDays({ year: 2024, month: 12, day: 31 }, 1)), '2025-01-01');
});

test('source never touches local-timezone or wall-clock APIs', () => {
  const forbidden = [
    /\bnew\s+Date\s*\(/,
    /\bDate\.now\s*\(/,
    /\.getFullYear\s*\(/,
    /\.getMonth\s*\(/,
    /\.getDate\s*\(/,
    /\.getTimezoneOffset\s*\(/,
    /\bIntl\b/,
    /process\.env\.TZ/,
  ];
  for (const file of ['date-utils.js', 'monthly.js', 'rollout.js']) {
    const source = readFileSync(join(here, '..', 'src', file), 'utf8');
    for (const pattern of forbidden) {
      assert.equal(
        pattern.test(source),
        false,
        `${file} must not use local time API matching ${pattern}`,
      );
    }
  }
});
