import { TIME_ZONE } from './time.ts';

export interface DailyMean {
  date: string;
  meanC: number;
}

const FORECAST_URL = 'https://api.open-meteo.com/v1/forecast';
const REQUEST_TIMEOUT_MS = 15_000;

interface ForecastResponse {
  daily?: {
    time?: unknown;
    temperature_2m_mean?: unknown;
  };
}

/** Fetches the mean daily temperatures for the last 3 days and the next 16 days. */
export async function fetchDailyMeans(lat: number, lon: number): Promise<DailyMean[]> {
  const params = new URLSearchParams({
    latitude: String(lat),
    longitude: String(lon),
    timezone: TIME_ZONE,
    daily: 'temperature_2m_mean',
    forecast_days: '16',
    past_days: '3',
  });
  const response = await fetch(`${FORECAST_URL}?${params}`, {
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  if (!response.ok) {
    throw new Error(`Open-Meteo request failed: HTTP ${response.status} ${await response.text()}`);
  }

  const body = (await response.json()) as ForecastResponse;
  const dates = body.daily?.time;
  const means = body.daily?.temperature_2m_mean;
  if (!Array.isArray(dates) || !Array.isArray(means) || dates.length !== means.length) {
    throw new Error('Open-Meteo response has no usable daily.time / daily.temperature_2m_mean');
  }

  // Days without data (null) are skipped; they usually only occur at the far end of the forecast.
  const series: DailyMean[] = [];
  dates.forEach((date, i) => {
    const meanC = means[i];
    if (typeof date === 'string' && typeof meanC === 'number') series.push({ date, meanC });
  });
  if (series.length === 0) throw new Error('Open-Meteo returned no daily mean temperatures');
  return series;
}
