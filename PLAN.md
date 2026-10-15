# Plan: tire change alerts for Gdynia (Docker, Node.js/TS, Telegram)

## Context
The rule of thumb: once the mean daily temperature drops below 7°C for good, winter tires should already be on. Once it stays above 7°C in spring, it's time to switch back to summer tires. The app checks the **weather forecast** for Gdynia once a day and detects both transitions:
- **Winter alert:** the first day from which the mean daily temperature stays below 7°C.
- **Summer alert:** the first day from which it stays above 7°C.

Each alert is sent as a **Telegram** notification far enough ahead to book a tire change.

**Target environment:** a computer running **Ubuntu Server** (22.04 / 24.04 LTS, amd64 or arm64, e.g. a mini PC or Raspberry Pi) with **Docker Engine + the compose plugin**. The server needs nothing else installed (no Node.js). It needs only outbound HTTPS to `api.open-meteo.com` and `api.telegram.org`, and it exposes no ports.

## Key decisions
- **Weather API: Open-Meteo** (`api.open-meteo.com/v1/forecast`). It is free, needs no API key, provides a 16-day forecast, returns the ready-made `temperature_2m_mean` daily variable and accepts `past_days` for the last few observed days.
  - Gdynia: `latitude=54.5189&longitude=18.5305&timezone=Europe/Warsaw&daily=temperature_2m_mean&forecast_days=16&past_days=3`
- **Node.js 24 + TypeScript with no build step.** Node 24 runs `.ts` natively (type stripping), so we skip tsc and bundlers. HTTP calls use the built-in `fetch` and tests use the built-in `node:test`.
  - **No runtime dependencies.** The only optional devDependency is `typescript`, used solely for `tsc --noEmit` type checking during development because Node does not check types itself. The Docker image does not include it.
- **Base image `node:24-slim`.** It is multi-arch (amd64 and arm64), so the same `Dockerfile` builds on an x86 server and on a Raspberry Pi. The image is built **on the server itself** (`docker compose up -d --build`), so no registry is needed.
- **Scheduler inside the app** (no cron). The process does one check at startup and then one a day at `CHECK_HOUR`. That hour is computed explicitly in `Europe/Warsaw` via `Intl`, so the server's and container's timezone settings don't matter.
- **Starts automatically after a server reboot.** Docker is enabled in systemd (`systemctl enable docker`), and `restart: unless-stopped` in compose brings the container back up. No custom systemd unit is needed.
- **State in a named Docker volume** (`tire-alert-data:/data`), not a bind mount. This avoids permission problems between the container's non-root user and the host user's directory, and it survives `git pull` and image rebuilds.
- **Logs** go to stdout, with the `json-file` driver capped at `max-size: 1m` and `max-file: 3`, so they don't fill the server's disk.

## How a lasting temperature change is detected
We can't know for certain that a change is permanent, so we approximate it from the forecast:
1. Take the series of daily means (last 3 days + 16 days of forecast).
2. Find the **earliest day D** from which **every** forecast day up to the end of the window is on the other side of `THRESHOLD_C` (default 7.0), with at least `MIN_DAYS` days in that stretch (default 5). This is the "onset".
   - Winter: every day is `< THRESHOLD_C`.
   - Summer: every day is `> THRESHOLD_C`.
   - A day exactly at the threshold counts for neither, so it breaks the stretch.
3. If D exists, send the matching alert. The message also includes a short list of the daily temperatures.
   - Winter: *"From [D] the mean daily temperature in Gdynia stays below 7°C (next N days, mean X°C). Book a change to winter tires, ideally before [D]."*
   - Summer: *"From [D] the mean daily temperature in Gdynia stays above 7°C (next N days, mean X°C). You can book a change to summer tires."*

## Which alert is active: a two-state switch
The app remembers which tires are currently on and only looks for the transition **away** from that state. This stops the two alerts from flapping back and forth.

| Current tires | Looks for | After the alert is sent |
|---|---|---|
| `summer` | lasting cold (winter alert) | switches to `winter` |
| `winter` | lasting warmth (summer alert) | switches to `summer` |

- **Starting state:** taken from `CURRENT_TIRES` (`summer` or `winter`) on the first run, when there is no state file yet. After that, the state file decides. The current state is logged at every startup.
- **Mid-winter thaws:** a warm spell in December–February could otherwise trigger a premature summer alert. Summer alerts are therefore only sent within `SUMMER_ALERT_MONTHS` (default `3-9`, i.e. March–September). Winter alerts need no such guard.
- **Reminder:** after an alert, until day D passes, a newer forecast that moves D at least 3 days earlier triggers one short reminder with the new date.
- The state is saved to `/data/state.json` in the volume: `{ currentTires, lastAlert: { kind, onset, sentAt } }`.

