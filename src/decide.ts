import type { Direction, Onset } from './analyze.ts';
import type { Config, Tires } from './config.ts';
import type { State } from './state.ts';
import { addDays, monthOf } from './time.ts';

/** How many days earlier a newer forecast must move the onset to trigger a reminder. */
export const REMINDER_MIN_SHIFT_DAYS = 3;

export type Onsets = Record<Direction, Onset | null>;

export type Decision =
  | { type: 'alert'; kind: Tires; onset: Onset }
  | { type: 'reminder'; kind: Tires; onset: Onset; previousOnset: string }
  | { type: 'none'; reason: string };

/** Winter tires go on when it stays cold, summer tires when it stays warm. */
export const directionFor = (kind: Tires): Direction => (kind === 'winter' ? 'below' : 'above');

/**
 * Decides what to send today. Only the change away from the current tires is looked for,
 * so the two alerts can never flip back and forth.
 */
export function decide(
  state: State,
  onsets: Onsets,
  today: string,
  config: Pick<Config, 'summerAlertMonths'>,
): Decision {
  const target: Tires = state.currentTires === 'summer' ? 'winter' : 'summer';
  const targetOnset = onsets[directionFor(target)];
  if (targetOnset) {
    const month = monthOf(today);
    if (target === 'summer' && !config.summerAlertMonths.has(month)) {
      return {
        type: 'none',
        reason: `lasting warmth from ${targetOnset.date}, but summer alerts are off in month ${month}`,
      };
    }
    return { type: 'alert', kind: target, onset: targetOnset };
  }

  const last = state.lastAlert;
  if (last && last.kind === state.currentTires && !last.reminded && today <= last.onset) {
    const newOnset = onsets[directionFor(last.kind)];
    if (newOnset && newOnset.date <= addDays(last.onset, -REMINDER_MIN_SHIFT_DAYS)) {
      return { type: 'reminder', kind: last.kind, onset: newOnset, previousOnset: last.onset };
    }
  }

  return { type: 'none', reason: `no lasting change away from ${state.currentTires} tires` };
}

/** The state to save after the decision's message has been sent. */
export function applyDecision(state: State, decision: Decision, sentAt: string): State {
  switch (decision.type) {
    case 'alert':
      return {
        currentTires: decision.kind,
        lastAlert: { kind: decision.kind, onset: decision.onset.date, sentAt, reminded: false },
      };
    case 'reminder':
      return {
        ...state,
        lastAlert: { kind: decision.kind, onset: decision.onset.date, sentAt, reminded: true },
      };
    case 'none':
      return state;
  }
}
