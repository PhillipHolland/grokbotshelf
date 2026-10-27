// Writes the static pages that come from bots.json: one page per bot (public/bot/<slug>/index.html),
// one page per creator (public/@<handle>/index.html), sitemap.xml, robots.txt, feed.xml and llms.txt. No dependencies. Runs on every Vercel build
// (vercel.json buildCommand) and can be run locally: node scripts/build.js
const fs = require("fs"), path = require("path");
const { slugify, templateId, appLink, postId, ldScript } = require("./shelf");
const ROOT = path.join(__dirname, ".."), PUB = path.join(ROOT, "public"), SITE = "https://grokbotshelf.com";
const read = (f, d) => { try { return JSON.parse(fs.readFileSync(path.join(PUB, f), "utf8")); } catch { return d; } };
const bots = read("bots.json", []);
// one_job: true only for a short, single-purpose description (not a pack, crew, or "and also").
const meta = (read("bot-meta.json", {}).bots) || {};
const social = (read("social.json", {}).posts) || {};
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const AGENCY = { reads: "Reads only", drafts: "Drafts for you", acts: "Takes actions" };
const AGENCY_TIP = { reads: "Looks things up and reports back", drafts: "Prepares things for you to send or approve", acts: "Can take actions, usually after your OK" };
// Google Analytics 4 + Search Console. Both come from Vercel env vars and are off when unset:
// GA_MEASUREMENT_ID (G-XXXXXXXXXX) and GSC_VERIFICATION (the content value of the google-site-verification meta tag).
// The measurement script is not a static tag. It loads only when the hostname is grokbotshelf.com or
// www.grokbotshelf.com, so Vercel preview hosts and localhost never send hits. gtag() and dataLayer exist right
// away (calls queue, the page_view config included); gtag.js itself is fetched after the load event, when the
// main thread is idle, so its ~180 KB of script does not compete with the first render on phones.
// get_bot (public/app.js and public/bot-page.js) is the conversion for "Get this bot" / "Add to Bot app".
// Mark it as a key event in GA4 Admin → Data display → Events → get_bot → Mark as key event.
const GA_ID = /^G-[A-Z0-9]{4,20}$/.test(process.env.GA_MEASUREMENT_ID || "") ? process.env.GA_MEASUREMENT_ID : "";
const GSC = /^[\w-]{10,100}$/.test(process.env.GSC_VERIFICATION || "") ? process.env.GSC_VERIFICATION : "";
const GA_JS = GA_ID ? `<script>
(function(){
  var h=location.hostname;
  if(h!=="grokbotshelf.com"&&h!=="www.grokbotshelf.com")return;
  var id=${JSON.stringify(GA_ID)};
  window.dataLayer=window.dataLayer||[];
  function gtag(){dataLayer.push(arguments)}
  window.gtag=gtag;
  gtag("js",new Date());
  gtag("config",id);
  function load(){var s=document.createElement("script");s.async=true;s.src="https://www.googletagmanager.com/gtag/js?id="+id;document.head.appendChild(s)}
  function idle(){if(window.requestIdleCallback)requestIdleCallback(load,{timeout:3000});else setTimeout(load,1)}
  if(document.readyState==="complete")idle();else addEventListener("load",idle,{once:true});
})();
</script>` : "";
const GOOGLE_HEAD = [
  GSC && `<meta name="google-site-verification" content="${GSC}">`,
  GA_JS,
].filter(Boolean).join("\n");
{ // keep public/index.html in sync between the google markers
  const f = path.join(PUB, "index.html"), h = fs.readFileSync(f, "utf8");
  const n = h.replace(/<!-- google:start -->[\s\S]*?<!-- google:end -->/, `<!-- google:start -->${GOOGLE_HEAD ? "\n" + GOOGLE_HEAD + "\n" : ""}<!-- google:end -->`);
  if (n !== h) fs.writeFileSync(f, n);
}
// Local asset URLs get a content-hash ?v= so a changed file is a new URL. Avatars: cards and small spots use the 48px
// copy from scripts/avatars.js when its manifest says it was made from the current original; otherwise the original.
const fileHash = (() => { const seen = new Map(); return (rel) => {
  const f = path.join(PUB, String(rel).split("?")[0]);
  if (!seen.has(f)) { try { seen.set(f, require("crypto").createHash("sha256").update(fs.readFileSync(f)).digest("hex").slice(0, 10)); } catch { seen.set(f, ""); } }
  return seen.get(f);
}; })();
const versioned = (rel) => (/^\/[^/]/.test(rel || "") && !String(rel).includes("?") && fileHash(rel) ? `${rel}?v=${fileHash(rel)}` : rel);
// styles.css, app.js and shelf-up.js get the same ?v= in index.html and 404.html, so a CSS/JS change is never served stale from cache.
for (const page of ["index.html", "404.html"]) {
  const f = path.join(PUB, page); if (!fs.existsSync(f)) continue;
  const h = fs.readFileSync(f, "utf8");
  const n = h.replace(/(href|src)="\/(styles\.css|app\.js|shelf-up\.js)(\?v=[^"]*)?"/g, (_, a, file) => `${a}="${versioned("/" + file)}"`);
  if (n !== h) fs.writeFileSync(f, n);
}
const AVATARS_SM = read("avatars/48/manifest.json", {});
const avatarSm = (src) => {
  const m = /^\/avatars\/([^/?]+)$/.exec(src || ""), sm = m && "/avatars/48/" + m[1].replace(/\.\w+$/, ".webp");
  return m && AVATARS_SM[m[1]] && AVATARS_SM[m[1]] === fileHash(src) && fileHash(sm) ? versioned(sm) : versioned(src);
};
// One compact file for the home page (public/shelf-data.json): bots.json plus the bot-meta.json and social.json fields
// the cards use, so the page makes one request instead of three. The source files stay as they are (api/* reads them).
// index.html preloads it with a content-hash ?v= between the data markers, so a new catalog is a new URL.
{
  const pickKeys = (o, ks) => { const r = {}; for (const k of ks) if (o && o[k] !== undefined && o[k] !== null) r[k] = o[k]; return Object.keys(r).length ? r : undefined; };
  const shelfData = JSON.stringify({ bots: bots.map((b) => ({ ...b, meta: pickKeys(meta[templateId(b.url)], ["agency", "works_with", "one_job"]), social: pickKeys(social[postId(b.source_post)], ["bookmarks", "likes"]),
    creator_avatar: versioned(b.creator_avatar), avatar_sm: avatarSm(b.creator_avatar) })) });
  fs.writeFileSync(path.join(PUB, "shelf-data.json"), shelfData);
  const v = require("crypto").createHash("sha256").update(shelfData).digest("hex").slice(0, 10);
  const f = path.join(PUB, "index.html"), h = fs.readFileSync(f, "utf8");
  const n = h.replace(/<!-- data:start -->[\s\S]*?<!-- data:end -->/, `<!-- data:start --><link rel="preload" href="/shelf-data.json?v=${v}" as="fetch" crossorigin="anonymous"><!-- data:end -->`);
  if (n !== h) fs.writeFileSync(f, n);
}
const today = new Date().toISOString().slice(0, 10);