## File structure
```
winter-tire-alert/
├── src/
│   ├── main.ts          # entry point: scheduler loop / --once / --dry-run, wiring
│   ├── config.ts        # reads and validates env (token, chat_id, thresholds, location, hour, tires, months)
│   ├── weather.ts       # fetchDailyMeans(): Open-Meteo -> {date, meanC}[]
│   ├── analyze.ts       # findOnset(series, threshold, minDays, direction: 'below' | 'above'): pure function
│   ├── decide.ts        # decide(state, onsets, today, config) -> alert | reminder | nothing: pure function
│   ├── messages.ts      # builds the winter / summer / reminder message texts
│   ├── state.ts         # read/write /data/state.json
│   └── telegram.ts      # sendMessage() via api.telegram.org/bot<TOKEN>/sendMessage
├── test/
│   ├── analyze.test.ts  # both directions: onset cases, interrupting spell inside the window, too-short series, threshold edge
│   └── decide.test.ts   # state switching, SUMMER_ALERT_MONTHS guard, reminder rule, no repeat alerts
├── Dockerfile           # node:24-slim, copies only src/ + package.json, USER node, CMD ["node", "src/main.ts"]
├── .dockerignore        # .git, .env, node_modules, test, docs
├── docker-compose.yml   # service tire-alert: build ., env_file .env, volume tire-alert-data:/data,
│                        # restart: unless-stopped, log rotation
├── .env.example         # all variables from the table below
├── package.json         # "type": "module", scripts: start, test, typecheck
├── tsconfig.json        # for typecheck only (noEmit, erasableSyntaxOnly)
└── README.md            # Ubuntu Server installation, Telegram setup, operation, update, uninstall
```
All code comments are in English.

## Configuration (.env)
| Variable | Default | Description |
|---|---|---|
| `TELEGRAM_BOT_TOKEN` | required | token from @BotFather (not required with `--dry-run`) |
| `TELEGRAM_CHAT_ID` | required | chat id (from `getUpdates`) |
| `CURRENT_TIRES` | `summer` | tires on the car at first start (`summer` / `winter`); ignored once state exists |
| `THRESHOLD_C` | `7` | temperature threshold, shared by both alerts |
| `MIN_DAYS` | `5` | minimum length of the cold or warm stretch in the forecast |
| `SUMMER_ALERT_MONTHS` | `3-9` | months in which summer alerts may be sent |
| `CHECK_HOUR` | `7` | hour of the daily check (Europe/Warsaw) |
| `LAT` / `LON` | Gdynia | location, can be changed |

`.env` holds the bot token. On the server it is set to `chmod 600`, and it is excluded from git and from the Docker build context.

## CLI flags
- `--once`: run a single check and exit.
- `--dry-run`: print the result without sending or saving anything.

## Deployment on Ubuntu Server (described step by step in README)
1. Install Docker Engine + the compose plugin from Docker's official apt repository, then run `systemctl enable --now docker`. Optionally, add the user to the `docker` group.
2. Clone the public repo over HTTPS: `git clone https://github.com/jaspisus/winter-tire-alert.git`.
3. `cp .env.example .env`, fill in the token, chat_id and `CURRENT_TIRES`, then `chmod 600 .env`.
4. Run a test: `docker compose run --rm tire-alert node src/main.ts --once --dry-run`.
5. Start it: `docker compose up -d --build`.
6. **Update:** `git pull && docker compose up -d --build`. **Logs:** `docker compose logs -f`. **Uninstall:** `docker compose down -v`.
7. **Reset the tire state** (e.g. tires changed earlier or later than the alert said): `docker compose down -v`, set `CURRENT_TIRES` in `.env`, then `docker compose up -d`.

## Error handling
- API or network error: log it, retry once after a few minutes, and the next day's run tries again. The process never crashes the container.
- Telegram error: log the error and do not save the state as "sent", so the next run retries.
- Missing token or chat_id at startup (without `--dry-run`): exit with a clear message. Because of `restart: unless-stopped`, the container would then restart in a loop, so the README tells you to run the `--dry-run` test first.
- Invalid `CURRENT_TIRES` or `SUMMER_ALERT_MONTHS`: exit with a clear message.
- `--dry-run` never writes state.

## Verification
1. Locally: `npm test` runs the unit tests for `findOnset` and `decide`, and `npm run typecheck` runs `tsc --noEmit`.
2. On the server (or in an Ubuntu Server VM): `docker compose run --rm tire-alert node src/main.ts --once --dry-run` prints the temperatures, the current tires, both onsets and the message.
3. **Winter alert:** with `CURRENT_TIRES=summer`, run `docker compose run --rm -e THRESHOLD_C=30 tire-alert node src/main.ts --once`. The forced condition sends the winter alert and the state switches to `winter`. Running it again sends nothing.
4. **Summer alert:** `docker compose run --rm -e THRESHOLD_C=-30 -e SUMMER_ALERT_MONTHS=1-12 tire-alert node src/main.ts --once` sends the summer alert and the state switches back to `summer`.
5. **Thaw guard:** the same command without `SUMMER_ALERT_MONTHS=1-12`, run outside March–September, sends nothing.
6. `docker compose up -d --build`, then `docker compose logs -f` shows the current tires, the startup check and the next scheduled time.
7. `sudo reboot`, then `docker compose ps` shows the container running again.

## Out of scope (possible extension)
- Telegram commands (e.g. `/winter`, `/summer`) to set the current tires from the phone.
- Publishing a ready-made image to GHCR, so the server doesn't build it itself.
