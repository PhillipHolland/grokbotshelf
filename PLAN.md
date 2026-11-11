# Grok Bot Shelf improvement plan

Written 2026-11-10 from a read of this repo at `91db105e` and the live site. Planning only: no code, listing or data changes are part of this PR.

Effort is S (under a day), M (a few days), L (a week or more). Risk is what could go wrong for visitors, creators or the two of you.

## Where things stand

The shelf is a static site. `scripts/build.js` turns `public/bots.json` (1,055 bots, 213 creators, 15 categories) into a page per bot, creator, category, job hub and stack, plus the sitemap, feed and `llms.txt`. `public/app.js` draws the home grid from `shelf-data.json`. Three Vercel functions handle search, votes and the suggestions queue, with votes and the queue stored in Neon.

A lot is already in good shape, so this plan does not propose it again:

- Every bot page has its own title, description, canonical, Open Graph and Twitter card, a per-bot share image, and `SoftwareApplication` and breadcrumb structured data.
- The home HTML carries a real link to all 1,055 bot pages, so crawlers do not need JavaScript.
- Search is typo-tolerant, filters live in the URL, and there are sorts for newest, bookmarks, votes, A to Z and creator.
- Votes are live: 876 up and 132 down across 347 bots.
- Pages respond in 0.1 to 0.4 s from the edge. Home is about 51 KB of HTML compressed.

Things I did not measure: Lighthouse or Core Web Vitals, a screen-reader pass, GA4 numbers, and Search Console. Section 5 says where that matters.

## 1. What people come for, and what gets in the way

| Visitor goal | What gets in the way today |
|---|---|
| Find a useful bot fast | 1,055 bots with one sentence each and no images. The default home view is grouped by creator in file order, so what you see first depends on who was added first, not on what is good. One creator has 151 bots (14% of the shelf) and Lifestyle holds 157, so both browse paths have a long undifferentiated middle. |
| Trust it | A bot page is a name, one sentence, the maker and buttons. The "Can it act?" and "Works with" badges exist for 192 of 1,055 bots. "Under the hood" (connectors, routines, sends, posts, spends) exists in the build but no bot has any of those fields. 40 bots have no creator handle and 516 have no source post. Nothing says what a bot cannot do or what it needs before it works. |
| Install it | This part works: "Get this bot" and the app deep link are on every card and page. The gap is after the click. The site does not say what happens next on x.ai or what to connect first, and the 4 marketplace-link bots get no deep link. |

The biggest gap is trust, then ranking. Discovery plumbing and SEO are ahead of the content they point at.

## 2. Discovery

| # | Idea | User benefit | Effort | Risk |
|---|---|---|---|---|
| D1 | Add a "Trending" order from votes and recency with a per-creator cap (no analytics data; there is no GA access). Correction: the Featured view already caps each creator at 3 bots and has a Top voted strip, so the gap is smaller than first written. Ship it as a sort, then decide on the default. | First screen shows bots worth installing, not the first names in the file. | M | Ranking by votes invites gaming. The per-network vote caps help; a cap per creator and a decay keep it honest. Creators who drop will notice. |
| D2 | Split the catch-all categories. Lifestyle (157), Productivity (125) and Creator & Media (122) are too big to browse; add sub-tags or promote the existing role chips and job hubs on category pages. | Browsing a category ends in a short list. | M | Recategorising touches listings, which is your call per bot. Category slugs are indexed, so renames need redirects. |
| D3 | Search by intent, not only by words. Add a small synonym map (email to Gmail and Outlook, money to budget and invoices) and include `works_with` and job-hub names in the index. Apply the same to `/api/search`, which today is plain substring matching and weaker than the site search. | "email" finds bots that say "Gmail". Bots using the API get the same results people do. | S to M | Low. A bad synonym adds noise; keep the map short and in one file. |
| D4 | Log searches with no results (Vercel Analytics event, not GA4) and show job hubs plus "suggest a bot" on that screen. | You learn what people want and cannot find. The visitor gets a next step. | S | Low. Do not log free text that could hold personal data; truncate and lowercase. |
| D5 | Put the best job hubs and stacks on the home page above the grid. There are 19 hubs and 7 stacks, reached only through the nav. | "I want help with X" is answered in one tap. | S | Low. More above the fold pushes search down on phones; test at 390 px. |
| D6 | Bot page: replace the overlapping "Bots for the same job" and "Similar bots" lists with one de-duplicated list, and say why each is similar. | Less repetition on the page (Fitness Coach shows twice on `/bot/coach`). | S | Low. |
| D7 | Share cards: add the "acts / drafts / reads" badge and vote count to the per-bot image once coverage is there (T1). | A shared link says more than the name. | S | Redrawing 1,055 PNGs adds about 79 MB of churn to git unless T-debt item X2 lands first. |
| D8 | SEO follow-ups: confirm Search Console coverage for bot pages, add `ItemList` data to category and hub pages, and give categories a few sentences of real copy. | More long-tail entries ("grok bot for meal planning"). | S | Low. Needs Search Console access to verify. |

