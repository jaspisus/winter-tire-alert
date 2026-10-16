import type { Onset } from './analyze.ts';
import type { Config } from './config.ts';
import type { Decision } from './decide.ts';
import type { DailyMean } from './weather.ts';

type MessageConfig = Pick<Config, 'thresholdC' | 'locationName'>;

const dateFormatter = new Intl.DateTimeFormat('en-GB', {
  weekday: 'short',
  day: 'numeric',
  month: 'short',
  timeZone: 'UTC',
});

/** Formats "2026-10-21" as "Wed 21 Oct". */
export function formatDate(date: string): string {
  return dateFormatter.format(new Date(`${date}T00:00:00Z`)).replace(',', '');
}

export const formatTemp = (meanC: number): string => `${meanC.toFixed(1)}°C`;

const formatThreshold = (thresholdC: number): string => `${thresholdC}°C`;

export function formatSeries(days: DailyMean[]): string {
  return days.map((day) => `${formatDate(day.date)}: ${formatTemp(day.meanC)}`).join('\n');
}

function stretchSummary(onset: Onset): string {
  return `${onset.days.length} days, mean ${formatTemp(onset.meanC)}`;
}

export function buildMessage(
  decision: Exclude<Decision, { type: 'none' }>,
  config: MessageConfig,
  today: string,
): string {
  const { onset } = decision;
  const where = config.locationName;
  const threshold = formatThreshold(config.thresholdC);
  const from = formatDate(onset.date);
  const side = decision.kind === 'winter' ? 'below' : 'above';
  const when = onset.date > today ? `ideally before ${from}` : 'as soon as possible';

  let text: string;
  if (decision.type === 'alert') {
    text =
      decision.kind === 'winter'
        ? `❄️ Time for winter tires\n\nFrom ${from} the mean daily temperature in ${where} stays below ${threshold} (${stretchSummary(onset)}). Book a change to winter tires, ${when}.`
        : `☀️ Time for summer tires\n\nFrom ${from} the mean daily temperature in ${where} stays above ${threshold} (${stretchSummary(onset)}). You can book a change to summer tires.`;
  } else {
    text = `⏰ Reminder: ${decision.kind} tires\n\nThe forecast moved the date earlier: from ${from} (previously ${formatDate(decision.previousOnset)}) the mean daily temperature in ${where} stays ${side} ${threshold} (${stretchSummary(onset)}).`;
  }

  return `${text}\n\n${formatSeries(onset.days)}`;
}