const items = bots.map((b, i) => {
  const slug = slugify(b.name), m = meta[templateId(b.url)] || {}, s = social[postId(b.source_post)] || null;
  return { ...b, _i: i, slug, page: `/bot/${slug}`, app: appLink(b.url), agency: m.agency || "", works_with: m.works_with || [], social: s };
});
const handleOf = (b) => b.creator_handle.replace(/^@/, "");
// Group key: lowercase handle, or "~" + name slug for creators with no X handle (kept apart, but no /@ page)
const ckey = (b) => b.creator_handle ? handleOf(b).toLowerCase() : "~" + slugify(b.creator_name);
// "Fitness Coach by Jenna" by Jenna → no second " by Jenna"
const titled = (b) => b.name.toLowerCase().endsWith(` by ${b.creator_name}`.toLowerCase()) ? b.name : `${b.name} by ${b.creator_name}`;
const ogFile = (dir, name) => fs.existsSync(path.join(PUB, "og", dir, name + ".png")) ? SITE + versioned(`/og/${dir}/${name}.png`) : `${SITE}/og.png?v=2`;
const ogImg = (b) => ogFile("bot", b.slug);

// Similar bots: same category, shared works_with apps, and shared description words weighted by rarity.
// Other creators only (their own bots are already in "More from"). Ties break by name, so output is stable.
const STOP = new Set("a an and any are as at be by can for from get gets go has have how in into is it its just keep keeps make makes more most my no not of on one or out over own so than that the them then they this to up use uses using what when where which while who will with you your bot bots grok grokbot template".split(" ")
  .concat("about after again against all also back based before between both down each every few first like new off only other same some such through way within without ai agent app apps assistant helper partner tool tools help helps turn turns read reads write writes find finds tell tells give gives quick clear real right facing".split(" ")));
const words = (b) => new Set(`${b.name} ${b.description}`.toLowerCase().replace(/[^a-z0-9\s]+/g, " ").split(/\s+/)
  .map((w) => (w.length > 3 && /[^s]s$/.test(w) ? w.slice(0, -1) : w)).filter((w) => w.length > 2 && !STOP.has(w)));
