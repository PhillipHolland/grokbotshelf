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

Then give the new bot a pairs row and rebuild:

```sh
node scripts/pairs-gen.js && node scripts/build.js
```

`pairs-gen` only fills slugs that are missing from `public/pairs.json`. It never replaces a curated row. The build fails if any bot slug has no key (an empty list is fine).

## Pairs with (Amazon)

`public/products.json` is the Amazon-only gear catalog. Tag is `botshelf-20`. There is no store in the nav, and category matching stays off.

A bot page with a qualifying row gets the full "Pairs with" section (name, blurb, disclosure). Homepage cards, creator lists, and job-hub cards show a short chip row beside the bot link (at most two products, then `+N` to the bot page) when that bot has pairs. One disclosure line per page, and only when something is shown. Empty stays empty.

A product id that `pairs-gen` adds is marked `"probation": true` with `"since"`. List cards show that chip muted, and at most one probation chip. The bot page still lists it. It leaves probation when `pairs-overrides.json` sets `"promote": ["that-product-id"]` (or `"promote": true` for the slug), or when `public/pair-signals.json` has at least `min` real `pair_click` counts for that slug and product (default 3). Paste those counts from GA4. Do not invent them. A curated row (no `auto: true`) is never rewritten.

Each product needs `id`, `asin` (a `B` plus nine characters), `name`, `blurb`, `emoji`, and `match`:

- `bot_names`: exact `name` from `bots.json`. Score 5.
- `phrases`: a distinctive word or phrase in the bot name or description. One phrase scores 4. Two phrases, or a phrase plus a support keyword, score 5.
- `keywords`: multi-word phrases count like `phrases`. A single word of five or more letters can only bump a phrase to 5. It never scores alone. Do not use `voice`, `desk`, `tools`, `tracker`, `hub`, `network`, `scanner`, `backup`, or `export`.
- `exclude` / `exclude_names`: drop this product for that text or exact bot name.
- `auto: false` on the product: the scorer skips it (Echo Dot). Pin it from `pairs-overrides.json` if a bot should show it.

Do not add `categories`. A category string never attaches a product.

At most 3 products. Ties keep catalog order. Every link is `https://www.amazon.com/dp/{asin}?tag=botshelf-20` with `rel="noopener sponsored"`.

`public/pairs.json` has one key per bot slug. A non-empty row with no `"auto": true` flag is curated and is left alone. `public/pairs-overrides.json` wins at render time (`none`, `block`, `pin`). Bot Tools defaults to `none` unless that slug sets `"none": false`.

```sh
node scripts/pairs-gen.js              # new bots only
node scripts/pairs-gen.js --backfill   # after products.json changes; rescores empty and auto rows
node scripts/build.js
```

```json
{
  "id": "samsung-t7",
  "asin": "B0874XN4D8",
  "name": "Samsung T7 SSD",
  "blurb": "Fast portable SSD for models and clips.",
  "emoji": "💾",
  "match": {
    "bot_names": ["Local AI Manager"],
    "phrases": ["portable ssd"],
    "keywords": ["nvme"]
  }
}
```

## Refresh the catalog (Creators API)

`node scripts/creators-refresh.js` reads `public/products.json` and looks up each ASIN with Creators API GetItems (`https://creatorsapi.amazon/catalog/v1/getItems`, up to 10 ASINs per call). The default is a dry run: a JSON report on stdout, catalog untouched. `--apply` writes `amazon_title` and `last_refreshed`, and changes `name` only when the Amazon title is the same words with cleaner casing or punctuation. A long listing title stays in `amazon_title` for a diff. `blurb`, `emoji`, `match`, `auto`, `flag`, and `pair_note` stay as curated. `partnerTag` is `botshelf-20`.

The script does not store image URLs. Pair rows render the emoji as a Lucide icon, and an empty image must leave that mark as it is. Image URLs are in the report only (`images.primary.large`).

Creators API replaced PA-API and uses OAuth client credentials, not a refresh token. In Associates Central, open Tools → Creators API → Create Application → Add New Credential, then export the values shown once:

```sh
export AMAZON_CREATORS_CLIENT_ID="Credential ID"
export AMAZON_CREATORS_CLIENT_SECRET="Credential Secret"
export AMAZON_CREATORS_VERSION="3.1"   # optional. 3.1 NA (www.amazon.com), 3.2 EU, 3.3 FE
node scripts/creators-refresh.js --report /tmp/creators-refresh.json
node scripts/creators-refresh.js --apply
```

With those variables unset, the command exits 0 and prints this setup. It does not call Amazon. `--fixture response.json` replays a saved GetItems body offline. Do not commit the secret. Full notes are at the top of `scripts/creators-refresh.js`.

