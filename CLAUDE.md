# Working on Grok Bot Shelf

Guide for AI agents (and people) changing this repo. `README.md` is the full manual for each feature; this file is the
short version of how to make a change and prove it works. `AGENTS.md` points here.

## What this is

A static site (https://grokbotshelf.com) listing shared Grok Bot templates. No framework and no runtime dependencies.

- `public/bots.json` is the catalog. Almost every commit is a listing change there.
- `scripts/build.js` turns it into one page per bot, creator, category, job hub and stack, plus the sitemap, feed,
  `llms.txt` and `shelf-data.json`. Vercel runs it on every deploy (`vercel.json` `buildCommand`).
- `public/app.js` draws the home grid in the browser. `public/*.js` are the other page scripts.
- `api/*.js` are three Vercel functions: `search` (read-only), `votes` and `submit` (Neon Postgres over HTTP, no driver).

## Check your change

```sh
npm ci                                  # once; dev dependencies only
npm run check                           # bots.json validation + every node suite. ~30 s. Run before every commit.
npm test                                # everything, including ~40 browser suites against a fresh local build. Slow (20+ min).
node test/run.js --only e2e,pages       # just the suites you touched or that failed (names = test file names)
node test/run.js --list                 # every suite and whether it needs a browser
npm run validate                        # bots.json only: errors and warnings, naming the bot and field
```

Browser suites need Chrome at `/usr/bin/google-chrome` or `CHROME=/path/to/chrome`. In CI, `check` runs first and the
browser job runs only when it passes (`.github/workflows/test.yml`).

What to run for what you changed:

| You changed | Run at least |
|---|---|
| `public/bots.json` and other `public/*.json` data | `npm run check` |
| `scripts/*.js` (build, pairs, collections, icons, hub copy) | `npm run check`, then the browser suites for pages you changed (`pages`, `round3`, `prerender`, `pagecss`) |
| `public/app.js` or `scripts/home-strip.js` | `npm run check` and `node test/run.js --browser` (most browser suites cover the home page) |
| `api/*.js` | `npm run check` (`apisearch`, `submitlinks`, `credit`, `votes` cover the APIs without a network) |
| `public/styles.css` | `node test/run.js --only cards,targets,theme,pagecss,cls,railcls` |
| `vercel.json` | `node test/run.js --only headers,pages` |

## Rules that bite

- **The build validates `bots.json` first** (`scripts/validate.js`). Errors stop the build and name the bot and field.
  Warnings (no creator credit, one-bot category, unknown field) do not, but read them.
- **Every bot needs a row in `public/pairs.json`.** After adding a bot: `node scripts/pairs-gen.js && node scripts/build.js`,
  and commit `pairs.json` with the bot.
- **A bot's page slug and its votes come from its name** (`slugify(name)`). Renaming a bot moves its page and resets its
  votes; add a redirect in `vercel.json` for the old `/bot/<slug>`.
- **Generated output is committed.** After changing data or `scripts/`, run `node scripts/build.js` and commit what it
  writes (`public/bot/`, `public/@*/`, `public/category/`, `public/collection*/`, `public/sitemap.xml`, `feed.xml`,
  `llms.txt`, `shelf-data.json`, `public/add/index.html`, and the marked regions inside `public/index.html` and `404.html`).
  Never hand-edit those files or the text between `<!-- name:start -->` / `<!-- name:end -->` markers; change the
  script that writes them. A build on a different day changes the feed date and the "New this week" strip; that is
  expected.
- **Share images are not drawn by the build.** `scripts/og.js` needs headless Chrome and writes PNGs under `public/og/`.
  Do not redraw all of them (`--all`) unless asked: it rewrites ~80 MB.
- **Mirrored code.** `scripts/home-strip.js` mirrors card markup from `public/app.js` (`test/prerender.js` checks they
  agree), and `scripts/shelf.js` `slugify` must match `public/app.js` and `api/*.js`. Change both sides together.
- **No new runtime dependencies.** The site and the API functions use only Node built-ins and `fetch`. Dev dependencies
  for tests and one-off scripts go in `package.json`.
- **Never invent data**: vote counts, bookmark counts, `pair-signals.json` clicks, `bot-meta.json` badges. Leave a bot out
  rather than guess (README, "Badges").
- **Listings are a human decision.** Do not add, remove or recategorize bots, or edit their descriptions, unless asked.

## Writing tests

- A test is a plain Node script in `test/` that prints one line per check starting with `PASS ` or `FAIL ` and sets a
  non-zero exit code on failure. `test/validate.js` and `test/apisearch.js` are short examples.
- `test/run.js` finds suites by itself: a new `test/<name>.js` runs with no registration. If it `require`s
  `puppeteer-core` it is a browser suite and gets the base URL as `process.argv[2]`; otherwise it must run with no browser
  and no network (stub `global.fetch`, as `test/credit.js` and `test/submitlinks.js` do).
- To test the build against changed data, use `test/tempsite.js` (`tempSite(({ J, W }) => ...)`) or copy the repo to a
  temp folder as `test/build.js` does. Never let a test write into the working tree.
- Shared helpers (`serve`, `tempsite`, `scroll-all`) are listed in `HELPERS` in `test/run.js`.
- A failure message should say what was expected and what was found, so the log alone explains it.

## Layout

```
api/            Vercel functions (search, votes, submit)
db/             schema.sql and migrate.js for Neon
public/         the deployed site: hand-written pages, scripts and data, plus committed build output
scripts/        build.js and its modules; one-off tools (og.js, pairs-gen.js, creators-refresh.js, social.js)
test/           suites (node and browser) and helpers; run.js runs them
build/          sources for og.png and icons (not deployed)
```

## Conventions

- Plain CommonJS, no TypeScript, no bundler. Match the style of the file you are in.
- Comments say why, in full sentences; most files open with a comment that explains the file. Keep it current.
- User-facing copy is short, plain and specific. No hype words.
- Commit messages: lowercase area prefix and what changed, e.g. `home: ...`, `build: ...`, or
  `Add approved <Bot> by <Name> to the shelf` for listings.
- Several people and agents work here at once. Keep pull requests to one topic and avoid drive-by reformatting, so they
  merge cleanly.
