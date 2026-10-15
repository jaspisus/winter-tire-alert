# winter-tire-alert

Sends a Telegram notification when the weather forecast for Gdynia shows the mean daily temperature dropping below 7°C for good. That is the usual rule of thumb for when winter tires should already be on, so you get time to book a tire change.

It runs as a single Docker container on an **Ubuntu Server** machine (amd64 or arm64, e.g. a mini PC or Raspberry Pi).

> **Status:** in development. See [PLAN.md](PLAN.md) for the design.

## How it works

1. Once a day, the app fetches the 16-day forecast of mean daily temperatures from [Open-Meteo](https://open-meteo.com/). Open-Meteo is free and needs no API key.
2. It looks for the first day from which every forecast day stays below the threshold, for at least `MIN_DAYS` days in a row.
3. If it finds that day, it sends a Telegram message with the date and the forecast, at most once per season.

## Stack

- Node.js 24 running TypeScript natively, with no build step and no runtime dependencies
- Docker Engine + docker compose plugin. The image is built on the server, so no Node.js install is needed there.
- Telegram Bot API for notifications

## Requirements

- Ubuntu Server 22.04 or 24.04 LTS (amd64 or arm64)
- Outbound HTTPS access to `api.open-meteo.com` and `api.telegram.org`. No inbound ports are needed.
- A Telegram account

## Installation on Ubuntu Server

### 1. Install Docker

Install Docker Engine and the compose plugin from Docker's official repository:

```sh
sudo apt-get update
sudo apt-get install -y ca-certificates curl git
sudo install -m 0755 -d /etc/apt/keyrings
sudo curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
sudo chmod a+r /etc/apt/keyrings/docker.asc
echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] \
  https://download.docker.com/linux/ubuntu $(. /etc/os-release && echo "${UBUNTU_CODENAME:-$VERSION_CODENAME}") stable" \
  | sudo tee /etc/apt/sources.list.d/docker.list > /dev/null
sudo apt-get update
sudo apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin

# Start Docker now and on every boot
sudo systemctl enable --now docker

# Optional: run docker without sudo. Log out and back in for this to take effect.
sudo usermod -aG docker $USER
```

Check it with `docker compose version`.

### 2. Get the code

The repository is private, so the server uses a read-only **deploy key**. The key grants access to this one repository only.

```sh
ssh-keygen -t ed25519 -f ~/.ssh/winter-tire-alert -N "" -C "winter-tire-alert deploy key"
cat ~/.ssh/winter-tire-alert.pub
```

Add the printed public key on GitHub: **repository → Settings → Deploy keys → Add deploy key**. Leave "Allow write access" unchecked.

```sh
cat >> ~/.ssh/config <<'EOF'
Host github-winter-tire-alert
  HostName github.com
  User git
  IdentityFile ~/.ssh/winter-tire-alert
  IdentitiesOnly yes
EOF

git clone git@github-winter-tire-alert:jaspisus/winter-tire-alert.git ~/winter-tire-alert
cd ~/winter-tire-alert
```

### 3. Create a Telegram bot

1. Create a bot with [@BotFather](https://t.me/BotFather) (`/newbot`) and copy its token.
2. Send any message to your new bot.
3. Open `https://api.telegram.org/bot<TOKEN>/getUpdates` and copy `message.chat.id`.

### 4. Configure

```sh
cp .env.example .env
nano .env
chmod 600 .env   # the file contains the bot token
```

| Variable | Default | Description |
|---|---|---|
| `TELEGRAM_BOT_TOKEN` | required | Bot token from @BotFather |
| `TELEGRAM_CHAT_ID` | required | Target chat id |
| `THRESHOLD_C` | `7` | Mean daily temperature threshold (°C) |
| `MIN_DAYS` | `5` | Minimum length of the cold stretch in the forecast |
| `CHECK_HOUR` | `7` | Hour of the daily check (always Europe/Warsaw, regardless of server timezone) |
| `LAT` / `LON` | Gdynia | Location |

### 5. Test

```sh
# Fetch the forecast and print the message without sending anything
docker compose run --rm tire-alert node src/main.ts --once --dry-run

# Force the condition to check that the Telegram message arrives
docker compose run --rm -e THRESHOLD_C=30 tire-alert node src/main.ts --once
```

After this test, the season is marked as "notified". To get a real alert later this season, reset the state:

```sh
docker compose down -v
```

### 6. Run

```sh
docker compose up -d --build
docker compose logs -f
```

The container restarts automatically after a crash or a server reboot (`restart: unless-stopped`, with Docker enabled in systemd).

## Operation

| Task | Command (run in `~/winter-tire-alert`) |
|---|---|
| Status | `docker compose ps` |
| Logs | `docker compose logs -f` |
| One-off check | `docker compose exec tire-alert node src/main.ts --once --dry-run` |
| Update | `git pull && docker compose up -d --build` |
| Change settings | edit `.env`, then `docker compose up -d` |
| Stop | `docker compose down` |
| Uninstall (including state) | `docker compose down -v --rmi local` |

State (whether this season's alert was already sent) lives in the `tire-alert-data` Docker volume, so it survives updates and rebuilds. Logs are rotated automatically (3 × 1 MB).

## Development

You need Node.js 24 locally.

```sh
npm test                              # unit tests (node:test)
npm run typecheck                     # tsc --noEmit
node src/main.ts --once --dry-run     # single check, prints the message instead of sending it
```
