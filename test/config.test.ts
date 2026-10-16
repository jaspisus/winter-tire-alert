import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { ConfigError, loadConfig, parseMonths } from '../src/config.ts';

describe('parseMonths', () => {
  it('parses ranges, lists and wrapping ranges', () => {
    assert.deepEqual([...parseMonths('3-9')], [3, 4, 5, 6, 7, 8, 9]);
    assert.deepEqual([...parseMonths('4, 6,8')], [4, 6, 8]);
    assert.deepEqual([...parseMonths('11-2')], [11, 12, 1, 2]);
    assert.equal(parseMonths('1-12').size, 12);
  });

  it('rejects invalid months', () => {
    for (const raw of ['0-5', '3-13', 'march', '3-', '1-2-3']) {
      assert.throws(() => parseMonths(raw), ConfigError, raw);
    }
  });
});

describe('loadConfig', () => {
  const telegram = { TELEGRAM_BOT_TOKEN: 't', TELEGRAM_CHAT_ID: '1' };

  it('uses the defaults for Gdynia', () => {
    const config = loadConfig(telegram, { requireTelegram: true });
    assert.equal(config.currentTires, 'summer');
    assert.equal(config.thresholdC, 7);
    assert.equal(config.minDays, 5);
    assert.equal(config.checkHour, 7);
    assert.equal(config.lat, 54.5189);
    assert.equal(config.locationName, 'Gdynia');
  });

  it('treats empty values as unset', () => {
    assert.equal(loadConfig({ ...telegram, THRESHOLD_C: '' }, { requireTelegram: true }).thresholdC, 7);
  });

  it('requires the Telegram settings unless told otherwise', () => {
    assert.throws(() => loadConfig({}, { requireTelegram: true }), /TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID/);
    assert.doesNotThrow(() => loadConfig({}, { requireTelegram: false }));
  });

  it('rejects invalid values', () => {
    const bad = [{ CURRENT_TIRES: 'allseason' }, { THRESHOLD_C: 'cold' }, { CHECK_HOUR: '24' }, { MIN_DAYS: '0' }];
    for (const env of bad) {
      assert.throws(() => loadConfig({ ...telegram, ...env }, { requireTelegram: true }), ConfigError);
    }
  });
});
