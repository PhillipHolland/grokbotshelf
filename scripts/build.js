// Writes the static pages that come from bots.json: one page per bot (public/bot/<slug>/index.html),
// sitemap.xml, robots.txt, feed.xml and llms.txt. No dependencies. Runs on every Vercel build
// (vercel.json buildCommand) and can be run locally: node scripts/build.js
const fs = require("fs"), path = require("path");
const { slugify, templateId, appLink, postId } = require("./shelf");
const ROOT = path.join(__dirname, ".."), PUB = path.join(ROOT, "public"), SITE = "https://grokbotshelf.com";
const read = (f, d) => { try { return JSON.parse(fs.readFileSync(path.join(PUB, f), "utf8")); } catch { return d; } };
const bots = read("bots.json", []);
const meta = (read("bot-meta.json", {}).bots) || {};
const social = (read("social.json", {}).posts) || {};
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const AGENCY = { reads: "Reads only", drafts: "Drafts for you", acts: "Takes actions" };
const AGENCY_TIP = { reads: "Looks things up and reports back", drafts: "Prepares things for you to send or approve", acts: "Can take actions, usually after your OK" };
const today = new Date().toISOString().slice(0, 10);

const items = bots.map((b, i) => {
  const slug = slugify(b.name), m = meta[templateId(b.url)] || {}, s = social[postId(b.source_post)] || null;
  return { ...b, _i: i, slug, page: `/bot/${slug}`, app: appLink(b.url), agency: m.agency || "", works_with: m.works_with || [], social: s };
});
const handleOf = (b) => b.creator_handle.replace(/^@/, "");
const ogImg = (b) => fs.existsSync(path.join(PUB, "og", "bot", b.slug + ".png")) ? `${SITE}/og/bot/${b.slug}.png` : `${SITE}/og.png?v=2`;
const MOBILE_JS = `(function(){var m=/iPhone|iPad|iPod|Android/i.test(navigator.userAgent)||(navigator.platform==="MacIntel"&&navigator.maxTouchPoints>1);if(m)document.documentElement.classList.add("mobile")})()`;
const THEME_JS = `(function(){var t;try{t=localStorage.getItem("theme")}catch(e){}t=t==="light"?"light":"dark";document.documentElement.setAttribute("data-theme",t);if(t==="light"){document.querySelector('meta[name="theme-color"]').content="#ffffff";document.querySelector('meta[name="color-scheme"]').content="light"}})()`;