for (const b of items) b._words = words(b);
const df = new Map();
for (const b of items) for (const w of b._words) df.set(w, (df.get(w) || 0) + 1);
const idf = (w) => Math.log(items.length / df.get(w));
function similarTo(b) {
  const apps = new Set(b.works_with);
  return items.filter((o) => ckey(o) !== ckey(b)).map((o) => {
    const shared = [...o._words].filter((w) => b._words.has(w)), sharedApps = o.works_with.filter((w) => apps.has(w));
    const score = (o.category === b.category ? 4 : 0) + 3 * sharedApps.length + shared.reduce((t, w) => t + idf(w), 0);
    return { o, score, topical: shared.length + sharedApps.length };
  }).filter((r) => r.topical && r.score >= 5)
    .sort((x, y) => y.score - x.score || (x.o.name < y.o.name ? -1 : x.o.name > y.o.name ? 1 : 0))
    .slice(0, 3).map((r) => r.o);
}
// Shelfer template link, read from public/config.js (window.SHELFER_URL) for llms.txt and the protocol copy
const SHELFER_URL = ((() => { try { return fs.readFileSync(path.join(PUB, "config.js"), "utf8"); } catch { return ""; } })().match(/SHELFER_URL\s*=\s*"(https:\/\/x\.ai\/bot\/[A-Za-z0-9_-]+)"/) || [])[1] || "https://x.ai/bot/PkJM_w44LhHGmBnqCG_gi";
const HEADER = `<header class="wrap hero">
  <a class="home" href="/"><svg class="mark" viewBox="0 0 16 16" width="28" height="28" aria-hidden="true" fill="currentColor"><rect x="1" y="2" width="14" height="2.4" rx=".5"/><rect x="1" y="6.8" width="10" height="2.4" rx=".5"/><rect x="1" y="11.6" width="12" height="2.4" rx=".5"/></svg>Grok Bot Shelf</a>
  <div class="hero-actions"><a class="btn add-top" href="/#add">Add your bot</a><button type="button" class="theme-btn" id="theme" aria-label="Dark mode" aria-pressed="true" title="Toggle dark mode"><svg class="moon" viewBox="0 0 24 24" aria-hidden="true"><path d="M20.5 14.5A8.5 8.5 0 0 1 9.5 3.5a8.5 8.5 0 1 0 11 11z"/></svg><svg class="sun" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg></button></div>
  <p class="affil">Not affiliated with SpaceXSI.</p>
</header>`;
const FOOTER = `<footer class="site-foot wrap">
  <p>Not affiliated with SpaceXSI.</p>
  <p class="by">Shelf by <a href="https://x.com/Phil_Holland" rel="noopener" target="_blank">@Phil_Holland</a> and <a href="https://x.com/thecsguy" rel="noopener" target="_blank">@thecsguy</a></p>
</footer>`;
const head = ({ title, desc, url, img, ogTitle, alt, creator, ld }) => `<!doctype html>
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
<meta property="og:title" content="${esc(ogTitle)}">
<meta property="og:description" content="${esc(desc)}">
<meta property="og:url" content="${url}">
<meta property="og:image" content="${img}">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta property="og:image:alt" content="${esc(alt)}">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${esc(ogTitle)}">
<meta name="twitter:description" content="${esc(desc)}">
<meta name="twitter:image" content="${img}">
<meta name="twitter:site" content="@Phil_Holland">
<meta name="twitter:creator" content="${esc(creator)}">
${ldScript(ld)}
<script>${PREFETCH_JS}</script>
<link rel="stylesheet" href="${versioned("/styles.css")}">
<script src="${versioned("/shelf-up.js")}" defer></script>
<script>window.va = window.va || function () { (window.vaq = window.vaq || []).push(arguments); };</script>
<script defer src="/_vercel/insights/script.js"></script>
${GOOGLE_HEAD}
</head>`;
// "Under the hood" appears only when the creator supplied at least one of these optional bots.json fields:
// connectors, routines [{name, schedule}], sends/posts/spends (true or false), permissions_note. Only those rows show.
const CREATOR_SUPPLIED = `<span class="src">Creator-supplied</span>`;
const yes = (v) => (v ? "Yes" : "No");
function underTheHood(b) {
  const list = (a) => Array.isArray(a) && a.length ? a : null;
  const conn = list(b.connectors), rts = list(b.routines);
  const acts = ["sends", "posts", "spends"].filter((k) => typeof b[k] === "boolean");
  const rows = [
    ["Connectors and apps", conn && conn.map((c) => `<span class="badge">${esc(c)}</span>`).join("")],
    ["Routines and schedule", rts && `<ul>${rts.map((r) => `<li>${esc(r.name)}${r.schedule ? ` <span class="nl">· ${esc(r.schedule)}</span>` : ""}</li>`).join("")}</ul>`],
    ["Sends, posts or spends", acts.length && acts.map((k) => `${k[0].toUpperCase() + k.slice(1)}: ${yes(b[k])}`).join(" · ")],
    ["Permissions", b.permissions_note && esc(b.permissions_note)],
  ].filter(([, v]) => v);
  if (!rows.length) return "";
  return `<section class="bp-panel" aria-labelledby="bi-h">
    <h2 id="bi-h">Under the hood</h2>
    <dl>
${rows.map(([k, v]) => `      <div><dt>${k}</dt><dd>${v} ${CREATOR_SUPPLIED}</dd></div>`).join("\n")}
    </dl>
  </section>`;
}
// Prefetch bot and creator pages a visitor is about to open. Chrome and Edge get Speculation Rules (prefetch only, never
// prerender; "moderate" means on hover or pointerdown, at most 2 in flight). Other browsers get <link rel=prefetch> on
// hover or touch, at most 2 in flight, each URL once. Scope: same-origin /bot/* and /@* links without a query string,
// never /api. Nothing runs with Save-Data on or on a 2g connection. The same script is inlined in index.html.
const PREFETCH_RULES = { prefetch: [{ source: "document", eagerness: "moderate", where: { and: [
  { or: [{ href_matches: "/bot/*" }, { href_matches: "/@*" }] },
  { not: { href_matches: "/api/*" } },
  { not: { selector_matches: 'a[href*="?"]' } },
] } }] };
const PREFETCH_JS = `(function(){var c=navigator.connection;if(c&&(c.saveData||/2g$/.test(c.effectiveType||"")))return;\
if(HTMLScriptElement.supports&&HTMLScriptElement.supports("speculationrules")){var r=document.createElement("script");r.type="speculationrules";\
r.textContent=${JSON.stringify(JSON.stringify(PREFETCH_RULES))};document.head.appendChild(r);return}\
var done={},busy=0,timer;\
function url(a){var h=a.getAttribute("href")||"",u;if(h.indexOf("?")>=0)return"";try{u=new URL(h,location.href)}catch(e){return""}\
if(u.origin!==location.origin||u.search||!/^\\/(bot\\/|@)/.test(u.pathname)||u.pathname===location.pathname)return"";return u.origin+u.pathname}\
function go(a){var h=a&&url(a);if(!h||done[h]||busy>=2)return;done[h]=1;busy++;var l=document.createElement("link");l.rel="prefetch";l.href=h;\
l.onload=l.onerror=function(){busy--};document.head.appendChild(l)}\
function link(e){return e.target&&e.target.closest?e.target.closest("a[href]"):null}\
document.addEventListener("pointerenter",function(e){var a=e.target;if(a&&a.matches&&a.matches("a[href]")){clearTimeout(timer);timer=setTimeout(function(){go(a)},100)}},true);\
document.addEventListener("pointerleave",function(e){if(e.target&&e.target.matches&&e.target.matches("a[href]"))clearTimeout(timer)},true);\
document.addEventListener("touchstart",function(e){go(link(e))},{passive:true,capture:true})})()`;
const BADGE = { light: `${SITE}/badge.svg`, dark: `${SITE}/badge-dark.svg` };
const MOBILE_JS = `(function(){var m=/iPhone|iPad|iPod|Android/i.test(navigator.userAgent)||(navigator.platform==="MacIntel"&&navigator.maxTouchPoints>1);if(m)document.documentElement.classList.add("mobile")})()`;
const THEME_JS = `(function(){var t;try{t=localStorage.getItem("theme")}catch(e){}t=t==="light"?"light":"dark";document.documentElement.setAttribute("data-theme",t);if(t==="light"){document.querySelector('meta[name="theme-color"]').content="#ffffff";document.querySelector('meta[name="color-scheme"]').content="light"}})()`;

