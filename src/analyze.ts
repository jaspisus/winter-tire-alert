import type { DailyMean } from './weather.ts';

export type Direction = 'below' | 'above';

export interface Onset {
  /** First day of the stretch. */
  date: string;
  /** Every day from the onset to the end of the series. */
  days: DailyMean[];
  /** Mean temperature over `days`. */
  meanC: number;
}

/**
 * Finds the earliest day from which every day until the end of the series is on the given
 * side of the threshold. A day exactly at the threshold counts for neither side.
 * Returns null when there is no such stretch of at least `minDays` days.
 */
export function findOnset(
  series: DailyMean[],
  thresholdC: number,
  minDays: number,
  direction: Direction,
): Onset | null {
  const isOnSide = (day: DailyMean) =>
    direction === 'below' ? day.meanC < thresholdC : day.meanC > thresholdC;

  let start = series.length;
  while (start > 0 && isOnSide(series[start - 1]!)) start--;

  const days = series.slice(start);
  if (days.length === 0 || days.length < minDays) return null;

  const meanC = days.reduce((sum, day) => sum + day.meanC, 0) / days.length;
  return { date: days[0]!.date, days, meanC };
}
