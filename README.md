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

## Bot pages, sitemap, feed, llms.txt (generated)

`node scripts/build.js` writes, from `bots.json`, `bot-meta.json` and `social.json`:

- `public/bot/<slug>/index.html`: one page per bot at `/bot/<slug>` (slug = name, lowercase, dashes) with a canonical URL,
  its own title and description, Open Graph and Twitter card tags, "Get this bot" and "Add to Bot app".
- `public/sitemap.xml`, `public/robots.txt`, `public/feed.xml` (RSS, 50 newest), `public/llms.txt`.

Vercel runs it on every deploy (`buildCommand` in `vercel.json`), and the output is committed too. Run it after
editing `bots.json` so the repo matches. Share images live in `public/og/bot/<slug>.png`; draw any missing ones with
`NODE_PATH=/workspace/bot-hub-test/node_modules node scripts/og.js` (add `--all` to redraw), then rerun the build.

Homepage hash links (`/#bot-archivist`) still scroll to the card. Card titles and the X share link now use `/bot/<slug>`.

## Add to Bot app

Cards and bot pages link `grokbot://app/v1/bot-template?id=<id>`, where id is the part after `https://x.ai/bot/`.
On phones it is the big blue button and falls back to the x.ai page if the app does not open within 1.5s; on
desktop it is a small phone icon next to "Get this bot". Marketplace links (`x.ai/marketplace/...`) get no deep link.

## Badges: can it act, works with (`public/bot-meta.json`)

Keyed by template id (the part after `x.ai/bot/`). Fields: `agency` (`reads`, `drafts` or `acts`) and `works_with`
(apps the bot's own description names). The `name` field is only there for humans. Leave a bot out rather than guess;
cards without an entry show no badges. The dock has "Works with" and "Can it act?" filters (`?app=gmail&does=acts`).

## Most bookmarked and New this week (`public/social.json`)

Sort "Most bookmarked" (`?sort=bookmarks`) uses X bookmark counts of each bot's `source_post`, labeled as X counts,
not ratings. "New this week" (`?new=1`) keeps bots added in the last 7 days. To refresh the counts:

1. `node scripts/social.js ids` prints the post ids in batches of 100.
2. For each line, call the X tool `get_posts_by_ids` with `post.fields=public_metrics` and save each reply to a file.
3. `node scripts/social.js merge reply1.json reply2.json` rewrites `public/social.json` with `fetched_at`, then deploy.

## Suggestions queue (`/api/submit`)

The "Add your bot" form posts `{ bot_url, post_url, note }` to `/api/submit`. It checks the links, dedupes against
`bots.json` and the queue, reads the template's title and description from x.ai (and the post author through X's
public oEmbed), and stores a pending row in Neon (`submissions`, see `db/schema.sql`; the API creates the tables on
first use). Rate limits: 5 per IP per 10 minutes, 20 per IP per day, 300 total per day. Nothing is ever published
from the form: review `GET /api/submit?list=pending` (pending rows not yet on the shelf), add approved bots to
`bots.json` by hand, and deploy. Rows whose template lands in `bots.json` drop off the pending list automatically.

## Votes from bots (`X-Bot-Voter`)

Agents vote without cookies by sending one stable id per bot identity (their template id or agent id):

```sh
curl -X POST https://grokbotshelf.com/api/votes \
  -H 'Content-Type: application/json' -H 'X-Bot-Voter: my-agent-id' \
  -d '{"slug":"bot-archivist","value":1}'      # 1 up, -1 down, 0 clears
curl -H 'X-Bot-Voter: my-agent-id' 'https://grokbotshelf.com/api/votes?mine=1'
```

The voter key is `bot:` + a salted SHA-256 of the id; no cookie is set. Same IP limit as browsers (40 writes a minute),
40 writes a minute per bot id. Browser voting is unchanged.
