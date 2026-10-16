import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { findOnset } from '../src/analyze.ts';
import { addDays } from '../src/time.ts';
import type { DailyMean } from '../src/weather.ts';

const series = (...temps: number[]): DailyMean[] =>
  temps.map((meanC, i) => ({ date: addDays('2026-10-10', i), meanC }));

describe('findOnset below', () => {
  it('finds the first day of the cold stretch that lasts until the end', () => {
    const onset = findOnset(series(10, 9, 8, 6, 5, 4, 3, 2), 7, 5, 'below');
    assert.equal(onset?.date, '2026-10-13');
    assert.equal(onset?.days.length, 5);
    assert.equal(onset?.meanC, 4);
  });

  it('starts after a warm day that interrupts the stretch', () => {
    const onset = findOnset(series(6, 5, 4, 9, 6, 5, 4, 3, 2), 7, 5, 'below');
    assert.equal(onset?.date, '2026-10-14');
    assert.equal(onset?.days.length, 5);
  });

  it('returns null when a warm day near the end breaks the stretch', () => {
    assert.equal(findOnset(series(6, 5, 4, 3, 2, 1, 9), 7, 5, 'below'), null);
  });

  it('returns null when the stretch is shorter than minDays', () => {
    assert.equal(findOnset(series(10, 10, 10, 6, 5, 4, 3), 7, 5, 'below'), null);
  });

  it('accepts a stretch of exactly minDays', () => {
    assert.equal(findOnset(series(10, 6, 5, 4, 3, 2), 7, 5, 'below')?.date, '2026-10-11');
  });

  it('returns null for a series shorter than minDays', () => {
    assert.equal(findOnset(series(1, 2, 3), 7, 5, 'below'), null);
    assert.equal(findOnset([], 7, 5, 'below'), null);
  });

  it('treats a day exactly at the threshold as breaking the stretch', () => {
    assert.equal(findOnset(series(6, 6, 6, 6, 7, 6, 6, 6, 6), 7, 5, 'below'), null);
    assert.equal(findOnset(series(6, 6, 7, 6, 6, 6, 6, 6), 7, 5, 'below')?.date, '2026-10-13');
  });

  it('can start on a past day when the whole series is cold', () => {
    assert.equal(findOnset(series(6, 5, 4, 3, 2, 1), 7, 5, 'below')?.date, '2026-10-10');
  });
});

describe('findOnset above', () => {
  it('finds the first day of the warm stretch that lasts until the end', () => {
    const onset = findOnset(series(3, 5, 6, 8, 9, 10, 11, 12), 7, 5, 'above');
    assert.equal(onset?.date, '2026-10-13');
    assert.equal(onset?.meanC, 10);
  });

  it('starts after a cold day that interrupts the stretch', () => {
    assert.equal(findOnset(series(8, 9, 10, 4, 8, 9, 10, 11, 12), 7, 5, 'above')?.date, '2026-10-14');
  });

  it('returns null when the stretch is too short', () => {
    assert.equal(findOnset(series(3, 3, 3, 8, 9, 10, 11), 7, 5, 'above'), null);
  });

  it('treats a day exactly at the threshold as breaking the stretch', () => {
    assert.equal(findOnset(series(8, 8, 8, 8, 7, 8, 8, 8, 8), 7, 5, 'above'), null);
  });

  it('never finds both directions in the same series', () => {
    const s = series(10, 2, 10, 2, 10, 10, 10, 10, 10);
    assert.notEqual(findOnset(s, 7, 5, 'above'), null);
    assert.equal(findOnset(s, 7, 5, 'below'), null);
  });
});
