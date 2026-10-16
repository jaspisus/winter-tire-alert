// Calendar dates are plain "YYYY-MM-DD" strings, so they compare correctly as strings.

export const TIME_ZONE = 'Europe/Warsaw';

const DAY_MS = 24 * 60 * 60 * 1000;

const formatters = new Map<string, Intl.DateTimeFormat>();

function formatterFor(timeZone: string): Intl.DateTimeFormat {
  let formatter = formatters.get(timeZone);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat('en-US', {
      timeZone,
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
    formatters.set(timeZone, formatter);
  }
  return formatter;
}

function zonedParts(instant: Date, timeZone: string) {
  const parts: Record<string, number> = {};
  for (const { type, value } of formatterFor(timeZone).formatToParts(instant)) {
    if (type !== 'literal') parts[type] = Number(value);
  }
  return parts as Record<'year' | 'month' | 'day' | 'hour' | 'minute' | 'second', number>;
}

function parseDate(date: string): [number, number, number] {
  const [y, m, d] = date.split('-').map(Number);
  return [y!, m!, d!];
}

function toDateString(utcMs: number): string {
  return new Date(utcMs).toISOString().slice(0, 10);
}

/** Calendar date of the given instant in the given time zone. */
export function dateIn(instant: Date, timeZone: string = TIME_ZONE): string {
  const p = zonedParts(instant, timeZone);
  return toDateString(Date.UTC(p.year, p.month - 1, p.day));
}

export function addDays(date: string, days: number): string {
  const [y, m, d] = parseDate(date);
  return toDateString(Date.UTC(y, m - 1, d) + days * DAY_MS);
}

export function monthOf(date: string): number {
  return parseDate(date)[1];
}

/** Offset of the time zone from UTC at the given instant, in milliseconds. */
function offsetMs(instant: Date, timeZone: string): number {
  const p = zonedParts(instant, timeZone);
  const wallClockAsUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  return wallClockAsUtc - Math.floor(instant.getTime() / 1000) * 1000;
}

/** The instant at which the wall clock in the time zone shows `hour`:00 on `date`. */
export function zonedTimeToUtc(date: string, hour: number, timeZone: string = TIME_ZONE): Date {
  const [y, m, d] = parseDate(date);
  const guess = Date.UTC(y, m - 1, d, hour);
  const firstOffset = offsetMs(new Date(guess), timeZone);
  let result = guess - firstOffset;
  // The offset may differ on the other side of a DST switch, so correct once.
  const secondOffset = offsetMs(new Date(result), timeZone);
  if (secondOffset !== firstOffset) result = guess - secondOffset;
  return new Date(result);
}

/** The first `hour`:00 in the time zone that is strictly after `after`. */
export function nextRunAt(after: Date, hour: number, timeZone: string = TIME_ZONE): Date {
  const today = dateIn(after, timeZone);
  for (let i = 0; ; i++) {
    const candidate = zonedTimeToUtc(addDays(today, i), hour, timeZone);
    if (candidate.getTime() > after.getTime()) return candidate;
  }
}