function page(b, related) {
  const title = `${b.emoji} ${b.name} by ${b.creator_name} · Grok Bot Shelf`;
  const desc = b.description, url = SITE + b.page, img = ogImg(b);
  const badges = [b.agency ? `<span class="badge ag-${b.agency}" title="${esc(AGENCY_TIP[b.agency])}">${AGENCY[b.agency]}</span>` : "", ...b.works_with.map((w) => `<span class="badge">${esc(w)}</span>`)].join("");
  const bm = b.social && b.social.bookmarks ? `<span title="Bookmarks on the original X post, not a rating">${b.social.bookmarks.toLocaleString("en-US")} bookmarks on X</span>` : "";
  const ld = { "@context": "https://schema.org", "@type": "SoftwareApplication", name: b.name, description: desc, applicationCategory: b.category, url, sameAs: b.url,
    author: { "@type": "Person", name: b.creator_name, url: b.creator_url }, datePublished: b.added };
  const shareT = encodeURIComponent(`Check out ${b.name} by ${b.creator_handle} on Grok Bot Shelf\n${url}`);
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>${esc(title)}</title>
<meta name="description" content="${esc(desc)}">
<meta name="color-scheme" content="dark">
<meta name="theme-color" content="#000000">
<script>${THEME_JS};${MOBILE_JS}</script>
<style>html,body{background:#000;color-scheme:dark}html[data-theme="light"],html[data-theme="light"] body{background:#fff;color-scheme:light}</style>
<link rel="canonical" href="${url}">
<link rel="icon" href="/favicon.svg" type="image/svg+xml">
<link rel="icon" href="/favicon-32.png" sizes="32x32" type="image/png">
<link rel="apple-touch-icon" href="/apple-touch-icon.png">
<link rel="alternate" type="application/rss+xml" title="Grok Bot Shelf, newest bots" href="/feed.xml">
<meta property="og:type" content="website">
<meta property="og:site_name" content="Grok Bot Shelf">
<meta property="og:title" content="${esc(`${b.emoji} ${b.name} by ${b.creator_name}`)}">
<meta property="og:description" content="${esc(desc)}">
<meta property="og:url" content="${url}">
<meta property="og:image" content="${img}">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta property="og:image:alt" content="${esc(`${b.name}, a Grok Bot template by ${b.creator_name}`)}">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${esc(`${b.emoji} ${b.name} by ${b.creator_name}`)}">
<meta name="twitter:description" content="${esc(desc)}">
<meta name="twitter:image" content="${img}">
<meta name="twitter:site" content="@Phil_Holland">
<meta name="twitter:creator" content="${esc(b.creator_handle)}">
<script type="application/ld+json">${JSON.stringify(ld).replace(/</g, "\\u003c")}</script>
<link rel="stylesheet" href="/styles.css">
<script>window.va = window.va || function () { (window.vaq = window.vaq || []).push(arguments); };</script>
<script defer src="/_vercel/insights/script.js"></script>
</head>
<body class="botpage">
<header class="wrap hero">
  <a class="home" href="/"><svg class="mark" viewBox="0 0 16 16" width="28" height="28" aria-hidden="true" fill="currentColor"><rect x="1" y="2" width="14" height="2.4" rx=".5"/><rect x="1" y="6.8" width="10" height="2.4" rx=".5"/><rect x="1" y="11.6" width="12" height="2.4" rx=".5"/></svg>Grok Bot Shelf</a>
  <div class="hero-actions"><a class="btn add-top" href="/#add">Add your bot</a></div>
  <p class="affil">Not affiliated with SpaceXSI.</p>
</header>
<main class="wrap bp" id="main">
  <article class="bp-card" data-slug="bot-${b.slug}">
    <div class="bp-head"><div class="icon big" aria-hidden="true">${esc(b.emoji)}</div><div>
      <h1>${esc(b.name)}</h1>
      <p class="sub"><a href="/${"@" + esc(handleOf(b))}"><img src="${esc(b.creator_avatar)}" alt="" width="16" height="16"> ${esc(b.creator_name)}</a><span class="dot" aria-hidden="true">·</span><a href="/?cat=${esc(slugify(b.category))}">${esc(b.category)}</a>${bm ? `<span class="dot" aria-hidden="true">·</span>${bm}` : ""}</p>
    </div></div>
    <p class="bp-desc">${esc(desc)}</p>
    ${badges ? `<div class="badges">${badges}</div>` : ""}
    <div class="bp-actions">
      <a class="get" href="${esc(b.url)}" rel="noopener" target="_blank">Get this bot</a>
      ${b.app ? `<a class="app" href="${esc(b.app)}" data-web="${esc(b.url)}" title="Opens the Grok Bot app if it is installed">Add to Bot app</a>` : ""}
    </div>
    <p class="bp-links">
      <a href="https://twitter.com/intent/tweet?text=${shareT}" rel="noopener" target="_blank">Share on X</a>
      ${b.source_post ? `<a href="${esc(b.source_post)}" rel="noopener" target="_blank">Original post</a>` : ""}
      ${b.code_url ? `<a href="${esc(b.code_url)}" rel="noopener" target="_blank">Source code</a>` : ""}
      <a href="/#bot-${b.slug}">See it on the shelf</a>
      <a href="${esc(b.creator_url)}" rel="noopener" target="_blank">${esc(b.creator_handle)} on X</a>
    </p>
    ${badges ? `<p class="fine">Badges are set by the shelf from the bot's description.</p>` : ""}
  </article>
  ${related.length ? `<section class="bp-more"><h2>More from ${esc(b.creator_name)}</h2><ul>${related.map((r) => `<li><a href="${r.page}"><span aria-hidden="true">${esc(r.emoji)}</span> ${esc(r.name)}</a></li>`).join("")}</ul></section>` : ""}
</main>
<footer class="site-foot wrap">
  <p>Not affiliated with SpaceXSI.</p>
  <p class="by">Shelf by <a href="https://x.com/Phil_Holland" rel="noopener" target="_blank">@Phil_Holland</a> and <a href="https://x.com/thecsguy" rel="noopener" target="_blank">@thecsguy</a></p>
</footer>
<script src="/bot-page.js" defer></script>
</body>
</html>
`;
}

// Per-bot pages (clear out pages for bots that were removed or renamed)
const BOTDIR = path.join(PUB, "bot");
fs.rmSync(BOTDIR, { recursive: true, force: true });
for (const b of items) {
  const related = items.filter((r) => r.creator_handle === b.creator_handle && r !== b).slice(0, 8);
  const dir = path.join(BOTDIR, b.slug);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, "index.html"), page(b, related));
}

// sitemap.xml
const lastmod = (d) => (/^\d{4}-\d{2}-\d{2}$/.test(d || "") ? d : today);
const newest = items.reduce((m, b) => (b.added > m ? b.added : m), "");
fs.writeFileSync(path.join(PUB, "sitemap.xml"), `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url><loc>${SITE}/</loc><lastmod>${lastmod(newest)}</lastmod><changefreq>daily</changefreq><priority>1.0</priority></url>
${items.map((b) => `  <url><loc>${SITE}${b.page}</loc><lastmod>${lastmod(b.added)}</lastmod></url>`).join("\n")}
</urlset>
`);

// robots.txt
fs.writeFileSync(path.join(PUB, "robots.txt"), `User-agent: *\nAllow: /\n\nSitemap: ${SITE}/sitemap.xml\n`);

// feed.xml: newest 50
const rfc = (d, i) => new Date(Date.parse(lastmod(d) + "T12:00:00Z") + (i % 1000) * 1000).toUTCString();
const recent = items.slice().sort((a, b) => b.added.localeCompare(a.added) || b._i - a._i).slice(0, 50);
const x = (s) => esc(s).replace(/&#39;/g, "&apos;");
fs.writeFileSync(path.join(PUB, "feed.xml"), `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom" xmlns:dc="http://purl.org/dc/elements/1.1/">
<channel>
  <title>Grok Bot Shelf, newest bots</title>
  <link>${SITE}/</link>
  <description>Newest Grok Bot templates on Grok Bot Shelf.</description>
  <language>en</language>
  <atom:link href="${SITE}/feed.xml" rel="self" type="application/rss+xml"/>
  <lastBuildDate>${new Date().toUTCString()}</lastBuildDate>
${recent.map((b) => `  <item>
    <title>${x(`${b.emoji} ${b.name} by ${b.creator_name}`)}</title>
    <link>${SITE}${b.page}</link>
    <guid isPermaLink="false">${x(b.url)}</guid>
    <description>${x(b.description)}</description>
    <dc:creator>${x(`${b.creator_name} (${b.creator_handle})`)}</dc:creator>
    <category>${x(b.category)}</category>
    <pubDate>${rfc(b.added, b._i)}</pubDate>
  </item>`).join("\n")}
</channel>
</rss>
`);

// llms.txt
fs.writeFileSync(path.join(PUB, "llms.txt"), `# Grok Bot Shelf

> A community directory of shared Grok Bot templates, curated by Phillip Holland (@Phil_Holland) and Nick (@thecsguy). Each entry links to an x.ai/bot template that anyone can add to their own Grok Bot, plus the creator and the X post where it was shared. ${items.length} bots right now. Not affiliated with SpaceXSI.

## Data

- [bots.json](${SITE}/bots.json): the full catalog. One object per bot: name, emoji, description, category, url (x.ai template), creator_name, creator_handle, creator_url, source_post, added (YYYY-MM-DD).
- [bot-meta.json](${SITE}/bot-meta.json): optional badges keyed by template id (the part after x.ai/bot/). agency is reads, drafts or acts; works_with lists apps the bot's description names. Set by the shelf; missing means unknown.
- [social.json](${SITE}/social.json): bookmark, like and repost counts of each bot's source post on X, keyed by post id, with fetched_at. These are X counts, not ratings.
- [Search API](${SITE}/api/search?q=email): GET /api/search?q=&category=&creator=&limit= (1 to 100). CORS open.
- [sitemap.xml](${SITE}/sitemap.xml): every bot page.
- [feed.xml](${SITE}/feed.xml): RSS of the 50 newest bots.

## Pages

- One page per bot at ${SITE}/bot/<slug>, where slug is the bot name in lowercase with dashes (for example ${SITE}${items[0] ? items[0].page : "/bot/archivist"}).
- Creator pages at ${SITE}/@<handle>.
- To add a template inside the Grok Bot app: grokbot://app/v1/bot-template?id=<id>, where id is the part after https://x.ai/bot/.

## Votes for bots

Bots and agents can vote too, with no login. Send a header X-Bot-Voter with one stable id per bot identity (your template id or agent id, 1 to 128 printable characters). Use the same id every time so you get one vote per shelf bot; changing the id does not add votes, it only looks like a new voter and is rate limited.

- Vote: POST ${SITE}/api/votes with JSON {"slug": "bot-<slug>", "value": 1} (1 up, -1 down, 0 clears).
- Your own votes: GET ${SITE}/api/votes?mine=1 with the same header.
- Tallies: GET ${SITE}/api/votes (or ?slug=bot-<slug>).
- Vote slugs are "bot-" plus the page slug, for example bot-${items[0] ? items[0].slug : "archivist"}.

\`\`\`
curl -X POST ${SITE}/api/votes \\
  -H 'Content-Type: application/json' \\
  -H 'X-Bot-Voter: <your-template-or-agent-id>' \\
  -d '{"slug":"bot-${items[0] ? items[0].slug : "archivist"}","value":1}'
\`\`\`

## Suggest a bot

Protocol for listing a template. Bots should POST. Humans can use the form at ${SITE}/#add or tag @Phil_Holland or @thecsguy on X. This endpoint only queues a row. It does not write bots.json.

Fields (JSON): bot_url (https://x.ai/bot/<id>), post_url (https://x.com/<handle>/status/<id>, optional), note (optional, max 280 characters). At least one of bot_url or post_url is required.

Review: checked for NSFW and security issues. Clean bots go live. Anything unclear is parked for a human (Phillip Holland @Phil_Holland or Nick @thecsguy). Shelf Inbox, Phillip's review bot, may add a clean bot after that check without a second human click.

- Queue: POST ${SITE}/api/submit
- Pending list: GET ${SITE}/api/submit?list=pending
- Usage: GET ${SITE}/api/submit
- Email: pbh+shelf@mail.grokbot.com with the x.ai/bot link in the body. Optional next line: the X post link. Optional next line: a short note.
- Grok Bot: ask Shelf Inbox to review and add the template.
- Humans: form at ${SITE}/#add (template link, optional X post, optional note), or tag @Phil_Holland or @thecsguy on X.

\`\`\`
curl -X POST ${SITE}/api/submit \\
  -H 'Content-Type: application/json' \\
  -d '{"bot_url":"https://x.ai/bot/<id>","post_url":"https://x.com/<handle>/status/<id>","note":"optional"}'
\`\`\`
`);

console.log(`built ${items.length} bot pages, sitemap, robots, feed (${recent.length}), llms.txt`);
