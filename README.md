# PlacardBot

AI HAZMAT compliance assistant for trucking dispatchers and drivers. Upload a
Bill of Lading (BOL) photo or PDF and PlacardBot extracts the hazardous
materials data and tells you exactly which DOT placards (49 CFR Part 172,
Subpart F) are required. Available as a web chat app and, optionally, a
Telegram bot — both share the same Google Gemini-powered analysis backend
(free tier) and log every analysis to Postgres for the admin panel.

## Local development

```bash
npm install
export GOOGLE_API_KEY=<your-google-api-key>
npm start
```

Then open http://localhost:3000.

To also run the Telegram bot locally, additionally set
`TELEGRAM_BOT_TOKEN` before `npm start` (get a token from
[@BotFather](https://t.me/BotFather)).

To persist analyses and use the admin panel locally, set `DATABASE_URL`
to a Postgres connection string, plus `ADMIN_USERNAME`/`ADMIN_PASSWORD`,
then visit http://localhost:3000/admin.

Get a free Google API key from https://aistudio.google.com/apikey.

## Environment variables

| Variable             | Required | Description                                                          |
|----------------------|----------|-----------------------------------------------------------------------|
| `GOOGLE_API_KEY`     | Yes      | Free Google Gemini API key from https://aistudio.google.com/apikey    |
| `TELEGRAM_BOT_TOKEN` | No       | Enables the Telegram bot interface (polling mode) if set               |
| `DATABASE_URL`       | No       | Postgres connection string; enables analysis logging + admin panel     |
| `ADMIN_USERNAME`     | No       | Username for HTTP Basic Auth on `/admin`                               |
| `ADMIN_PASSWORD`     | No       | Password for HTTP Basic Auth on `/admin`                               |
| `PORT`               | No       | Defaults to `3000` (Railway sets this itself)                          |

## Admin panel

Visit `/admin` (e.g. `https://your-app.up.railway.app/admin`) for a
dashboard of every analysis run through the web app or Telegram bot: total
count, last-24h count, breakdown by source, and a table of recent requests
(message, files, reply, errors, timestamp). Protected by HTTP Basic Auth —
set `ADMIN_USERNAME`/`ADMIN_PASSWORD` to enable it; without both set, the
panel returns 503 rather than exposing data.

## File support

Both the web app and Telegram bot accept photos (JPEG/PNG/WebP/etc.) and
PDFs. PDFs are rendered page-by-page (up to 3 pages) into images before
being sent to Gemini's vision model, so scanned BOLs work the same as
photographed ones.

## Deploying to Railway

This repo includes `railway.json` (Nixpacks build, `node server.js` start
command). To deploy via the Railway dashboard (recommended, no CLI/token
needed):

1. In Railway, create a **New Project → Deploy from GitHub repo** and select
   this repository / branch (`claude/placardbot-hazmat-assistant-503trs`).
   Railway will auto-deploy on every push to that branch.
2. Add a **PostgreSQL** plugin to the project (New → Database → PostgreSQL).
   Railway automatically injects `DATABASE_URL` into your service — no
   manual wiring needed.
3. In the service's **Variables** tab, set `GOOGLE_API_KEY` (required; get a
   free one from https://aistudio.google.com/apikey), `ADMIN_USERNAME` +
   `ADMIN_PASSWORD` (to enable `/admin`), and optionally `TELEGRAM_BOT_TOKEN`
   to also enable the Telegram bot.
4. Railway assigns a public URL automatically for the web chat UI; the
   Telegram bot (if enabled) runs polling in the same process — no inbound
   domain/webhook needed.

Alternatively, with the Railway CLI and an **account-level** API token
(Account Settings → Tokens — not a project token, since the project doesn't
exist yet):

```bash
railway login --token <ACCOUNT_TOKEN>
railway init
railway add --plugin postgresql
railway variables --set GOOGLE_API_KEY=<your-key> --set TELEGRAM_BOT_TOKEN=123:abc --set ADMIN_USERNAME=admin --set ADMIN_PASSWORD=<pick-one>
railway up
```

**Note:** This is an AI assistance tool. Always verify placarding decisions
against the actual BOL, SDS, and current 49 CFR Part 172 — final
responsibility lies with the shipper/carrier.
