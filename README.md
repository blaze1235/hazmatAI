# PlacardBot

HAZMAT compliance assistant for trucking dispatchers and drivers. Upload a
Bill of Lading (BOL) photo or PDF and PlacardBot extracts the hazardous
materials data and tells you exactly which DOT placards (49 CFR Part 172,
Subpart F) are required.

**No AI, no API keys, no per-request cost.** Everything runs locally on the
server:

- **Digital PDFs** — text is read straight from the PDF's text layer (pdfjs)
- **Photos & scanned PDFs** — OCR via [tesseract.js](https://tesseract.projectnaptha.com/)
- **Parsing** — UN/NA numbers, hazard classes, packing groups, weights,
  LTD QTY / inhalation-hazard flags, plus a built-in lookup table of ~80
  common UN numbers for when the class isn't printed on the document
- **Placarding** — a deterministic rules engine implementing 49 CFR 172.504
  Tables 1 & 2: any-quantity Table 1 materials, the 1,001-lb aggregate
  threshold, the DANGEROUS placard mixed-load option (with the 2,205-lb
  single-category exception), bulk/cargo-tank UN number marking, limited
  quantity exceptions, and the domestic Class 9 exception

Available as a web chat app and, optionally, a Telegram bot — both share the
same analysis engine and log every analysis to Postgres for the admin panel.

You can also just type a shipment instead of uploading anything, e.g.
`UN1203 gasoline, 8500 lbs`.

## Local development

```bash
npm install
npm start
```

Then open http://localhost:3000. That's it — no API key needed.

On the first OCR request the server downloads the Tesseract English language
data (~11 MB, cached in `.tessdata/`); after that it works offline.

To also run the Telegram bot locally, set `TELEGRAM_BOT_TOKEN` before
`npm start` (get a token from [@BotFather](https://t.me/BotFather)).

To persist analyses and use the admin panel locally, set `DATABASE_URL`
to a Postgres connection string, plus `ADMIN_USERNAME`/`ADMIN_PASSWORD`,
then visit http://localhost:3000/admin.

## Environment variables

| Variable             | Required | Description                                                          |
|----------------------|----------|-----------------------------------------------------------------------|
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
PDFs. Digital PDFs use the embedded text layer directly (fast, exact);
scanned PDFs are rendered page-by-page (up to 3 pages) and OCR'd, same as
photos.

**OCR quality matters**: sharp, well-lit, straight-on photos of the hazmat
description section parse best. The report flags when OCR was used so you
know to double-check the extracted UN numbers and weights.

## Deploying to Railway

This repo includes `railway.json` (Nixpacks build, `node server.js` start
command). To deploy via the Railway dashboard:

1. In Railway, create a **New Project → Deploy from GitHub repo** and select
   this repository / branch (`claude/placardbot-hazmat-assistant-503trs`).
   Railway will auto-deploy on every push to that branch.
2. (Optional) Add a **PostgreSQL** plugin to the project (New → Database →
   PostgreSQL). Railway automatically injects `DATABASE_URL` into your
   service — no manual wiring needed.
3. (Optional) In the service's **Variables** tab, set `ADMIN_USERNAME` +
   `ADMIN_PASSWORD` (to enable `/admin`) and `TELEGRAM_BOT_TOKEN` (to enable
   the Telegram bot).
4. Railway assigns a public URL automatically for the web chat UI; the
   Telegram bot (if enabled) runs polling in the same process — no inbound
   domain/webhook needed.

No other configuration is required — there is no AI API key to set.

**Note:** This is an automated rule-based assistance tool. Always verify
placarding decisions against the actual BOL, SDS, and current 49 CFR
Part 172 — final responsibility lies with the shipper/carrier.
