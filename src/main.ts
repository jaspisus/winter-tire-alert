import { setTimeout as sleep } from 'node:timers/promises';
import { parseArgs } from 'node:util';
import { findOnset } from './analyze.ts';
import { type Config, ConfigError, loadConfig } from './config.ts';
import { applyDecision, decide, type Onsets } from './decide.ts';
import { buildMessage, formatDate, formatTemp } from './messages.ts';
import { readState, type State, writeState } from './state.ts';
import { sendMessage } from './telegram.ts';
import { dateIn, nextRunAt, TIME_ZONE } from './time.ts';
import { fetchDailyMeans } from './weather.ts';

const RETRY_DELAY_MS = 5 * 60 * 1000;

const log = (message: string) => console.log(`${new Date().toISOString()} ${message}`);
const logError = (message: string, error: unknown) =>
  console.error(`${new Date().toISOString()} ${message}: ${error instanceof Error ? error.message : error}`);

const describeOnset = (onsets: Onsets, direction: keyof Onsets): string => {
  const onset = onsets[direction];
  return onset
    ? `${formatDate(onset.date)} (${onset.days.length} days, mean ${formatTemp(onset.meanC)})`
    : 'none';
};

async function loadOrInitState(config: Config, dryRun: boolean): Promise<State> {
  const saved = await readState(config.stateFile);
  if (saved) return saved;
  const initial: State = { currentTires: config.currentTires, lastAlert: null };
  // Persist the starting state right away, so from now on the state file decides, not CURRENT_TIRES.
  if (!dryRun) await writeState(config.stateFile, initial);
  return initial;
}

async function runCheck(config: Config, dryRun: boolean): Promise<void> {
  const today = dateIn(new Date());
  const series = await fetchDailyMeans(config.lat, config.lon);
  // Re-read on every check, so a one-off `--once` run in a second container is picked up.
  const state = await loadOrInitState(config, dryRun);

  const onsets: Onsets = {
    below: findOnset(series, config.thresholdC, config.minDays, 'below'),
    above: findOnset(series, config.thresholdC, config.minDays, 'above'),
  };
  log(`Daily means: ${series.map((d) => `${d.date.slice(5)} ${d.meanC.toFixed(1)}`).join(', ')}`);
  log(`Current tires: ${state.currentTires}; lasting cold from: ${describeOnset(onsets, 'below')}; lasting warmth from: ${describeOnset(onsets, 'above')}`);

  const decision = decide(state, onsets, today, config);
  if (decision.type === 'none') {
    log(`Nothing to send: ${decision.reason}`);
    return;
  }

  const text = buildMessage(decision, config, today);
  if (dryRun) {
    log(`[dry run] Would send ${decision.type} (${decision.kind}) and save state:\n${text}`);
    return;
  }

  await sendMessage(config.telegramBotToken, config.telegramChatId, text);
  const next = applyDecision(state, decision, new Date().toISOString());
  await writeState(config.stateFile, next);
  log(`Sent ${decision.type} (${decision.kind}, onset ${decision.onset.date}); current tires: ${next.currentTires}`);
}

async function runCheckWithRetry(config: Config, dryRun: boolean): Promise<void> {
  try {
    await runCheck(config, dryRun);
    return;
  } catch (error) {
    logError(`Check failed, retrying in ${RETRY_DELAY_MS / 60_000} minutes`, error);
  }
  await sleep(RETRY_DELAY_MS);
  try {
    await runCheck(config, dryRun);
  } catch (error) {
    logError('Retry failed, will try again at the next scheduled check', error);
  }
}

async function runScheduler(config: Config, dryRun: boolean): Promise<never> {
  await runCheckWithRetry(config, dryRun);
  let scheduled = new Date();
  for (;;) {
    // Never schedule before the previous slot, in case a timer fires a little early.
    scheduled = nextRunAt(new Date(Math.max(Date.now(), scheduled.getTime())), config.checkHour);
    log(`Next check at ${scheduled.toISOString()} (${String(config.checkHour).padStart(2, '0')}:00 ${TIME_ZONE})`);
    await sleep(scheduled.getTime() - Date.now());
    await runCheckWithRetry(config, dryRun);
  }
}

async function main(): Promise<void> {
  const { values } = parseArgs({
    options: {
      once: { type: 'boolean', default: false },
      'dry-run': { type: 'boolean', default: false },
    },
  });
  const once = values.once;
  const dryRun = values['dry-run'];

  let config: Config;
  let state: State;
  try {
    config = loadConfig(process.env, { requireTelegram: !dryRun });
    state = await loadOrInitState(config, dryRun);
  } catch (error) {
    const prefix = error instanceof ConfigError ? 'Configuration error' : 'Startup failed';
    logError(prefix, error);
    process.exit(1);
  }

  log(
    `Starting${dryRun ? ' (dry run)' : ''}: current tires ${state.currentTires}, threshold ${config.thresholdC}°C, ` +
      `min ${config.minDays} days, location ${config.locationName} (${config.lat}, ${config.lon}), state ${config.stateFile}`,
  );

  if (once) {
    try {
      await runCheck(config, dryRun);
    } catch (error) {
      logError('Check failed', error);
      process.exit(1);
    }
    return;
  }

  await runScheduler(config, dryRun);
}

// The container sends SIGTERM on `docker compose down`; Node as PID 1 would otherwise ignore it.
for (const signal of ['SIGTERM', 'SIGINT'] as const) {
  process.on(signal, () => {
    log(`Received ${signal}, exiting`);
    process.exit(0);
  });
}

await main();
