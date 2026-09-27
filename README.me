# Tambay Bot

- **AFK system** — `$afk` / `/afk`, welcome-back embed, `$afkmentions` / `/afkmentions` — open to everyone
- **Tambay DM broadcast** — `/tambay message:"..." channel:#general` — Administrators only, DMs every member in fast batches with a live progress embed

## 1. Create the bot application

1. https://discord.com/developers/applications → your app.
2. **General Information** tab → copy the **Application ID** → this is your `CLIENT_ID`.
3. **Bot** tab → **Reset Token** → copy it → this is your `DISCORD_TOKEN`.
4. Still on the Bot tab, turn ON:
   - **Message Content Intent**
   - **Server Members Intent**
5. **OAuth2 → URL Generator** → check `bot` and `applications.commands` → Bot Permissions: Send Messages, Read Message History, Embed Links, View Channels.
6. Open the generated URL, invite it to your server.
7. Right-click your server icon → **Copy Server ID** (turn on Developer Mode in Settings → Advanced first) → this is your `GUILD_ID`.

## 2. Push to GitHub

Push these files: `index.js`, `package.json`, `config.json`, `.env.example`.
Do **not** push a real `.env` file — that's where your token would leak.

## 3. Deploy on Railway

1. New Project → **Deploy from GitHub repo**.
2. Service → **Variables** tab → add:
   - `DISCORD_TOKEN`
   - `CLIENT_ID`
   - `GUILD_ID`
   - `PREFIX` (optional, defaults to `$`)
3. Deploy → check **Logs** for `Logged in as YourBot#0000` and `Slash commands registered to guild.`

Slash commands show up within seconds since `GUILD_ID` is set. Every time you redeploy, it re-registers them automatically — no separate script to run.

## Commands

| Command | Who | What it does |
|---|---|---|
| `$afk [reason]` / `/afk [reason]` | everyone | Sets you AFK. Shows "💤 **you** is AFK → *reason*". |
| `$afkmentions` / `/afkmentions` | everyone | Shows your last 10 away mentions with jump links. |
| (any message) | everyone | If you were AFK, posts "Welcome back" with how long you were away. |
| `/tambay message:"..." channel:#general` | **Administrators only** | DMs every human member, 10 at a time, with a live-updating progress embed, then a final sent/failed count. Non-admins get a "🚫 Admins only" reply only they can see. |

In the `message` text you can use:
- `{user}` → the member's username
- `{channel}` → a clickable mention of the channel you picked
- `{server}` → your server's name

## Customizing the look — edit `config.json`

Colors, embed titles, and footer text all live in `config.json`. Edit it right in GitHub (pencil icon), commit, and Railway redeploys automatically.

## Notes

- AFK data resets if the bot restarts (stored in memory). Say the word if you want it to survive restarts via a database.
- Batches of 10 DMs fire at once with a short pause between batches — fast, but still respects Discord's rate limits so the bot doesn't get throttled.
- Members with DMs closed show up under "failed" — that's a Discord-side block, no way around it.
