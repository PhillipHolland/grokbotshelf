# Working on Shelf Run

Guide for AI agents (and people) changing this repo. Read this before you edit anything. README.md covers what the game is and how to deploy it.

## Before you say you're done

Run the full check. It is the same thing CI runs.

```bash
npm ci                       # once
npx playwright install chromium   # once, if this machine has no Playwright Chromium
npm run check
```

`npm run check` runs, in order, and stops at the first failure:

| Step | Command | Time | What it catches |
| --- | --- | --- | --- |
| Format | `npm run format:check` | ~2 s | Code not formatted with Prettier. Fix with `npm run format`. |
| Types | `npm run typecheck` | ~5 s | Type errors in the game (`src/`), the API (`api/`) and the tests. Unused variables fail too. |
| Unit and API tests | `npm run test:coverage` | ~2 s | Logic bugs. Fails if line coverage of the tested modules drops under 90%. |
| Build | `npm run build` | ~10 s | Anything Vite can't bundle. |
| Browser smoke tests | `npm run test:e2e` | ~2.5 min | The game not booting, a run not playing, the game-over screen sending a result the API would reject, the stats page breaking. |

While you work, run the fast loop: `npm test` (or `npx vitest run tests/rules.test.ts` for one file, `npm run test:watch` to keep it running). Run `npm run test:e2e` once before you finish if you touched anything under `src/`, `index.html`, `stats.html` or `vite.config.ts`.

If a check fails, fix the code, not the check. Never lower coverage thresholds, skip a test, or loosen an assertion to get green unless the behaviour change is intended and you say so.

## Map of the code

```
api/                  Vercel Functions: the score API (one file per route)
  start.ts            POST /api/start: notes a run's start time
  finish.ts           POST /api/finish: checks and records a result
  name.ts             POST /api/name: names a run that ended without one
  stats.ts            GET /api/stats: boards and stats, cached 2 minutes
  _lib/               Not routes (Vercel skips folders that start with _)
    balance.ts        Speed and scoring numbers SHARED by the game and the API
    rules.ts          Anti-cheat limits (implausible) and name rules (cleanName)
    board.ts          Writes scores to the leaderboards
    db.ts             Redis client, key names, small helpers
    bots.ts           GENERATED bot id -> creator map. Do not edit by hand.
src/
  bots.json           Snapshot of the bots on grokbotshelf.com. Do not edit by hand.
  bots.ts             Real bot cards, dupes and scam cards
  storage.ts          localStorage that never throws. Use it, not localStorage.
  audio.ts            Generated sound effects
  score-types.ts      Shapes the API sends back, shared with the client
  runner/main.ts      The game: state, spawning, collisions, scoring, screens
  runner/scene.ts     Three.js scene (big; changes here are checked by e2e only)
  runner/net.ts       Score API client. Every call fails quietly.
  stats/main.ts       The /stats page
tests/                Vitest unit and API tests
  fake-redis.ts       In-memory Redis. tests/setup.ts swaps it in for every test.
e2e/                  Playwright browser tests against the dev server
scripts/              sync-bots, api-bots (generator), remove-name
```

## Rules that keep things working

- **Scoring and speed numbers live in `api/_lib/balance.ts`.** The game uses them to score and the API uses them to reject impossible runs. If you change how points are earned, add a new score source, or change speed, update `balance.ts` and `maxScore`/`maxDist` in `api/_lib/rules.ts` together. `tests/balance.test.ts` plays the best possible run and fails if the API would reject it.
- **`api/_lib/balance.ts` must stay pure**: no DOM, Node, or Redis imports. The browser bundles it.
- **Never edit `src/bots.json` or `api/_lib/bots.ts` by hand.** `npm run sync-bots` refreshes both from grokbotshelf.com (needs network access to that site). `node scripts/api-bots.mjs` regenerates `api/_lib/bots.ts` from `src/bots.json` alone. `tests/bots.test.ts` fails if the two disagree.
- **Bot ids can contain slashes** (`marketplace/bots/deal-hunting`). Use `Sub.id`, never the last part of a URL.
- **Use `src/storage.ts` for localStorage.** Direct access throws when a browser blocks storage, and the game then never leaves the loading screen.
- **New Redis commands** in `api/` need adding to `tests/fake-redis.ts`. The tests fail with `fake redis: no command X` until you do.
- **API files import each other with `.js` extensions** (`./_lib/db.js`). Vercel runs them as Node ES modules, which need the extension.
- Tests never talk to the real database or the live site: Redis is always the fake, and e2e stubs every `/api/*` route.
- Production writes `sr:` keys; everything else (`vercel dev`, previews) writes `sr-dev:` keys.

## Debugging the game in a browser

`npm run dev` serves the game at http://127.0.0.1:5174 with the score API turned off. In dev builds, `window.run` exposes the live state and some controls: `run.S` (state), `run.start()`, `run.move(-1|1)`, `run.jump()`, `run.spawn(kind, lane, z)`, `run.power('shield'|'magnet'|'turbo')`, `run.zone(i)`, `run.setTime(t)`, `run.perf()`. The e2e tests use these. Add `?q=0` to the URL for the lowest graphics quality.

## Style

- Prettier, 180 columns, single quotes (`.prettierrc`). Run `npm run format`.
- Comments explain why, in plain sentences. Keep the existing tone.
- Commit messages: a short summary line, then what changed and why.