## 3. Trust and quality

| # | Idea | User benefit | Effort | Risk |
|---|---|---|---|---|
| T1 | Finish the "Can it act?" and "Works with" badges for the other 863 bots. Draft them from each description, then you review in batches. | Every card answers "will this send or spend on my behalf?" | M | A wrong "reads only" badge on a bot that acts is worse than no badge. Keep the README rule: leave a bot out rather than guess. |
| T2 | Ask creators for "Under the hood" at submission: connectors, routines, whether it sends, posts or spends, and one sentence on what it needs. Add those fields to the form and the queue row. Listing still happens by hand. | Bot pages gain the facts people want before importing, in the maker's words. | M | Longer form means fewer submissions; keep every new field optional. Creator claims are unverified, so keep the "Creator-supplied" label. |
| T3 | Add "What it can't do" and "Before you start" to the bot page, fed by T2 and by you for the bots you know. | Sets expectations, fewer disappointed installs. | S after T2 | Low. Empty sections must stay hidden. |
| T4 | Show a demo: embed the creator's source post (539 bots have one) on the bot page, loaded on tap. Creator screenshots are out for now (Nick, Nov 11). | People see the bot working. Today there are no images of any bot. | M | Embeds load X scripts and cost speed, so load on tap only. Screenshots need moderation and can show private data. |
| T5 | Decide the description rule and enforce it in the build. The README says one sentence under about 110 characters; 739 of 1,055 are longer (median 129, longest 332). Either raise the limit and add a short `tagline` for cards, or trim. | Cards scan evenly; the page keeps the longer text. | S to M | Trimming is an edit to listings and is yours to make. A hard build failure would block deploys, so start as a warning. |
| T6 | Fix credit gaps: 40 bots have no creator handle, so no avatar, no creator page and no way to check the maker. | Maker info on every bot. | S | Needs you to find the makers. Some may not want an X link. |
| T7 | Dead-link check: a scheduled job that requests every `x.ai/bot/...` link and reports 404s. | No dead installs. | S | Hitting x.ai 1,055 times needs polite pacing. Report only; removal stays manual. |
| T8 | Label the Amazon "Pairs with" chips as affiliate links right on the chip, not only in the page disclosure line. | Nobody mistakes an ad for a recommendation from the maker. | S | May lower click-through. It protects trust in the rest of the card. |
| T9 | Show "last checked" and "added" dates, and a "report a problem" link on each bot page that goes to the queue rather than an empty X post. | People can flag a broken or misleading bot. | S | Report spam; reuse the submit rate limits. |

## 4. Growth

| # | Idea | User benefit | Effort | Risk |
|---|---|---|---|---|
| G1 | After a suggestion is queued, show the creator what happens next and when, and once listed give them a prefilled X post with their bot page and share card. | Creators know their status and have a reason to post. Each post is a card linking back. | S | Promising a review time you then miss. Say "usually within N days" only if true. |
| G2 | One clear path on `/add`. Today it offers the form, Shelfer, email and Shelf Inbox. Lead with the form; put the rest under "other ways". | Fewer people stall choosing. | S | Low. |
| G3 | "Saved" list kept in the browser (no login), with a `/saved` page and a share link. | A reason to come back, and a list to send to a friend. | M | Local storage is lost on a new device. Say so on the page. |
| G4 | Weekly "New this week" post on X. The RSS feed and the `?new=1` view already exist; add a prefilled weekly X thread for you to post. No email list (Nick, Nov 11). | Return visits without anyone remembering the URL. | M | Low. Posting stays manual so nothing goes out unseen. |
| G5 | Creator pages as a home base: total votes, a "share my shelf" card, and the existing badge embed shown more prominently. | Makers link to their shelf page from their bio, which brings their followers. | S to M | Vote totals on creator pages raise the incentive to game votes. |
| G6 | Ask for the missing bots. Use D4's no-result searches to publish a short "wanted" list. | Makers build what visitors are searching for. | S after D4 | Low. |
| G7 | Refresh `social.json` on a schedule. It was last fetched on Nov 5 and covers 425 of the 539 bots with a source post, so "Most bookmarked" is stale and can never rank the 516 bots without a post. | That sort becomes trustworthy. | M | Needs X API access and its cost. If that is not available, consider hiding the sort. |

