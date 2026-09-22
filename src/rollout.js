import { parseDate, compareDate, addDays, isSameDate } from './date-utils.js';
import { expandWindow } from './monthly.js';

function toDate(value) {
  return value && typeof value === 'object' ? value : parseDate(value);
}

// Ordered release over an expected schedule. The schedule itself is the
// ground truth: releaseUpTo(cutoff) walks it from the frontier, and an
// entry is only released when its exact date is present. If an entry is
// missing, the walk halts there — later entries stay buffered even when
// they already arrived, so nothing is ever let out early. Re-feeding the
// same date (a second cut on the same day) never duplicates it.
export class Rollout {
  constructor(schedule) {
    this.schedule = schedule;
    this.frontier = 0;
    this.pending = new Map();
    this.released = new Set();
  }

  static fromRules(rules, from, to) {
    return new Rollout(expandWindow(rules, from, to));
  }

  feed(dateOrString, payload = null) {
    const date = toDate(dateOrString);
    const key = this._key(date);
    const expected = this.schedule.find((entry) => isSameDate(entry.date, date));
    if (!expected) {
      return { accepted: false, reason: 'not-in-schedule', key };
    }
    if (this.released.has(key)) {
      return { accepted: false, reason: 'already-released', key };
    }
    if (!this.pending.has(key)) {
      this.pending.set(key, { date, payload, sources: expected.sources });
    }
    return { accepted: true, reason: 'buffered', key };
  }

  releaseUpTo(cutoffOrString) {
    const cutoff = toDate(cutoffOrString);
    const releasedNow = [];

    while (this.frontier < this.schedule.length) {
      const entry = this.schedule[this.frontier];
      if (compareDate(entry.date, cutoff) > 0) break;

      const key = this._key(entry.date);
      const ready = this.pending.get(key);
      if (ready === undefined) break; // gap: hold everything behind it

      releasedNow.push(ready);
      this.pending.delete(key);
      this.released.add(key);
      this.frontier += 1;
    }
    return releasedNow;
  }

  // Earliest schedule date that is still blocking the frontier.
  nextExpected() {
    return this.frontier < this.schedule.length
      ? this.schedule[this.frontier].date
      : null;
  }

  isBlocked() {
    return (
      this.frontier < this.schedule.length &&
      !this.pending.has(this._key(this.schedule[this.frontier].date))
    );
  }

  _key(date) {
    return `${date.year}-${date.month}-${date.day}`;
  }
}

// Convenience: feed a batch of cuts (possibly out of order / duplicated)
// and release every entry whose date has arrived without crossing a gap.
export function feedAndRelease(rollout, cuts, cutoff) {
  for (const cut of cuts) {
    const date = typeof cut === 'string' || cut instanceof String ? cut : cut.date;
    const payload = typeof cut === 'object' && cut !== null ? cut.payload ?? null : null;
    rollout.feed(date, payload);
  }
  return rollout.releaseUpTo(cutoff);
}

export { addDays };
