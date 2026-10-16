export type Tires = 'summer' | 'winter';

export interface Config {
  telegramBotToken: string;
  telegramChatId: string;
  currentTires: Tires;
  thresholdC: number;
  minDays: number;
  summerAlertMonths: Set<number>;
  checkHour: number;
  lat: number;
  lon: number;
  locationName: string;
  stateFile: string;
}

export class ConfigError extends Error {}

type Env = Record<string, string | undefined>;

function read(env: Env, name: string): string | undefined {
  const value = env[name]?.trim();
  return value ? value : undefined;
}

function readNumber(env: Env, name: string, fallback: number): number {
  const raw = read(env, name);
  if (raw === undefined) return fallback;
  const value = Number(raw);
  if (!Number.isFinite(value)) throw new ConfigError(`${name} must be a number, got "${raw}"`);
  return value;
}

function readInteger(env: Env, name: string, fallback: number, min: number, max: number): number {
  const value = readNumber(env, name, fallback);
  if (!Number.isInteger(value) || value < min || value > max) {
    throw new ConfigError(`${name} must be an integer between ${min} and ${max}, got "${value}"`);
  }
  return value;
}

/**
 * Parses a month list such as "3-9", "4,5,6" or "11-2" (a range may wrap around the new year).
 */
export function parseMonths(raw: string): Set<number> {
  const months = new Set<number>();
  const toMonth = (part: string): number => {
    const month = Number(part);
    if (!/^\d+$/.test(part) || month < 1 || month > 12) {
      throw new ConfigError(`SUMMER_ALERT_MONTHS: "${part}" is not a month (1-12) in "${raw}"`);
    }
    return month;
  };
  for (const token of raw.split(',').map((t) => t.trim())) {
    const bounds = token.split('-').map((t) => t.trim());
    if (bounds.length === 1) {
      months.add(toMonth(bounds[0]!));
    } else if (bounds.length === 2) {
      const from = toMonth(bounds[0]!);
      const to = toMonth(bounds[1]!);
      for (let m = from; ; m = (m % 12) + 1) {
        months.add(m);
        if (m === to) break;
      }
    } else {
      throw new ConfigError(`SUMMER_ALERT_MONTHS: cannot parse "${token}" in "${raw}"`);
    }
  }
  return months;
}

function readTires(env: Env): Tires {
  const raw = read(env, 'CURRENT_TIRES') ?? 'summer';
  if (raw !== 'summer' && raw !== 'winter') {
    throw new ConfigError(`CURRENT_TIRES must be "summer" or "winter", got "${raw}"`);
  }
  return raw;
}

export function loadConfig(env: Env, options: { requireTelegram: boolean }): Config {
  const telegramBotToken = read(env, 'TELEGRAM_BOT_TOKEN') ?? '';
  const telegramChatId = read(env, 'TELEGRAM_CHAT_ID') ?? '';
  if (options.requireTelegram) {
    const missing = [
      !telegramBotToken && 'TELEGRAM_BOT_TOKEN',
      !telegramChatId && 'TELEGRAM_CHAT_ID',
    ].filter(Boolean);
    if (missing.length > 0) {
      throw new ConfigError(`Missing ${missing.join(' and ')} in .env (not needed with --dry-run).`);
    }
  }

  return {
    telegramBotToken,
    telegramChatId,
    currentTires: readTires(env),
    thresholdC: readNumber(env, 'THRESHOLD_C', 7),
    minDays: readInteger(env, 'MIN_DAYS', 5, 1, 19),
    summerAlertMonths: parseMonths(read(env, 'SUMMER_ALERT_MONTHS') ?? '3-9'),
    checkHour: readInteger(env, 'CHECK_HOUR', 7, 0, 23),
    lat: readNumber(env, 'LAT', 54.5189),
    lon: readNumber(env, 'LON', 18.5305),
    locationName: read(env, 'LOCATION_NAME') ?? 'Gdynia',
    stateFile: read(env, 'STATE_FILE') ?? 'data/state.json',
  };
}
