# PlacardBot

AI HAZMAT compliance assistant for trucking dispatchers and drivers. Upload a
Bill of Lading (BOL) photo and PlacardBot extracts the hazardous materials
data and tells you exactly which DOT placards (49 CFR Part 172, Subpart F)
are required.

## Local development

```bash
npm install
export ANTHROPIC_API_KEY=sk-ant-...
npm start
```

Then open http://localhost:3000.

## Environment variables

| Variable            | Required | Description                                  |
|---------------------|----------|-----------------------------------------------|
| `ANTHROPIC_API_KEY`  | Yes      | Claude API key used for BOL analysis          |
| `ANTHROPIC_MODEL`    | No       | Defaults to `claude-sonnet-5`                 |
| `PORT`               | No       | Defaults to `3000` (Railway sets this itself) |

## Deploying to Railway

This repo includes `railway.json` (Nixpacks build, `node server.js` start
command). To deploy:

1. Create a Railway project and link this repo (via the dashboard, or
   `railway link` / `railway init` with the CLI).
2. Set the `ANTHROPIC_API_KEY` variable on the service:
   `railway variables --set ANTHROPIC_API_KEY=sk-ant-...`
3. Deploy: `railway up` (or push to the connected GitHub branch for
   auto-deploy).

**Note:** This is an AI assistance tool. Always verify placarding decisions
against the actual BOL, SDS, and current 49 CFR Part 172 — final
responsibility lies with the shipper/carrier.
