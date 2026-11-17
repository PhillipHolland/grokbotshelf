# Shelf Run

A one-thumb runner built from real bots on [grokbotshelf.com](https://grokbotshelf.com). You push a shopping cart down a store aisle lined with Grok bots. Every bot card on the floor is a real bot with its creator's face and X handle.

## How it plays

- **Move.** Swipe left or right to change lanes. Swipe up to jump cardboard boxes. Swipe down to slide under low bars. Walls are too tall to jump, so go around.
- **Grab.** Run into real bots to put them in the cart. Four bots publish the shelf. If all four share a category color, it pays x3.
- **Dodge.** Scams twitch, use fake links and ask for passwords. Duplicates of a bot already in your cart reset the combo. After 45 seconds, runaway carts roll up the aisle at you. Their headlights show through the fog first.
- **Hearts.** You have 3. A Verified badge blocks one hit, a magnet pulls nearby bots in, and Turbo speeds you up and smashes through anything for 5 seconds.
- **Zones.** Every 40 seconds a gate takes you somewhere new: the Night Store, then the Forest Market (wooden shelves, lanterns, fireflies), then the Orbit Depot (white racks, neon arches, stars), then around again. Boxes, walls and bars change to match.

The game speeds up as you go. The game-over screen lists the creators whose bots you published, with links to them on X.

## Run it

```bash
npm install
npm run dev
```

Then open http://127.0.0.1:5174. To play on a phone on the same Wi-Fi, run `npm run phone` and open `http://<your-computer's-LAN-IP>:5174`.

Keys on desktop: `←` `→` change lanes, `↑` or `Space` jumps, `P` pauses, `M` mutes.

Add `?q=0`, `?q=1` or `?q=2` to the URL to pin the graphics quality. Without it the game lowers quality on its own if frames run slow.

## Tests and checks

```bash
npm test            # unit and API tests, about 2 seconds
npm run test:e2e    # the game in headless Chromium, about 2.5 minutes
npm run check       # everything CI runs: format, types, tests with coverage, build, e2e
```

The API tests run the real handlers against an in-memory Redis (`tests/fake-redis.ts`), so they need no database. [AGENTS.md](AGENTS.md) has the full guide for changing the code.

## Leaderboard and stats

When a run ends, the game posts the score. Players type a name or @handle once and the game remembers it on that device. Names aren't verified. [/stats](https://shelfrun.vercel.app/stats) shows today's and all-time top scores, runs and players per day, when people play by hour, the score spread, and the bots and creators that end up on the most shelves.

The API is four Vercel Functions in `api/`, backed by a free Upstash Redis database (`shelfrun-scores`, connected through the Vercel Marketplace):

- `POST /api/start` notes the start time of a run.
- `POST /api/finish` takes the result. Each run id works once. The server checks the result against the time the run really took and what the game can score in that time (`api/_lib/rules.ts`), and drops runs that don't fit.
- `POST /api/name` adds a name to a run that ended without one.
- `GET /api/stats` returns everything the stats page shows. Redis caches it for 2 minutes.

Production uses `sr:` keys. Preview deploys and `vercel dev` use `sr-dev:` keys in the same database, so testing never touches the real board.

To take a name off the board:

```bash
npm run remove-name -- "the name"
```

The free Upstash plan allows 500,000 commands a month. A run uses about 30, so that's roughly 15,000 runs a month. If the game outgrows it, switch the database to pay-as-you-go in the Upstash dashboard.

To run the game with the API locally, use `vercel dev` (it reads `.env.local`, which `vercel env pull` writes). `npm run dev` still works, without the leaderboard.

## Refresh the bots

```bash
npm run sync-bots
```

This downloads the current list from grokbotshelf.com into `src/bots.json`, saves creator avatars to `public/avatars/` and regenerates `api/_lib/bots.ts`, the bot list the score API checks against.

## Deploy

The game lives in `games/shelf-run/` of the grokbotshelf repo. Its Vercel project must have **Root Directory** set to `games/shelf-run`, so Vercel finds this folder's `package.json`, `vercel.json` and `api/`.


`npm run build` typechecks the game and the API and writes the site to `dist/`. Speed and scoring numbers live in `api/_lib/balance.ts`, which both the game and the API import. Vercel builds the same way and deploys the functions in `api/` next to it.
