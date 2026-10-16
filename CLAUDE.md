# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

The app sends a Telegram alert to change tires, based on the Open-Meteo forecast for Gdynia. The winter alert comes when the mean daily temperature is about to stay below `THRESHOLD_C` (default 7°C) for good, and the summer alert when it is about to stay above it. It runs as a single Docker container on Ubuntu Server. Installation and operation are covered in `README.md`.

## Commands

```sh
npm test                              # all tests (node:test, glob test/**/*.test.ts)
node --test test/decide.test.ts       # a single test file
node --test --test-name-pattern="reminder" test/decide.test.ts   # selected tests
npm run typecheck                     # tsc --noEmit (needs npm install)
node src/main.ts --once --dry-run     # one check on the live forecast, without sending or saving
docker compose run --rm tire-alert node src/main.ts --once --dry-run   # the same in the container
```

There is no build step and no linter.

## Technical constraints

- **Node 24 runs `.ts` directly (type stripping), without compiling.** Because of that:
  - relative imports must use the `.ts` extension,
  - only erasable syntax is allowed (`erasableSyntaxOnly`): no `enum`, `namespace` or parameter properties,
  - type-only imports are written as `import type` (`verbatimModuleSyntax`).
- **No runtime dependencies.** HTTP uses the built-in `fetch`, tests use `node:test`, time zones use `Intl`. `typescript` and `@types/node` are devDependencies for `typecheck` only and are not in the image. The `Dockerfile` copies only `package.json` and `src/`.
- **Calendar dates are `YYYY-MM-DD` strings** and are compared as strings. Date arithmetic lives in `src/time.ts` (`addDays`, `monthOf`). "Today" and the check hour are always computed in `Europe/Warsaw`, regardless of the server's time zone.

## Architecture

The flow of a single check (`runCheck` in `src/main.ts`):

1. `weather.ts` fetches daily means from Open-Meteo: 3 past days and 16 forecast days. Days with `null` are skipped.
2. `analyze.ts` → `findOnset()` runs separately for `below` and `above`. The result is the earliest day D from which **every** day until the end of the series is on that side of the threshold, with at least `MIN_DAYS` days. A day equal to the threshold breaks the stretch, so both directions can never be found at once.
3. `decide.ts` → `decide()` returns `alert`, `reminder` or `none`. It is a two-state switch based on `state.currentTires`:
   - it only looks for the change **away** from the current tires, so an alert neither repeats nor flips back and forth;
   - summer alerts are blocked by `SUMMER_ALERT_MONTHS`, using the month of the check day, not of day D;
   - a reminder is sent once (`lastAlert.reminded`), before D has passed, if D moved at least `REMINDER_MIN_SHIFT_DAYS` (3) days earlier.
4. `messages.ts` builds the message text and `telegram.ts` sends it.
5. Only after a successful send does `applyDecision()` compute the new state, which `state.ts` writes atomically (tmp file + rename). A Telegram error means the state isn't saved, so the next run sends again.

`analyze.ts` and `decide.ts` are pure functions and most tests target them. I/O, the 5-minute retry and the scheduler live in `main.ts`.

Other rules:

- **State** (`state.json`) is re-read on every check, because a one-off `docker compose run ... --once` can change it next to the running service.
  - On the first run (without `--dry-run`) the starting state from `CURRENT_TIRES` is saved right away. From then on `CURRENT_TIRES` is ignored.
  - The path comes from `STATE_FILE`: `data/state.json` locally, `/data/state.json` on the `tire-alert-data` volume in the image.
- **Scheduler:** `nextRunAt()` finds the next `CHECK_HOUR`:00 in Warsaw, correct across DST switches. The process handles SIGTERM itself, because as PID 1 in the container it would otherwise ignore it.
- **Config:** `config.ts` reads env and throws `ConfigError`. Telegram settings are only required without `--dry-run`.

## Conventions

- Error messages must never include the api.telegram.org URL, because it contains the bot token.
- When adding an environment variable, update `config.ts`, `.env.example` and the table in `README.md` together.
- Manual alert checks: `-e THRESHOLD_C=30` forces a winter alert, `-e THRESHOLD_C=-30 -e SUMMER_ALERT_MONTHS=1-12` a summer one. Both change the saved state; reset it with `docker compose down -v`.
