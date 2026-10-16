import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { Onset } from '../src/analyze.ts';
import { buildMessage, formatDate } from '../src/messages.ts';

const config = { thresholdC: 7, locationName: 'Gdynia' };
const onset: Onset = {
  date: '2026-10-21',
  days: [
    { date: '2026-10-21', meanC: 5 },
    { date: '2026-10-22', meanC: 3 },
  ],
  meanC: 4,
};

describe('messages', () => {
  it('formats dates with the weekday', () => {
    assert.equal(formatDate('2026-10-21'), 'Wed 21 Oct');
  });

  it('builds the winter alert with the onset, summary and daily list', () => {
    const text = buildMessage({ type: 'alert', kind: 'winter', onset }, config, '2026-10-16');
    assert.match(text, /From Wed 21 Oct the mean daily temperature in Gdynia stays below 7°C \(2 days, mean 4\.0°C\)/);
    assert.match(text, /ideally before Wed 21 Oct/);
    assert.match(text, /Thu 22 Oct: 3\.0°C/);
  });

  it('asks to book as soon as possible when the cold has already started', () => {
    const text = buildMessage({ type: 'alert', kind: 'winter', onset }, config, '2026-10-21');
    assert.match(text, /as soon as possible/);
  });

  it('builds the reminder with the previous date', () => {
    const text = buildMessage(
      { type: 'reminder', kind: 'winter', onset, previousOnset: '2026-10-25' },
      config,
      '2026-10-16',
    );
    assert.match(text, /from Wed 21 Oct \(previously Sun 25 Oct\)/);
  });
});
