import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { Onset } from '../src/analyze.ts';
import { parseMonths } from '../src/config.ts';
import { applyDecision, decide, type Onsets } from '../src/decide.ts';
import type { State } from '../src/state.ts';

const config = { summerAlertMonths: parseMonths('3-9') };

const onset = (date: string, meanC = 4): Onset => ({ date, days: [{ date, meanC }], meanC });
const cold = (date: string): Onsets => ({ below: onset(date), above: null });
const warm = (date: string): Onsets => ({ below: null, above: onset(date, 10) });
const noChange: Onsets = { below: null, above: null };

const summer: State = { currentTires: 'summer', lastAlert: null };
const winter: State = { currentTires: 'winter', lastAlert: null };

describe('decide: alerts', () => {
  it('sends a winter alert on summer tires when lasting cold is forecast', () => {
    const decision = decide(summer, cold('2026-10-20'), '2026-10-16', config);
    assert.equal(decision.type, 'alert');
    assert.equal(decision.type === 'alert' && decision.kind, 'winter');
  });

  it('sends a summer alert on winter tires when lasting warmth is forecast', () => {
    const decision = decide(winter, warm('2026-04-10'), '2026-04-05', config);
    assert.equal(decision.type === 'alert' && decision.kind, 'summer');
  });

  it('ignores warmth on summer tires and cold on winter tires', () => {
    assert.equal(decide(summer, warm('2026-06-01'), '2026-05-28', config).type, 'none');
    assert.equal(decide(winter, cold('2026-12-01'), '2026-11-28', config).type, 'none');
  });

  it('sends nothing when no lasting change is forecast', () => {
    assert.equal(decide(summer, noChange, '2026-10-16', config).type, 'none');
  });
});

describe('decide: SUMMER_ALERT_MONTHS guard', () => {
  it('blocks a summer alert during a mid-winter thaw', () => {
    const decision = decide(winter, warm('2027-01-10'), '2027-01-05', config);
    assert.equal(decision.type, 'none');
    assert.match(decision.type === 'none' ? decision.reason : '', /month 1/);
  });

  it('allows a summer alert at the edges of the range', () => {
    assert.equal(decide(winter, warm('2026-03-03'), '2026-03-01', config).type, 'alert');
    assert.equal(decide(winter, warm('2026-10-03'), '2026-09-30', config).type, 'alert');
  });

  it('checks the month of today, not of the onset', () => {
    assert.equal(decide(winter, warm('2026-03-02'), '2026-02-27', config).type, 'none');
  });

  it('never blocks a winter alert', () => {
    assert.equal(decide(summer, cold('2026-06-10'), '2026-06-05', config).type, 'alert');
    assert.equal(decide(summer, cold('2027-01-10'), '2027-01-05', config).type, 'alert');
  });
});

describe('decide: state switching and no repeats', () => {
  it('switches the tires after an alert so the same alert is not sent again', () => {
    const decision = decide(summer, cold('2026-10-20'), '2026-10-16', config);
    const next = applyDecision(summer, decision, '2026-10-16T05:00:00Z');
    assert.deepEqual(next, {
      currentTires: 'winter',
      lastAlert: { kind: 'winter', onset: '2026-10-20', sentAt: '2026-10-16T05:00:00Z', reminded: false },
    });
    assert.equal(decide(next, cold('2026-10-20'), '2026-10-17', config).type, 'none');
  });

  it('goes through a full winter and summer cycle', () => {
    let state = summer;
    state = applyDecision(state, decide(state, cold('2026-10-20'), '2026-10-16', config), 'a');
    assert.equal(state.currentTires, 'winter');
    state = applyDecision(state, decide(state, warm('2027-04-08'), '2027-04-02', config), 'b');
    assert.equal(state.currentTires, 'summer');
    assert.equal(state.lastAlert?.kind, 'summer');
  });

  it('leaves the state unchanged when nothing is sent', () => {
    const decision = decide(summer, noChange, '2026-10-16', config);
    assert.equal(applyDecision(summer, decision, 'x'), summer);
  });
});

describe('decide: reminder', () => {
  const afterWinterAlert: State = {
    currentTires: 'winter',
    lastAlert: { kind: 'winter', onset: '2026-10-25', sentAt: '2026-10-16T05:00:00Z', reminded: false },
  };

  it('reminds when the onset moves at least 3 days earlier', () => {
    const decision = decide(afterWinterAlert, cold('2026-10-22'), '2026-10-17', config);
    assert.equal(decision.type, 'reminder');
    assert.equal(decision.type === 'reminder' && decision.previousOnset, '2026-10-25');

    const next = applyDecision(afterWinterAlert, decision, '2026-10-17T05:00:00Z');
    assert.equal(next.currentTires, 'winter');
    assert.equal(next.lastAlert?.onset, '2026-10-22');
    assert.equal(next.lastAlert?.reminded, true);
  });

  it('does not remind when the onset moves less than 3 days earlier', () => {
    assert.equal(decide(afterWinterAlert, cold('2026-10-23'), '2026-10-17', config).type, 'none');
  });

  it('does not remind when the onset moves later', () => {
    assert.equal(decide(afterWinterAlert, cold('2026-10-28'), '2026-10-17', config).type, 'none');
  });

  it('sends only one reminder', () => {
    const reminded: State = {
      ...afterWinterAlert,
      lastAlert: { ...afterWinterAlert.lastAlert!, onset: '2026-10-22', reminded: true },
    };
    assert.equal(decide(reminded, cold('2026-10-18'), '2026-10-17', config).type, 'none');
  });

  it('does not remind once day D has passed', () => {
    assert.equal(decide(afterWinterAlert, cold('2026-10-20'), '2026-10-26', config).type, 'none');
  });

  it('still reminds on day D itself', () => {
    assert.equal(decide(afterWinterAlert, cold('2026-10-20'), '2026-10-25', config).type, 'reminder');
  });

  it('works for summer alerts too', () => {
    const afterSummerAlert: State = {
      currentTires: 'summer',
      lastAlert: { kind: 'summer', onset: '2027-04-10', sentAt: '2027-04-01T05:00:00Z', reminded: false },
    };
    assert.equal(decide(afterSummerAlert, warm('2027-04-06'), '2027-04-02', config).type, 'reminder');
  });
});