## 5. Speed, accessibility and mobile

| # | Idea | User benefit | Effort | Risk |
|---|---|---|---|---|
| P1 | Measure first: run Lighthouse and WebPageTest on home, one bot page and one creator page on a mid-range phone, and turn on Vercel Speed Insights. | Decisions from numbers. I only have transfer sizes and edge timings. | S | None. |
| P2 | Home loads about 265 KB compressed before images: HTML 51, `shelf-data.json` 151, `app.js` 32, CSS 28, plus four more scripts. Ship only the fields the cards need for the first view and fetch the rest on search or scroll. | Faster first paint on phones. | M | `app.js` has careful scroll and layout-shift handling with tests around it; changing data loading can regress that. |
| P3 | Bot pages inline about 45 KB of CSS each (71 KB raw, 17 KB compressed). That is good for a single visit and wasteful when browsing several. Check with P1 before changing. | Faster second and third page. | S | Moving to a shared file can slow the first visit. Only do it if P1 shows a gain. |
| P4 | Accessibility pass with a screen reader and keyboard on the filter dock, vote buttons and the add form, and wire `test/a11y.js` into CI (X1). 13 of 14 home images have empty alt text, which is right for decoration; confirm none of them carry meaning. | The site works without a mouse or sight. | S to M | Low. |
| P5 | Phone check at 390 px on the current build. The screenshots in `shots/` are from the 25-bot version, so there is no current reference. Look at filter chips, the A to Z rail and the floating tip button over content. | Nothing covers the install button on a phone. | S | Low. |

## 6. Tech debt and risks in the code