// Up/down vote pill on bot pages. public/bot-page.js loads the tally and posts to /api/votes (same cookie as the homepage).
const SVG = (d) => `<svg viewBox="0 0 24 24" aria-hidden="true">${d}</svg>`;
const VOTE = (b) => `<span class="vote bp-vote" data-vote="bot-${b.slug}" title="Vote on this bot"><button type="button" class="ib vb up" data-v="1" aria-pressed="false" aria-label="Upvote ${esc(b.name)}">${SVG('<path d="M12 19V5"/><path d="m6 11 6-6 6 6"/>')}</button><span class="vn">0</span><button type="button" class="ib vb dn" data-v="-1" aria-pressed="false" aria-label="Downvote ${esc(b.name)}">${SVG('<path d="M12 5v14"/><path d="m6 13 6 6 6-6"/>')}</button></span>`;
// JSON-LD: only fields the shelf actually has. No ratings or vote counts, no publisher.
const crumbs = (list) => ({ "@type": "BreadcrumbList", itemListElement: list.map(([name, item], i) => ({ "@type": "ListItem", position: i + 1, name, item })) });
const xProfile = (handle) => "https://x.com/" + handle;
function botLd(b, url, img) {
  const author = { "@type": "Person", name: b.creator_name, ...(b.creator_handle ? { url: SITE + "/@" + ckey(b), sameAs: xProfile(handleOf(b)) } : {}) };
  const trail = [["Grok Bot Shelf", SITE + "/"], ...(b.creator_handle ? [[b.creator_name, SITE + "/@" + ckey(b)]] : []), [b.name, url]];
  return { "@context": "https://schema.org", "@graph": [
    { "@type": "WebPage", "@id": url, url, name: titled(b), description: b.description, breadcrumb: { "@id": url + "#breadcrumb" },
      mainEntity: { "@type": "SoftwareApplication", name: b.name, description: b.description, url, sameAs: b.url, image: img, author } },
    { "@id": url + "#breadcrumb", ...crumbs(trail) },
  ] };
}
function page(b, related, similar) {
  const title = `${b.emoji} ${titled(b)} · Grok Bot Shelf`;
  const desc = b.description, url = SITE + b.page, img = ogImg(b);
  const badges = [b.agency ? `<span class="badge ag-${b.agency}" title="${esc(AGENCY_TIP[b.agency])}">${AGENCY[b.agency]}</span>` : "", ...b.works_with.map((w) => `<span class="badge">${esc(w)}</span>`)].join("");
  const bm = b.social && b.social.bookmarks ? `<span title="Bookmarks on the original X post, not a rating">${b.social.bookmarks.toLocaleString("en-US")} ${b.social.bookmarks === 1 ? "bookmark" : "bookmarks"} on X</span>` : "";
  const ld = botLd(b, url, img);
  const snipHtml = `<a href="${url}"><img src="${BADGE.light}" alt="Featured on Grok Bot Shelf" width="220" height="44"></a>`;
  const snipMd = `[![Featured on Grok Bot Shelf](${BADGE.light})](${url})`;
  const shareT = encodeURIComponent(`Check out ${b.name.toLowerCase().endsWith(` by ${b.creator_name}`.toLowerCase()) ? b.name : `${b.name} by ${b.creator_handle || b.creator_name}`} on Grok Bot Shelf\n${url}`);
  return `${head({ title, desc, url, img, ogTitle: `${b.emoji} ${titled(b)}`, alt: `${b.name}, a Grok Bot template by ${b.creator_name}`, creator: b.creator_handle || "@Phil_Holland", ld })}
<body class="botpage">
${HEADER}
<main class="wrap bp" id="main">
  <article class="bp-card" data-slug="bot-${b.slug}">
    <div class="bp-head"><div class="icon big" aria-hidden="true">${esc(b.emoji)}</div><div>
      <h1>${esc(b.name)}</h1>
      <p class="sub">${b.creator_handle ? `<a href="/@${esc(ckey(b))}"><img src="${esc(avatarSm(b.creator_avatar))}" alt="" width="16" height="16"> ${esc(b.creator_name)}</a>` : esc(b.creator_name)}<span class="dot" aria-hidden="true">·</span><a href="/?cat=${esc(slugify(b.category))}">${esc(b.category)}</a>${bm ? `<span class="dot" aria-hidden="true">·</span>${bm}` : ""}</p>
    </div></div>
    <p class="bp-desc">${esc(desc)}</p>
    ${badges ? `<div class="badges">${badges}</div>` : ""}
    <div class="bp-actions">
      <a class="get" href="${esc(b.url)}" rel="noopener" target="_blank">Get this bot</a>
      ${b.app ? `<a class="app" href="${esc(b.app)}" data-web="${esc(b.url)}" title="Opens the Grok Bot app if it is installed">Add to Bot app</a>` : ""}
      ${VOTE(b)}
    </div>
    <p class="bp-links">
      <a href="https://twitter.com/intent/tweet?text=${shareT}" rel="noopener" target="_blank">Share on X</a>
      ${b.source_post ? `<a href="${esc(b.source_post)}" rel="noopener" target="_blank">Original post</a>` : ""}
      ${b.code_url ? `<a href="${esc(b.code_url)}" rel="noopener" target="_blank">Source code</a>` : ""}
      <a href="/#bot-${b.slug}">See it on the shelf</a>
      ${b.creator_handle ? `<a href="${esc(b.creator_url)}" rel="noopener" target="_blank">${esc(b.creator_handle)} on X</a>` : ""}
    </p>
    ${badges ? `<p class="fine">Badges are set by the shelf from the bot's description.</p>` : ""}
  </article>
  ${underTheHood(b)}
  ${similar.length ? `<section class="bp-more"><h2>Similar bots</h2><ul>${similar.map((r) => `<li><a href="${r.page}"><span aria-hidden="true">${esc(r.emoji)}</span> ${esc(r.name)}<small>${esc(r.creator_name)}</small></a></li>`).join("")}</ul></section>` : ""}
  ${related.length ? `<section class="bp-more"><h2>More from ${esc(b.creator_name)}</h2><ul>${related.map((r) => `<li><a href="${r.page}"><span aria-hidden="true">${esc(r.emoji)}</span> ${esc(r.name)}</a></li>`).join("")}</ul></section>` : ""}
  <section class="bp-embed" aria-labelledby="em-h">
    <h2 id="em-h">Featured badge</h2>
    <p class="fine">Made this bot? Put the badge in your README or site. It links back to this page.</p>
    <p class="em-prev"><img src="/badge.svg" alt="Featured on Grok Bot Shelf" width="220" height="44"><img src="/badge-dark.svg" alt="Featured on Grok Bot Shelf, dark" width="220" height="44"></p>
    <div class="snip"><div class="snip-h"><span>HTML</span><button type="button" class="clear" data-copy="em-html">Copy</button></div><pre id="em-html">${esc(snipHtml)}</pre></div>
    <div class="snip"><div class="snip-h"><span>Markdown</span><button type="button" class="clear" data-copy="em-md">Copy</button></div><pre id="em-md">${esc(snipMd)}</pre></div>
    <p class="fine">On a dark background, use <code>${BADGE.dark}</code> instead.</p>
  </section>
</main>
${FOOTER}
<script src="/bot-page.js" defer></script>
</body>
</html>
`;
}

// Per-bot pages (clear out pages for bots that were removed or renamed)
const BOTDIR = path.join(PUB, "bot");
fs.rmSync(BOTDIR, { recursive: true, force: true });
for (const b of items) {
  const related = items.filter((r) => ckey(r) === ckey(b) && r !== b).slice(0, 8);
  const dir = path.join(BOTDIR, b.slug);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, "index.html"), page(b, related, similarTo(b)));
}

// Creator pages: one per handle, at /@<handle in lowercase> (the canonical URL used in links, sitemap and canonical tags).
// The file wins over the /@:handle rewrite in vercel.json, which stays as the fallback for unknown handles and other
// casings (index.html sends a mixed-case /@Handle to the lowercase URL). No page per casing: on a case-insensitive disk
// /@Handle and /@handle would be the same folder.
// Display name, handle casing, X link and avatar: the most frequent value across the creator's bots; a tie goes to the
// value on the most recently added bot (later in bots.json breaks a same-day tie).
const groups = new Map();
for (const b of items) { if (!groups.has(ckey(b))) groups.set(ckey(b), []); groups.get(ckey(b)).push(b); }
const newestFirst = (x, y) => (y.added || "").localeCompare(x.added || "") || y._i - x._i;
function pick(g, f) {
  const n = new Map();
  for (const b of g) n.set(f(b), (n.get(f(b)) || 0) + 1);
  const top = Math.max(...n.values());
  return f(g.slice().sort(newestFirst).find((b) => n.get(f(b)) === top));
}
for (const k of [...groups.keys()]) if (k.startsWith("~")) groups.delete(k); // bots with no known handle get no creator page
const creatorList = [...groups].map(([k, g]) => ({ bots: g, handle: pick(g, handleOf), name: pick(g, (b) => b.creator_name), url: pick(g, (b) => b.creator_url), avatar: pick(g, (b) => b.creator_avatar), page: "/@" + k }));
const fmtDate = (d) => /^\d{4}-\d{2}-\d{2}$/.test(d || "") ? new Date(d + "T12:00:00Z").toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric", timeZone: "UTC" }) : "";
function creatorPage(c) {
  const n = c.bots.length, nb = `${n} ${n === 1 ? "bot" : "bots"}`, url = SITE + c.page;
  const cats = [...new Set(c.bots.map((b) => b.category))].sort();
  const dates = c.bots.map((b) => b.added).filter((d) => fmtDate(d)).sort();
  const desc = `${nb} by ${c.name} (@${c.handle}) on Grok Bot Shelf: ${c.bots.slice(0, 4).map((b) => b.name).join(", ")}${n > 4 ? " and more" : ""}.`;
  const ld = { "@context": "https://schema.org", "@graph": [
    { "@type": "ProfilePage", "@id": url, url, name: `${c.name} (@${c.handle})`, description: desc, breadcrumb: { "@id": url + "#breadcrumb" },
      mainEntity: { "@type": "Person", name: c.name, alternateName: "@" + c.handle, sameAs: xProfile(c.handle), ...(c.avatar ? { image: SITE + versioned(c.avatar) } : {}) } },
    { "@type": "ItemList", "@id": url + "#bots", name: `Bots by ${c.name}`, numberOfItems: n,
      itemListElement: c.bots.map((b, i) => ({ "@type": "ListItem", position: i + 1, url: SITE + b.page, name: b.name })) },
    { "@id": url + "#breadcrumb", ...crumbs([["Grok Bot Shelf", SITE + "/"], [c.name, url]]) },
  ] };
  return `${head({ title: `${c.name} (@${c.handle}) · Grok Bot Shelf`, desc, url, img: ogFile("creator", c.handle.toLowerCase()), ogTitle: `${c.name} on Grok Bot Shelf`, alt: `${nb} by ${c.name} on Grok Bot Shelf`, creator: "@" + c.handle, ld })}
<body class="botpage">
${HEADER}
<main class="wrap bp" id="main">
  <article class="bp-card">
    <div class="bp-head"><img class="cp-av" src="${esc(versioned(c.avatar))}" alt="" width="56" height="56"><div>
      <h1>${esc(c.name)}</h1>
      <p class="sub"><a href="${esc(c.url)}" rel="noopener" target="_blank">@${esc(c.handle)} on X</a><span class="dot" aria-hidden="true">·</span><span>${nb} on the shelf</span></p>
    </div></div>
    <p class="bp-desc">Shares Grok Bot templates in ${cats.map(esc).join(", ")}.${dates.length ? ` On the shelf since ${fmtDate(dates[0])}${dates.length > 1 && dates[dates.length - 1] !== dates[0] ? `, newest added ${fmtDate(dates[dates.length - 1])}` : ""}.` : ""}</p>
    <p class="bp-links"><a href="/?creator=${esc(c.handle.toLowerCase())}">Open on the shelf</a><a href="${esc(c.url)}" rel="noopener" target="_blank">Follow on X</a></p>
  </article>
  <section class="bp-more cp-list"><h2>Bots by ${esc(c.name)}</h2><ul>${c.bots.map((b) => `<li><a href="${b.page}"><span aria-hidden="true">${esc(b.emoji)}</span> ${esc(b.name)}<small>${esc(b.description)}</small></a></li>`).join("")}</ul></section>
</main>
${FOOTER}
</body>
</html>
`;
}
for (const f of fs.readdirSync(PUB)) if (f.startsWith("@")) fs.rmSync(path.join(PUB, f), { recursive: true, force: true });
for (const c of creatorList) {
  fs.mkdirSync(path.join(PUB, c.page.slice(1)), { recursive: true });
  fs.writeFileSync(path.join(PUB, c.page.slice(1), "index.html"), creatorPage(c));
}

// Homepage cards are drawn by app.js into #results, and the featured view only links a few bots per creator.
// This list stays in the served HTML (and in the DOM after JS runs) so a crawler can discover every bot and
// creator page without executing JavaScript. It is a closed <details>, so the interactive shelf is unchanged
// until someone opens "All bots and creators".
{
  const botLinks = items.map((b) => `<a href="${b.page}">${esc(b.name)}</a>`).join("\n");
  const creatorLinks = creatorList.map((c) => `<a href="${c.page}">${esc(c.name)}</a>`).join("\n");
  const block = `<section class="crawl" id="all" aria-label="All bots and creators">
<details>
<summary>All bots and creators</summary>
<p class="crawl-h">Bots</p>
<nav aria-label="All bots">
${botLinks}
</nav>
<p class="crawl-h">Creators</p>
<nav aria-label="All creators">
${creatorLinks}
</nav>
</details>
</section>`;
  const f = path.join(PUB, "index.html"), h = fs.readFileSync(f, "utf8");
  const n = h.replace(/<!-- crawl:start -->[\s\S]*?<!-- crawl:end -->/, `<!-- crawl:start -->\n${block}\n<!-- crawl:end -->`);
  const linked = items[0] && n.includes(`href="${items[0].page}"`) && creatorList[0] && n.includes(`href="${creatorList[0].page}"`);
  if (!linked) throw new Error("homepage is missing <!-- crawl:start --> markers, or the crawl index did not include bot and creator links");
  if (n !== h) fs.writeFileSync(f, n);
}

// Homepage JSON-LD and the prefetch script, between the ld and prefetch markers in index.html. The SearchAction is real:
// app.js reads ?q= on load and filters the shelf to it.
{
  const site = { "@context": "https://schema.org", "@type": "WebSite", "@id": SITE + "/#website", name: "Grok Bot Shelf", url: SITE + "/",
    potentialAction: { "@type": "SearchAction", target: { "@type": "EntryPoint", urlTemplate: SITE + "/?q={search_term_string}" }, "query-input": "required name=search_term_string" } };
  const f = path.join(PUB, "index.html"), h = fs.readFileSync(f, "utf8");
  const n = h.replace(/<!-- ld:start -->[\s\S]*?<!-- ld:end -->/, `<!-- ld:start -->${ldScript(site)}<!-- ld:end -->`)
    .replace(/<!-- prefetch:start -->[\s\S]*?<!-- prefetch:end -->/, `<!-- prefetch:start --><script>${PREFETCH_JS}</script><!-- prefetch:end -->`);
  if (!n.includes("<!-- ld:end -->") || !n.includes("<!-- prefetch:end -->")) throw new Error("homepage is missing the ld or prefetch markers");
  if (n !== h) fs.writeFileSync(f, n);
}

// sitemap.xml
const lastmod = (d) => (/^\d{4}-\d{2}-\d{2}$/.test(d || "") ? d : today);
const newest = items.reduce((m, b) => (b.added > m ? b.added : m), "");
fs.writeFileSync(path.join(PUB, "sitemap.xml"), `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url><loc>${SITE}/</loc><lastmod>${lastmod(newest)}</lastmod><changefreq>daily</changefreq><priority>1.0</priority></url>
${items.map((b) => `  <url><loc>${SITE}${b.page}</loc><lastmod>${lastmod(b.added)}</lastmod></url>`).join("\n")}
${creatorList.map((c) => `  <url><loc>${SITE}${c.page}</loc><lastmod>${lastmod(c.bots.reduce((m, b) => (b.added > m ? b.added : m), ""))}</lastmod></url>`).join("\n")}
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
    <title>${x(`${b.emoji} ${titled(b)}`)}</title>
    <link>${SITE}${b.page}</link>
    <guid isPermaLink="false">${x(b.url)}</guid>
    <description>${x(b.description)}</description>
    <dc:creator>${x(b.creator_handle ? `${b.creator_name} (${b.creator_handle})` : b.creator_name)}</dc:creator>
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
- [sitemap.xml](${SITE}/sitemap.xml): every bot page and creator page.
- [feed.xml](${SITE}/feed.xml): RSS of the 50 newest bots.

## Pages

- One page per bot at ${SITE}/bot/<slug>, where slug is the bot name in lowercase with dashes (for example ${SITE}${items[0] ? items[0].page : "/bot/archivist"}).
- Creator pages at ${SITE}/@<handle>.
- One job filter (?one_job=1) keeps bots marked one_job in bot-meta.json. Most upvoted (?sort=votes) sorts by shelf vote score.
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

Limits. A "network" is the voter's IP address (its /64 for IPv6), stored only as a salted hash. Changing or clearing a vote you already cast is never capped; the caps apply to new votes:
- One vote per device: a browser (its cookie) or one X-Bot-Voter id gets one vote per shelf bot.
- cap_network: at most 3 voters per shelf bot from one network. Browser voters and X-Bot-Voter ids count together, so the 4th distinct voter on a network gets this.
- cap_daily: at most 100 new votes a day from one network.

Over a cap the API answers 429 with a Retry-After header (seconds) and JSON {"code": "cap_network" | "cap_daily", "error": "<sentence for people>", "retry_after": <seconds>}. cap_network does not lift with time, so retrying will not help; cap_daily lifts as votes turn a day old. A 429 with no code is the short burst limit: wait Retry-After seconds.

## Suggest a bot

Protocol for listing a template. Bots should POST /api/submit, or import Shelfer (${SHELFER_URL}) in Grok Bot and paste a template link: it dedups, smoke-checks, and POSTs the same endpoint. Humans can use the form at ${SITE}/#add, tag @Phil_Holland or @thecsguy on X, or email. This endpoint only queues a row. It does not write bots.json. Shelf Inbox stays the reviewer.

Fields (JSON): bot_url (https://x.ai/bot/<id>), post_url (https://x.com/<handle>/status/<id>, optional), note (optional, max 280 characters), creator_handle (optional X handle of the template author, @ optional), inspired_by (optional X handle credited for the idea, @ optional). Handles must match ^@?[A-Za-z0-9_]{1,15}$ or the request gets a 400. Credits are also appended to the note as "author:@x inspired_by:@y". At least one of bot_url or post_url is required.

Review: checked for NSFW and security issues. Clean bots go live. Anything unclear is parked for a human (Phillip Holland @Phil_Holland or Nick @thecsguy). Shelf Inbox, Phillip's review bot, may add a clean bot after that check without a second human click.

- Queue: POST ${SITE}/api/submit
- Pending list: GET ${SITE}/api/submit?list=pending
- Usage: GET ${SITE}/api/submit
- Shelfer: ${SHELFER_URL} (import it in Grok Bot, paste an x.ai/bot link and optional X post; it queues via /api/submit and never reviews or publishes)
- Email: pbh+shelf@mail.grokbot.com with the x.ai/bot link in the body. Optional next line: the X post link. Optional next line: a short note.
- Grok Bot: ask Shelf Inbox to review and add the template.
- Humans: form at ${SITE}/#add (template link, optional X post, optional note), or tag @Phil_Holland or @thecsguy on X.

\`\`\`
curl -X POST ${SITE}/api/submit \\
  -H 'Content-Type: application/json' \\
  -d '{"bot_url":"https://x.ai/bot/<id>","post_url":"https://x.com/<handle>/status/<id>","note":"optional","creator_handle":"@author","inspired_by":"@idea_credit"}'
\`\`\`
`);

console.log(`built ${items.length} bot pages, ${creatorList.length} creator pages, sitemap, robots, feed (${recent.length}), llms.txt`);
