# PlacardBot

AI HAZMAT compliance assistant for trucking dispatchers and drivers. Upload a
Bill of Lading (BOL) photo and PlacardBot extracts the hazardous materials
data and tells you exactly which DOT placards (49 CFR Part 172, Subpart F)
are required. Available as a web chat app and, optionally, a Telegram bot —
both share the same Claude-powered analysis backend.

## Local development

```bash
npm install
export ANTHROPIC_API_KEY=sk-ant-...
npm start
```

Then open http://localhost:3000.

To also run the Telegram bot locally, additionally set
`TELEGRAM_BOT_TOKEN` before `npm start` (get a token from
[@BotFather](https://t.me/BotFather)).

## Environment variables

| Variable             | Required | Description                                              |
|----------------------|----------|-----------------------------------------------------------|
| `ANTHROPIC_API_KEY`  | Yes      | Claude API key used for BOL analysis                       |
| `ANTHROPIC_MODEL`    | No       | Defaults to `claude-sonnet-5`                               |
| `TELEGRAM_BOT_TOKEN` | No       | Enables the Telegram bot interface (polling mode) if set    |
| `PORT`               | No       | Defaults to `3000` (Railway sets this itself)               |

## Deploying to Railway

This repo includes `railway.json` (Nixpacks build, `node server.js` start
command). To deploy via the Railway dashboard (recommended, no CLI/token
needed):

1. In Railway, create a **New Project → Deploy from GitHub repo** and select
   this repository / branch (`claude/placardbot-hazmat-assistant-503trs`).
   Railway will auto-deploy on every push to that branch.
2. In the service's **Variables** tab, set `ANTHROPIC_API_KEY` (required) and
   optionally `TELEGRAM_BOT_TOKEN` to also enable the Telegram bot.
3. Railway assigns a public URL automatically for the web chat UI; the
   Telegram bot (if enabled) runs polling in the same process — no inbound
   domain/webhook needed.

Alternatively, with the Railway CLI and an **account-level** API token
(Account Settings → Tokens — not a project token, since the project doesn't
exist yet):

```bash
railway login --token <ACCOUNT_TOKEN>
railway init
railway variables --set ANTHROPIC_API_KEY=sk-ant-... --set TELEGRAM_BOT_TOKEN=123:abc
railway up
```

**Note:** This is an AI assistance tool. Always verify placarding decisions
against the actual BOL, SDS, and current 49 CFR Part 172 — final
responsibility lies with the shipper/carrier.