Docs: [GetItems](https://affiliate-program.amazon.com/creatorsapi/docs/en-us/api-reference/operations/get-items), [using cURL](https://affiliate-program.amazon.com/creatorsapi/docs/en-us/get-started/using-curl), [register](https://affiliate-program.amazon.com/creatorsapi/docs/en-us/onboarding/register-for-creators-api).

## Find by job (collections)

When several bots do the same kind of work, they stay in the catalog (merging them would break Template Rewards credit). `public/collections.json` is a separate layer: a short list of jobs. The home page links to `/collections` ("Find by job"). Each hub is `/collection/<slug>`.

A hub has `id`, `slug`, `name`, `emoji`, a plain `blurb`, `bots` (every member, as a bot slug or an `https://x.ai/bot/<id>` url), and `picks` (1 to 3 of those, shown as "Start here"). The rest are "More like this". `rank` is accepted as another name for `picks`. Order in the file is the order on the page.

The shelf has no install or Template Rewards feed. Do not add fake counts. When a real usage map exists, set `usageByTemplateId` in `scripts/build.js` to `{ "<template id>": <number> }`. `rankJobMembers` in `scripts/collections.js` then sorts by that number (missing keys count as 0, ties keep the editor order) and the first few become "Start here". The pages still do not print the numbers.

```json
{
  "id": "deal-hunting",
  "slug": "deal-hunting",
  "name": "Deal hunting",
  "emoji": "🏷️",
  "blurb": "You want a real price before you buy.",
  "picks": ["deal-scout", "deal-detective"],
  "bots": ["deal-scout", "deal-detective", "smart-shopper"]
}
```

Then `node scripts/build.js`. A slug or url that is not on the shelf fails the build. This is not the Family-style tag in `bot-meta.json` (`?collection=family` on the home filters). Leave that alone.

Job hub icons and bot card marks are Lucide (`scripts/icons.js`). The `emoji` field stays in `bots.json` and in a bot's name or description. List cards (home, creator, collection, job) draw `botMark(emoji)` from the ICON_MAP comment in that file. An emoji with no mapping draws the Lucide `bot` icon.

## Shelf stacks

`public/stacks.json` is a short list of ordered installs at `/stacks`. Each stack has a title, a blurb, a Lucide `icon`, and 2 to 6 bot slugs in the order to add them. The page is public. There is no membership gate. A missing slug fails the build.

## Redeploy (one command)

```sh
cd /workspace/bot-hub && vercel deploy --prod --yes
```

## Launch post link

Paste the X launch post URL into `public/config.js` (`window.LAUNCH_POST_URL = "..."`)
and redeploy. Until it is set, the "Add your bot" section shows plain text with no link.

## Font

The site is set in [Shelf Serif](https://github.com/itsthecsguy/shelf-serif), self-hosted at `public/fonts/` with its license. The `@font-face` at the top of `public/styles.css` is the one place that names the file. `scripts/build.js` reads the URL from there for the preload on every page, and `scripts/og.js` reads it to embed the font in share cards.

To take a new release, add the file under a new versioned name, change the URL in `styles.css`, then redraw the share cards and rebuild. The file is cached for a year, so a changed font needs a new name.

Weights are lower than on a typical sans because Shelf Serif 400 has the ink of a normal Bold. Reading text uses `--w-read` (300), and the font stops at 700. `test/font.js` fails if the font stops loading.

## Share image and icons

`public/og.png` (1200x630) is rendered from `build/og.html` with headless Chrome:

```sh
google-chrome --headless=new --no-sandbox --hide-scrollbars --window-size=1200,630 \
  --screenshot=public/og.png file://$PWD/build/og.html
```

## Tip card (X Money)

`scripts/tip.js` is the "Buy us some Tokens" card at the top of every footer (the build fills the
`<!-- tip:start -->` markers in `index.html` and `404.html`); `public/shelf-up.js` wires the amount chips
(copy only: the pay link can't preset an amount) and the floating button that opens the card in a panel.
Every tip goes to https://x.com/i/money/pay/Phil_Holland and is split 50/50 with @thecsguy. The desktop QR is
`public/tip-qr.svg`; redraw it if the link changes:

```sh
NODE_PATH=/workspace/bot-hub-test/node_modules node scripts/tip-qr.js
```

## Tests

`test/e2e.js` drives headless Chrome through search, filters, URL state, keyboard
navigation and copy link. It needs `puppeteer-core` installed outside the repo:

```sh
NODE_PATH=/workspace/bot-hub-test/node_modules node test/e2e.js https://grokbotshelf.com/ [shots-dir]
```

`test/run.js` runs the whole suite: a build smoke test (`test/build.js`, on a temporary copy),
then every browser test against `test/serve.js`, a small local server that follows `vercel.json`
(clean URLs, redirects, the 404 page). Pass a URL to test a deployment instead:

```sh
NODE_PATH=/path/to/node_modules node test/run.js [https://preview-url/]
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
  rate limit bursts (40 writes per IP and 25 per voter per minute). `VOTE_SALT` is required on Production and Preview.
  If it is missing or empty, `/api/votes` and `/api/submit` return 500 and do not hash with a default salt.
- Slugs are `"bot-" + slugified name`, the same as card ids, so renaming a bot resets its votes.
- Without `DATABASE_URL` (or `NEON_DATABASE_URL`) on Vercel, the API reports `global: false` and the arrows
  still work but only remember votes in that browser. Setting the env and redeploying turns on global tallies.

## From the builders strip

`window.BUILDERS` in `public/config.js` lists the handles and the exact bot names shown in the strip on the
home Featured view (hidden when searching, filtering, or sorting). Phil's first three picks lead; each handle gets
an avatar and an "All N bots" pill (live count) linking to its `/@handle` page.

## Bot pages, sitemap, feed, llms.txt (generated)

`node scripts/build.js` writes, from `bots.json`, `bot-meta.json` and `social.json`:

- `public/bot/<slug>/index.html`: one page per bot at `/bot/<slug>` (slug = name, lowercase, dashes) with a canonical URL,
  its own title and description, Open Graph and Twitter card tags, "Get this bot" and "Add to Bot app".
- `public/sitemap.xml`, `public/robots.txt`, `public/feed.xml` (RSS, 50 newest), `public/llms.txt`.

Vercel runs it on every deploy (`buildCommand` in `vercel.json`), and the output is committed too. Run it after
editing `bots.json` so the repo matches. Share images live in `public/og/bot/<slug>.png`; draw any missing ones with
`NODE_PATH=/workspace/bot-hub-test/node_modules node scripts/og.js` (add `--all` to redraw), then rerun the build.

- `public/@<handle>/index.html`: one static page per creator at `/@<handle>` (name, X link, avatar, bot count, categories,
  bot list), also in the sitemap. Other casings and unknown handles get the 404 page, which sends `/@Handle` to the
  lowercase URL and otherwise says "Creator not found" (status 404, noindex); `/u/<handle>` redirects to `/@<handle>`. Share images: `public/og/creator/<handle>.png`, drawn by `scripts/og.js`.
- Each bot page also gets "Under the hood" when the creator supplied details (see below), up to 3 "Similar bots" from other creators (same category, shared works_with apps, shared
  description words weighted by rarity; ties by name), and a "Featured badge" embed (`/badge.svg`, `/badge-dark.svg`).

Homepage hash links (`/#bot-archivist`) still scroll to the card. Card titles and the X share link now use `/bot/<slug>`.

The homepage HTML also includes a closed "All bots and creators" list (`#all`) with a real link for every `/bot/<slug>` and `/@<handle>`. `app.js` still draws the card grid and does not remove that list, so crawlers can discover every page without running JavaScript.

## Analytics

`scripts/build.js` injects GA4 when `GA_MEASUREMENT_ID` is set. The tag loads only on `grokbotshelf.com` and `www.grokbotshelf.com`. Preview hosts and localhost do not load it.

"Get this bot" and "Add to Bot app" send a `get_bot` event with `bot_slug` and `destination` (`x.ai` or `app`). Mark it as a key event in GA4 Admin → Data display → Events → get_bot → Mark as key event.

An Amazon "Pairs with" link sends `pair_click` with `bot_slug`, `product_id`, `position` (1-based), and `surface` (`home`, `creator`, `collection`, or `bot`). The listener lives in `public/shelf-up.js`.

## Under the hood

Hidden unless the creator supplied at least one optional field on the bot in `bots.json`. Only those rows show,
labeled "Creator-supplied": `"connectors": ["Gmail"]`, `"routines": [{ "name": "Morning digest", "schedule": "daily 8am" }]`,
`"sends"`, `"posts"`, `"spends"` (true or false), `"permissions_note": "one plain sentence"`.

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
first use). Rate limits: 5 per IP per 10 minutes, 20 per IP per day, 300 total per day. This route never writes
`bots.json`. Shelf Inbox (Phillip's review bot), or Phil and Nick, check each row for NSFW and security issues.
Clean ones may be added without a second human click. Anything unclear stays pending for a human.
`GET /api/submit?list=pending` lists pending rows not yet on the shelf. Rows whose template lands in `bots.json`
drop off that list automatically. The same paths are on `/#add` and in `llms.txt`: POST `/api/submit`, email
`pbh+shelf@mail.grokbot.com` with the template link, or ask Shelf Inbox in Grok Bot.

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
