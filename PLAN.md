# Plan: tire change alert for Gdynia (Docker, Node.js/TS, Telegram)

## Context
The rule of thumb: once the mean daily temperature drops below 7°C for good, winter tires should already be on. The app checks the **weather forecast** for Gdynia once a day, detects the first day from which the mean daily temperature stays below 7°C, and sends a **Telegram** notification far enough ahead to book a tire change. The project starts from scratch in `/Users/jasper/Code/Opony`, which is empty.

## Key decisions
- **Weather API: Open-Meteo** (`api.open-meteo.com/v1/forecast`). It is free, needs no API key, provides a 16-day forecast, returns the ready-made `temperature_2m_mean` daily variable and accepts `past_days` for the last few observed days.
  - Gdynia: `latitude=54.5189&longitude=18.5305&timezone=Europe/Warsaw&daily=temperature_2m_mean&forecast_days=16&past_days=3`
- **Node.js 24 + TypeScript with no build step.** Node 24 runs `.ts` natively (type stripping), so we skip tsc and bundlers. HTTP calls use the built-in `fetch` and tests use the built-in `node:test`.
  - **No runtime dependencies.** The only optional devDependency is `typescript`, used solely for `tsc --noEmit` type checking because Node does not check types itself. The app runs without it.
- **Base image `node:24-slim`** (Debian). It runs on an Ubuntu host with no changes. A full Ubuntu image would mean installing Node by hand, which adds nothing.
- **Scheduler inside the app** (no cron). The process does one check at startup and then one a day at a configured hour. `restart: unless-stopped` in docker compose. A `--once` mode is there for testing or for running from the host's cron.

## How "permanently below 7°C" is detected
We can't know for certain that the cold is permanent, so we approximate it from the forecast:
1. Take the series of daily means (last 3 days + 16 days of forecast).
2. Find the **earliest day D** from which **every** forecast day up to the end of the window is < `THRESHOLD_C` (default 7.0), with at least `MIN_DAYS` days in that stretch (default 5). This is the "cold onset".
3. If D exists, send an alert: *"From [D] the mean daily temperature in Gdynia stays below 7°C (next N days, mean X°C). Book a tire change, ideally before [D]."* The message also includes a short list of the daily temperatures.
4. **No spam:** one alert per season (a season runs July–June). The state is saved to `/data/state.json` (a volume). An optional reminder is sent if D moves noticeably earlier (≥ 3 days) than the previously reported date.

## File structure
```
Opony/
├── src/
│   ├── main.ts          # entry point: scheduler loop / --once, wiring
│   ├── config.ts        # reads and validates env (token, chat_id, thresholds, location, hour)
│   ├── weather.ts       # fetchDailyMeans(): Open-Meteo -> {date, meanC}[]
│   ├── analyze.ts       # findColdOnset(series, threshold, minDays): pure function
│   ├── state.ts         # read/write /data/state.json (season, last alert date, onset)
│   └── telegram.ts      # sendMessage() via api.telegram.org/bot<TOKEN>/sendMessage
├── test/
│   └── analyze.test.ts  # node:test: onset cases, warm spell inside the window, too-short series, threshold edge
├── Dockerfile           # node:24-slim, non-root user, CMD ["node", "src/main.ts"]
├── docker-compose.yml   # env_file: .env, volume ./data:/data, restart: unless-stopped, TZ=Europe/Warsaw
├── .env.example         # TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID, THRESHOLD_C, MIN_DAYS, CHECK_HOUR, LAT, LON
├── package.json         # "type": "module", scripts: start, test, typecheck
├── tsconfig.json        # for typecheck only (noEmit, erasableSyntaxOnly)
└── README.md            # setup: BotFather -> token, getUpdates -> chat_id, docker compose up
```
All code comments are in English.

## Configuration (.env)
| Variable | Default | Description |
|---|---|---|
| `TELEGRAM_BOT_TOKEN` | required | token from @BotFather |
| `TELEGRAM_CHAT_ID` | required | chat id (from `getUpdates`) |
| `THRESHOLD_C` | `7` | temperature threshold |
| `MIN_DAYS` | `5` | minimum length of the cold stretch in the forecast |
| `CHECK_HOUR` | `7` | hour of the daily check (Europe/Warsaw) |
| `LAT` / `LON` | Gdynia | location, can be changed |

## Error handling
- API or network error: log it, retry once after a few minutes, and the next day's run tries again. The process never crashes the container.
- Telegram error: log the error and do not save the state as "sent", so the next run retries.
- Missing token or chat_id at startup: exit with a clear message.

## Verification
1. `npm test` runs the unit tests for `findColdOnset` (synthetic series).
2. `npm run typecheck` runs `tsc --noEmit`.
3. `docker compose run --rm opony node src/main.ts --once --dry-run` prints the fetched temperatures, the computed onset and the message, without sending anything.
4. `THRESHOLD_C=30 docker compose run --rm opony node src/main.ts --once` forces the condition to be met, so the Telegram message arrives. Running it again sends nothing (state works).
5. `docker compose up -d` and `docker compose logs -f` show the startup check and the next scheduled time.

## Out of scope (possible extension)
- A reverse alert in spring (switching to summer tires when the mean stays > 7°C).
