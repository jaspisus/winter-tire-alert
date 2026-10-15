# winter-tire-alert

Sends a Telegram notification when the weather forecast for Gdynia shows the mean daily temperature dropping below 7°C for good. That is the usual rule of thumb for when winter tires should already be on, so you get time to book a tire change.

> **Status:** in development. See [PLAN.md](PLAN.md) for the design.

## How it works

1. Once a day, the app fetches the 16-day forecast of mean daily temperatures from [Open-Meteo](https://open-meteo.com/). Open-Meteo is free and needs no API key.
2. It looks for the first day from which every forecast day stays below the threshold, for at least `MIN_DAYS` days in a row.
3. If it finds that day, it sends a Telegram message with the date and the forecast, at most once per season.

## Stack

- Node.js 24 running TypeScript natively, with no build step and no runtime dependencies
- Docker / docker compose (runs on any Ubuntu host)
- Telegram Bot API for notifications

## Setup

1. Create a bot with [@BotFather](https://t.me/BotFather) and copy its token.
2. Send any message to your bot, then open `https://api.telegram.org/bot<TOKEN>/getUpdates` and copy `chat.id`.
3. Copy `.env.example` to `.env` and fill in the values:

| Variable | Default | Description |
|---|---|---|
| `TELEGRAM_BOT_TOKEN` | required | Bot token from @BotFather |
| `TELEGRAM_CHAT_ID` | required | Target chat id |
| `THRESHOLD_C` | `7` | Mean daily temperature threshold (°C) |
| `MIN_DAYS` | `5` | Minimum length of the cold stretch in the forecast |
| `CHECK_HOUR` | `7` | Hour of the daily check (Europe/Warsaw) |
| `LAT` / `LON` | Gdynia | Location |

4. Start it:

```sh
docker compose up -d
docker compose logs -f
```

## Development

```sh
npm test             # unit tests (node:test)
npm run typecheck    # tsc --noEmit
node src/main.ts --once --dry-run   # single check, prints the message instead of sending it
```
