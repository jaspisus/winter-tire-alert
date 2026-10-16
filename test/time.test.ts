import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { addDays, dateIn, monthOf, nextRunAt } from '../src/time.ts';

describe('time', () => {
  it('adds days across month and year boundaries', () => {
    assert.equal(addDays('2026-10-30', 3), '2026-11-02');
    assert.equal(addDays('2026-12-31', 1), '2027-01-01');
    assert.equal(addDays('2026-03-01', -3), '2026-02-26');
  });

  it('reads the month of a date', () => {
    assert.equal(monthOf('2026-03-01'), 3);
  });

  it('returns the calendar date in Warsaw, not in UTC', () => {
    assert.equal(dateIn(new Date('2026-10-16T22:30:00Z')), '2026-10-17');
    assert.equal(dateIn(new Date('2026-01-16T22:30:00Z')), '2026-01-16');
  });

  it('schedules today when the hour is still ahead', () => {
    // 06:00 CEST (UTC+2)
    assert.equal(nextRunAt(new Date('2026-10-16T04:00:00Z'), 7).toISOString(), '2026-10-16T05:00:00.000Z');
  });

  it('schedules tomorrow when the hour has passed or is exactly now', () => {
    assert.equal(nextRunAt(new Date('2026-10-16T05:00:00Z'), 7).toISOString(), '2026-10-17T05:00:00.000Z');
  });

  it('handles the switch to winter time', () => {
    // DST ends on 2026-10-25, so 07:00 is 06:00 UTC that day.
    assert.equal(nextRunAt(new Date('2026-10-24T10:00:00Z'), 7).toISOString(), '2026-10-25T06:00:00.000Z');
  });

  it('handles the switch to summer time', () => {
    // DST starts on 2027-03-28, so 07:00 is 05:00 UTC that day.
    assert.equal(nextRunAt(new Date('2027-03-27T10:00:00Z'), 7).toISOString(), '2027-03-28T05:00:00.000Z');
  });
});