| # | Finding | Why it matters | Effort | Risk of fixing |
|---|---|---|---|---|
| X1 | No CI, no `package.json`. Tests need `puppeteer-core` from a path outside the repo, and the README deploys from a local folder with `vercel deploy --prod`. | 53 test files that nothing runs automatically. A bad `bots.json` edit reaches production. | M | Low. Add a manifest with dev dependencies and a GitHub Action that runs the build and the suite on pull requests. |
| X2 | Generated output is committed: 5,383 tracked files, 175 MB in `public` (79 MB share images, 70 MB bot pages), and `.git` is 111 MB after 64 commits. Vercel already runs the build on deploy. | Every listing commit rewrites generated files, which causes merge conflicts between the two of you (there are merge commits for this already) and the repo grows fast. | M to L | Share images need headless Chrome, which the Vercel build does not have. Keep images committed or move them to storage, and stop committing HTML first. |
| X3 | `GET /api/submit?list=pending` is public. It returns titles, descriptions and the submitter's free-text note for bots nobody has reviewed. 4 rows are pending now, all with notes. | Unreviewed, possibly NSFW or malicious, content is one URL away, and notes may hold things people did not expect to be public. | S | Shelf Inbox reads this endpoint, so it needs a token rather than a plain shutoff. |
| X4 | The approval policy is written three ways. `db/schema.sql` says a person always reviews. The README and `api/submit.js` say clean bots "may be added without a second human click". You say approvals are your manual call. | The form tells submitters "clean bots go live". Whichever is true, the code, docs and form should say the same thing. | S | None once you decide. See open questions. |
| X5 | Votes are keyed by a slug made from the bot name, so a rename resets its votes, and renames need a hand-written redirect in `vercel.json` (17 so far). | Renaming a bot costs it its ranking. | M | Needs a one-time migration of vote rows to template ids. Back up the table first. |
| X6 | `api/submit.js` and `api/votes.js` find the client IP differently (`x-forwarded-for` first versus Vercel's own header first), and each has its own copy of the Neon helper, salt check and slugify. | Rate limits can behave differently between the two. Fixes have to be made twice. | S | Low. Move the shared parts to one module. |
| X7 | `scripts/build.js` is one 1,208-line file with 79 functions; `app.js` is 1,327 lines. | Hard for either of you to change one page type without reading everything. | L | Refactoring without CI (X1) is risky. Do X1 first, then split by page type. |
| X8 | `bots.json` has no schema check beyond what the build happens to need. | Typos in a category or a missing field show up as odd pages rather than an error. | S | Low. Add validation to the build: required fields, known category, URL shape, date format. |
| X9 | Both functions run their `CREATE TABLE` statements on a cold start inside the request. | Slower first request and schema changes made by whichever request arrives first. | S | Low. Leave it to `db/migrate.js`. |
| X10 | Leftovers: `shots/` (old screenshots, several MB), `scripts/deny-pending-once.js` (a one-off with a hard-coded row id), `public/lab/`. | Noise for the next reader. | S | Check nothing references them before removing. |
| X11 | The content security policy only sets `frame-ancestors`. There is no script or connect policy. | Defence in depth for a site that renders text from 213 people. The build escapes it today. | M | A strict policy can break GA4, Vercel Insights and inline scripts. Roll out in report-only mode. |

## Top 5 to do first

1. **X3 and X4: close the public pending queue and settle the approval wording.** Small, and it removes the one thing here that could embarrass the shelf.
2. **X1: a manifest and CI that runs the build and tests on every pull request.** Everything after this is safer, and it protects the daily listing commits.
3. **T1 with T2: "Can it act?" on every bot, and ask creators for what a bot needs and does at submission.** This is the largest trust gap and the data model is already built.
4. **D1: a quality-ranked default view.** Votes and click events are already collected; the first screen should use them.
5. **T4 and T3: a demo on tap and "what it can't do" on bot pages.** This turns a one-sentence page into something a person can decide from.

X2 (stop committing generated HTML) is the next one after these.

## Decisions and status (updated 2026-11-11)

Nick's answers:

- Every listing is a manual call. Shelf Inbox does that review on Nick's behalf and approves only when a bot is fully verified.
- No Google Analytics access, so nothing in this plan should depend on GA4. D1 uses votes only and D4 would use Vercel Analytics.
- No creator screenshots for now. No email list.
- A per-creator cap is fine.

Found by checking: Vercel deploys from GitHub. Every push to `master` deploys and every pull request gets a preview, on two Vercel projects (`grokbotshelf` and `bot-hub`) in the same team. I could not see which one serves the domain; that team's Vercel settings are not open to me.

Draft pull requests for the top 5:

| Item | Pull request | Notes |
|---|---|---|
| 1. Pending queue and approval wording | #26 | Does nothing until `SUBMIT_LIST_TOKEN` is set on Vercel and given to Shelf Inbox. |
| 2. Manifest and CI | #27 | First full run on GitHub: 1,248 pass, 1 fail (`filterchunk`, passes locally). |
| 3. Creator-supplied details at submission | #28 | Also adds "Before you start" and "What it can't do" rows to bot pages. Badges for the other 863 bots are not done: that is editing listings. |
| 4. Trending | #29 | A sort option, not the default. |
| 5. Creator's post on tap | #30 | For the 539 bots with a source post. |

## Open questions for Nick

Still open after the answers above:

1. Which Vercel project serves grokbotshelf.com, and is the second one still needed? `SUBMIT_LIST_TOKEN` has to be set on the right one.
2. Is X API access available for G7, or should "Most bookmarked" be hidden?
3. The README limit for descriptions is about 110 characters and most bots are over it. Raise the limit, or add a short tagline field?
4. Should Trending become the default view once you have seen it on real votes?

Original list, for the record:

1. Approvals: is every listing a manual call by you, or can Shelf Inbox add clean bots on its own as the README and the form say? The answer decides the wording in X4 and whether X3 needs a token for the bot.
2. Does Vercel deploy from GitHub on push to `master`, or only from `vercel deploy --prod` on a local machine? That decides how CI gates production.
3. Do you have GA4 and Search Console access to share? `get_bot` clicks per bot would drive D1, and coverage numbers would confirm or sink D8.
4. Is X API access available for G7, or should "Most bookmarked" be hidden until it is?
5. Are you willing to accept screenshots from creators (T4), given they need a look before they go up?
6. The README limit for descriptions is about 110 characters and most bots are over it. Raise the limit, or add a short tagline field?
7. One creator has 151 bots. Is a per-creator cap in the default view acceptable to you and Phil?
8. Is an email list (G4) something you want to run, or should return visits stay on X and RSS?
