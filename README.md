# LoLdle Discord Bot

A shared daily [LoLdle](https://loldle.net) for your Discord server. Everyone
gets the same League of Legends champion each day, guesses privately, and
competes on a leaderboard — like the Wordle app, but for League.

## How it works

- One champion per server per day, rolling over at midnight (Pacific by default).
- `/guess <champion>` — your guess and the colored attribute clues are shown
  only to you. When you solve it (or give up) the channel gets a spoiler-free
  announcement with your emoji grid.
- `/giveup` — reveals the answer to you; counts as a miss for the day.
- `/leaderboard [today|week|alltime]` — today ranks by fewest guesses, ties
  broken by time from first guess to solve. Week and all-time rank by solves,
  then average guesses.
- `/stats [player]` — solve rate, averages, streaks, guess distribution.
- `/help`, `/ping`.
- **@mention chatbot** — ping the bot (or reply to it) and it answers in a
  Faker persona, with the last few channel messages as context and any
  attached images if the model supports vision. Off unless `CHAT_API_KEY` is
  set; talks to any OpenAI-compatible endpoint (default: the Relace gateway
  with `z-ai/glm-5.3-flash`). Requires the **Message Content Intent** toggled
  on in the Developer Portal. Per-user and daily caps are configurable.
- `/msg <message> [channel]` — owner only (see `OWNER_ID`): post a message as the bot.
- `/neeko as <user> <message>` — post a message wearing another member's name
  and avatar (through a channel webhook; Discord still shows an APP badge).
  Open to everyone: no pings, every use logged.
  `/neeko undo` deletes your last one, `/neeko reveal <message id>` unmasks
  one publicly, `/neeko log` (owner only) lists recent activity. Needs the
  **Manage Webhooks** permission.

Clue columns, in order: Gender · Position · Species · Resource · Range · Region · Year.
🟩 exact · 🟧 partial (for list attributes) · 🟥 none · ⬆️/⬇️ answer was released later/earlier.

Results are stored in a SQLite database (Node's built-in `node:sqlite`), so
nothing is lost on restart.

## Setup

Requires Node.js 22.13 or newer.

1. Create an application at the [Discord Developer Portal](https://discord.com/developers/applications).
   On the **Bot** tab create the bot and copy its token. On **General
   Information** copy the Application ID.
2. Invite the bot: **OAuth2 → URL Generator**, scopes `bot` and
   `applications.commands`, bot permissions **View Channels**, **Send
   Messages**, and **Manage Webhooks** (for `/neeko`). Open the generated URL and pick your server.
3. Configure and run:

   ```bash
   git clone https://github.com/ezhang33/loldle-discord-bot.git
   cd loldle-discord-bot
   npm install
   cp .env.example .env   # fill in DISCORD_TOKEN and CLIENT_ID
   npm start
   ```

   Set `GUILD_ID` in `.env` while testing so slash commands appear in that
   server instantly. Leave it empty for global registration once you're happy
   (global commands can take up to an hour to show up the first time; remove
   the guild-scoped ones from Server Settings → Integrations if you see
   duplicates).

See `.env.example` for the optional settings (`TIMEZONE`, `DB_PATH`, `DAILY_SEED`, `OWNER_ID`).

## Hosting

Runs happily on a free-tier VM (GCP `e2-micro`, ~80 MB RAM used). On a fresh
Ubuntu 24.04 host:

```bash
git clone https://github.com/ezhang33/loldle-discord-bot.git /tmp/loldle
sudo bash /tmp/loldle/deploy/setup.sh   # Node 22, service user, systemd unit, nightly DB backup
sudo nano /etc/loldle.env               # fill in DISCORD_TOKEN, CLIENT_ID, OWNER_ID
sudo systemctl start loldle && journalctl -u loldle -f
```

Update later with `sudo bash /opt/loldle-discord-bot/deploy/update.sh`. The
database lives in `/var/lib/loldle/`, with dated backups in `backups/`.

## Development

```bash
npm test
```

Layout:

- `src/champions.js` — champion data, lookup/autocomplete, clue comparison
- `src/daily.js` — day keys, rollover timing, deterministic daily pick
- `src/game.js` — rules and ranking (no Discord code)
- `src/db.js` — SQLite storage
- `src/commands/`, `src/events/` — the Discord layer

`championData.json` is inherited from the original project and currently
stops at 2022 releases; refreshing it is a known follow-up.

## Credits

Forked from [Peter DeVries' Discord-LoLdle-Bot](https://github.com/Peter-DeVries/Discord-LoLdle-Bot)
(MIT), which provided the champion data and clue-comparison logic. LoLdle is by
[loldle.net](https://loldle.net). Not affiliated with Riot Games.
