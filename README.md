# Grok Bot Shelf

A community directory of shared Grok Bot templates, curated by Phillip Holland.
Live at https://grokbotshelf.com

Plain static site: `public/index.html`, `public/styles.css`, `public/app.js`.
Every card comes from `public/bots.json`.

## Add a bot

Add an object to the array in `public/bots.json`:

```json
{
  "name": "Disk Doctor",
  "emoji": "💽",
  "description": "One plain sentence about what it does.",
  "category": "Apple & Mac",
  "url": "https://x.ai/bot/XXXXXXXX",
  "creator_name": "Nick",
  "creator_handle": "@thecsguy",
  "creator_url": "https://x.com/thecsguy",
  "creator_avatar": "/avatars/thecsguy.webp",
  "source_post": "https://x.com/thecsguy/status/123",
  "added": "2026-10-24"
}
```

Optional: `"code_url"` adds a source-code button. For a new creator, save their X
profile photo as a 128px WebP in `public/avatars/` and point `creator_avatar` at it.
Keep descriptions to one plain sentence under about 110 characters. A new `creator_url` gets its own
section and filter chip automatically; a new `category` gets its own chip.

Check the template link works first: `curl -sI https://x.ai/bot/XXXXXXXX | head -1`

## Redeploy (one command)

```sh
cd /workspace/bot-hub && vercel deploy --prod --yes
```

## Launch post link

Paste the X launch post URL into `public/config.js` (`window.LAUNCH_POST_URL = "..."`)
and redeploy. Until it is set, the "Add your bot" section shows plain text with no link.

## Share image and icons

`public/og.png` (1200x630) is rendered from `build/og.html` with headless Chrome:

```sh
google-chrome --headless=new --no-sandbox --hide-scrollbars --window-size=1200,630 \
  --screenshot=public/og.png file://$PWD/build/og.html
```

## Tests

`test/e2e.js` drives headless Chrome through search, filters, URL state, keyboard
navigation and copy link. It needs `puppeteer-core` installed outside the repo:

```sh
NODE_PATH=/workspace/bot-hub-test/node_modules node test/e2e.js https://grokbotshelf.com/ [shots-dir]
```

## Search API (for bots)

Bots (and anything else) can search the shelf without loading the full catalog:

```
GET https://grokbotshelf.com/api/search?q=fitness
GET https://grokbotshelf.com/api/search?q=mail&category=Productivity&limit=10
GET https://grokbotshelf.com/api/search?creator=SuddenlyJon
```

Query params: `q` (optional free text), `category`, `creator` (handle or name), `limit` (1–100, default 20).
CORS is open. Full dump remains at https://grokbotshelf.com/bots.json.


## Votes (up / down, no login)

`api/votes.js` stores votes in Neon Postgres through Neon's HTTP SQL endpoint (plain `fetch`,
no npm dependencies). Schema: `db/schema.sql`, applied with `node db/migrate.js`.

- `GET /api/votes` returns `{ global, scores: { "bot-slug": { up, down, score } } }` (cached ~15s at the edge).
  `?slug=bot-x` for one bot, `?mine=1` adds this visitor's own votes (never cached).
- `POST /api/votes` with `{ "slug": "bot-x", "value": 1 | -1 | 0 }`; 0 clears, sending the other value flips.
- Voter identity: a random UUID in an httpOnly, Secure, SameSite=Lax cookie (`gbs_vid`, path `/api/votes`),
  set on the first vote. One row per (bot, voter). IPs are never stored raw: a salted SHA-256 is kept only to
  rate limit bursts (40 writes per IP and 25 per voter per minute). Optional `VOTE_SALT` env overrides the salt.
- Slugs are `"bot-" + slugified name`, the same as card ids, so renaming a bot resets its votes.
- Without `DATABASE_URL` (or `NEON_DATABASE_URL`) on Vercel, the API reports `global: false` and the arrows
  still work but only remember votes in that browser. Setting the env and redeploying turns on global tallies.

## From the builders strip

`window.BUILDERS` in `public/config.js` lists the handles and the exact bot names shown in the strip on the
home Featured view (hidden when searching, filtering, or sorting).
