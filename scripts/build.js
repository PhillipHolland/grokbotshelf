// Writes the static pages that come from bots.json: one page per bot (public/bot/<slug>/index.html),
// one page per creator (public/@<handle>/index.html), sitemap.xml, robots.txt, feed.xml and llms.txt. No dependencies. Runs on every Vercel build
// (vercel.json buildCommand) and can be run locally: node scripts/build.js
const fs = require("fs"), path = require("path");
const { slugify, templateId, appLink, postId, ldScript } = require("./shelf");
const { loadCollections, rankJobMembers } = require("./collections");
const { pageCss, words: cssWords } = require("./page-css");
const { tipCard } = require("./tip");
const { pairsFor, productUrl, assertCatalog, assertPairKeys, pairCards, listPairSlice } = require("./pairs");
const { lucide, lucideSprite, emojiIcon, botMark, actionSprite, markLookup, PATHS } = require("./icons");
const { paragraphs, jobGuide, stackGuide, indexGuide, jobFaq, stacksFaq, faqLd, catsOf, cardPng } = require("./hub-copy");
const PAGE_CSS_MARK = "<!-- page-css -->";
const ROOT = path.join(__dirname, ".."), PUB = path.join(ROOT, "public"), SITE = "https://grokbotshelf.com";
const read = (f, d) => { try { return JSON.parse(fs.readFileSync(path.join(PUB, f), "utf8")); } catch { return d; } };
const bots = read("bots.json", []);
const products = read("products.json", null);
if (!products) throw new Error("public/products.json is missing");
assertCatalog(products);
assertPairKeys(bots.map((b) => ({ ...b, slug: slugify(b.name) })), JSON.parse(fs.readFileSync(path.join(PUB, "pairs.json"), "utf8")));
// one_job: true only for a short, single-purpose description (not a pack, crew, or "and also").
const meta = (read("bot-meta.json", {}).bots) || {};
const social = (read("social.json", {}).posts) || {};
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
// One sentence, from products.json. class "fine" on the bot-page section (that page must not also use .assoc).
// class "assoc" everywhere else. Hidden on the homepage until a card actually shows a chip.
function disclosure({ className = "assoc", id = "", hidden = false } = {}) {
  const idAttr = id ? ` id="${id}"` : "";
  return `<p${idAttr} class="${className}"${hidden ? " hidden" : ""}>${esc(products.disclosure)}</p>`;
}
function hubGlyph(c) {
  return lucide(c.icon || emojiIcon(c.emoji));
}
function markIcon(emoji) {
  return lucide(botMark(emoji));
}
function markSpan(emoji) {
  return `<span class="mk" aria-hidden="true">${markIcon(emoji)}</span>`;
}
// Search snippets cut off around 160 characters. The page and the JSON-LD keep the full text.
function clipDesc(s, n = 155) {
  const t = String(s ?? "").replace(/\s+/g, " ").trim();
  if (t.length <= n) return t;
  const cut = t.slice(0, n);
  const i = cut.lastIndexOf(" ");
  return (i > 80 ? cut.slice(0, i) : cut).replace(/[.,;:]+$/, "") + "...";
}
const AGENCY = { reads: "Reads only", drafts: "Drafts for you", acts: "Takes actions" };
const AGENCY_TIP = { reads: "Looks things up and reports back", drafts: "Prepares things for you to send or approve", acts: "Can take actions, usually after your OK" };
// Google Analytics 4 + Search Console. Both come from Vercel env vars and are off when unset:
// GA_MEASUREMENT_ID (G-XXXXXXXXXX) and GSC_VERIFICATION (the content value of the google-site-verification meta tag).
// The measurement script is not a static tag. It loads only when the hostname is grokbotshelf.com or
// www.grokbotshelf.com, so Vercel preview hosts and localhost never send hits. gtag() and dataLayer exist right
// away (calls queue, the page_view config included); gtag.js itself is fetched after the load event, when the
// main thread is idle, so its ~180 KB of script does not compete with the first render on phones.
// get_bot (public/app.js and public/bot-page.js) is the conversion for "Get this bot" / "Add to Bot app".
// pair_click (public/shelf-up.js) fires on a "Pairs with" Amazon link with bot_slug, product_id, position, and surface.
// Mark get_bot as a key event in GA4 Admin → Data display → Events → get_bot → Mark as key event.
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
// The font's URL lives in styles.css. Every page preloads it, since a stylesheet alone finds it only after the first layout.
const FONT_URL = (fs.readFileSync(path.join(PUB, "styles.css"), "utf8").match(/url\("(\/fonts\/[^"]+\.woff2)"\)/) || [])[1];
if (!FONT_URL || !fs.existsSync(path.join(PUB, FONT_URL))) throw new Error("styles.css does not name a font file in public/fonts");
const FONT_PRELOAD = `<link rel="preload" href="${FONT_URL}" as="font" type="font/woff2" crossorigin>`;
const withFontPreload = (h) => h.replace(/<link rel="preload" href="\/fonts\/[^>]*>\n?/, "").replace(/<link rel="stylesheet" href="\/styles\.css/, (m) => `${FONT_PRELOAD}\n${m}`);
// styles.css and the page scripts get the same ?v= in index.html and 404.html, so a CSS/JS change is never served stale from cache;
// vercel.json serves every one of them immutable once it carries ?v=.
for (const page of ["index.html", "404.html"]) {
  const f = path.join(PUB, page); if (!fs.existsSync(f)) continue;
  const h = fs.readFileSync(f, "utf8");
  const n = withFontPreload(h).replace(/(href|src)="\/(styles\.css|app\.js|add\.js|shelf-up\.js|config\.js|shelfer-sheet\.js)(\?v=[^"]*)?"/g, (_, a, file) => `${a}="${versioned("/" + file)}"`)
    // the share image too: X and Facebook cache a card by its URL, so a redrawn og.png needs a new ?v= here, as the hubs already get
    .replace(/content="https:\/\/grokbotshelf\.com\/og\.png(\?v=[^"]*)?"/g, () => `content="${SITE}${versioned("/og.png")}"`);
  if (n !== h) fs.writeFileSync(f, n);
}
const AVATARS_SM = read("avatars/48/manifest.json", {});
const avatarSm = (src) => {
  const m = /^\/avatars\/([^/?]+)$/.exec(src || ""), sm = m && "/avatars/48/" + m[1].replace(/\.\w+$/, ".webp");
  return m && AVATARS_SM[m[1]] && AVATARS_SM[m[1]] === fileHash(src) && fileHash(sm) ? versioned(sm) : versioned(src);
};
// Collections (round 4 #5): hand-picked groups that cut across categories, e.g. "Family". They live in bot-meta.json
// as collections: ["Family"] under the bot's template id. The home page lists each collection that has bots at the end
// of the category select (public/app.js reads them from shelf-data.json), so with none it is not offered at all.
const collectionsOf = (b) => { const c = (meta[templateId(b.url)] || {}).collections; return Array.isArray(c) ? [...new Set(c.filter((x) => typeof x === "string" && x.trim()).map((x) => x.trim()))] : []; };
// Role words (round 4 #6): a bot has a role only when that exact word (or its plural) is in its own name or
// description; nothing is inferred. A role becomes a home filter once ROLE_MIN bots use it.
const ROLE_WORDS = [["Chief of staff", "chiefs? of staff"], ["Assistant", "assistants?"], ["Coach", "coach(?:es)?"], ["Tutor", "tutors?"], ["Scout", "scouts?"],
  ["Manager", "managers?"], ["Planner", "planners?"], ["Advisor", "advis[oe]rs?"], ["Analyst", "analysts?"], ["Researcher", "researchers?"], ["Producer", "producers?"],
  ["Editor", "editors?"], ["Concierge", "concierges?"], ["Accountant", "accountants?"], ["Bookkeeper", "bookkeepers?"], ["Mentor", "mentors?"], ["Teacher", "teachers?"], ["CFO", "cfos?"]]
  .map(([label, p]) => [label, new RegExp(`\\b${p}\\b`, "i")]);
const ROLE_MIN = 5;
const roleWordsOf = (b) => ROLE_WORDS.filter(([, re]) => re.test(`${b.name} ${b.description}`)).map(([label]) => label);
const ROLES = (() => { const n = new Map(); for (const b of bots) for (const r of roleWordsOf(b)) n.set(r, (n.get(r) || 0) + 1);
  return [...n].filter(([, c]) => c >= ROLE_MIN).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])); })();
const rolesOf = (b) => roleWordsOf(b).filter((r) => ROLES.some(([x]) => x === r));
// Gallery view: the hash of the bot's thumbnail (public/og/thumb/<slug>.webp, drawn by scripts/og.js from its share
// card), used as ?v= for both the thumbnail and the card; absent when either is missing (the tile says "No share card yet")
const ogThumb = (b) => { const s = slugify(b.name); return fs.existsSync(path.join(PUB, "og", "bot", s + ".png")) && fileHash(`/og/thumb/${s}.webp`) || undefined; };
// ...and whether it has a 720px copy (public/og/thumb720/<slug>.webp), which the tile's srcset offers to 2x and 3x
// screens. The 720s share ONE version string (OG2, top-level "og2" in shelf-data.json): a hash over every 720's own
// hash, so regenerating any of them is a new ?v= for all, at the cost of one field instead of a hash per bot.
// A bot that has a 480 but no 720 gets "no720": true and its srcset offers the 480 alone.
const has720 = (b) => fs.existsSync(path.join(PUB, "og", "thumb720", slugify(b.name) + ".webp"));
const OG2 = (() => { const h = require("crypto").createHash("sha256"); let n = 0;
  for (const s of [...new Set(bots.filter((b) => ogThumb(b) && has720(b)).map((b) => slugify(b.name)))].sort()) { h.update(`${s}:${fileHash(`/og/thumb720/${s}.webp`)}\n`); n++; }
  return n ? h.digest("hex").slice(0, 10) : undefined; })();
// One compact file for the home page (public/shelf-data.json): bots.json plus the bot-meta.json and social.json fields
// the cards use, so the page makes one request instead of three. The source files stay as they are (api/* reads them).
// index.html preloads it with a content-hash ?v= between the data markers, so a new catalog is a new URL.
{
  const pickKeys = (o, ks) => { const r = {}; for (const k of ks) if (o && o[k] !== undefined && o[k] !== null) r[k] = o[k]; return Object.keys(r).length ? r : undefined; };
  const pairIcons = new Set(["bot"]);
  const shelfData = JSON.stringify({ og2: OG2, bots: bots.map((b) => {
    const packed = pairCards(pairsFor({ ...b, slug: slugify(b.name) }, products));
    for (const p of packed.pairs) if (p.icon) pairIcons.add(p.icon);
    const mark = botMark(b.emoji);
    pairIcons.add(mark);
    return { ...b, mark, meta: pickKeys(meta[templateId(b.url)], ["agency", "works_with", "one_job"]), social: pickKeys(social[postId(b.source_post)], ["bookmarks", "likes"]),
    collections: collectionsOf(b).length ? collectionsOf(b) : undefined, roles: rolesOf(b).length ? rolesOf(b) : undefined,
    og: ogThumb(b), no720: ogThumb(b) && !has720(b) || undefined,
    pairs: packed.pairs.length ? packed.pairs : undefined,
    pairsMore: packed.more || undefined,
    creator_avatar: versioned(b.creator_avatar), avatar_sm: avatarSm(b.creator_avatar) };
  }) });
  fs.writeFileSync(path.join(PUB, "shelf-data.json"), shelfData);
  const v = require("crypto").createHash("sha256").update(shelfData).digest("hex").slice(0, 10);
  const f = path.join(PUB, "index.html"), h = fs.readFileSync(f, "utf8");
  if (!h.includes("<!-- pairs-note:end -->")) throw new Error("index.html: the <!-- pairs-note:start --> / <!-- pairs-note:end --> markers are missing");
  if (!h.includes("<!-- icons:end -->")) throw new Error("index.html: the <!-- icons:start --> / <!-- icons:end --> markers are missing");
  const n = h.replace(/<!-- data:start -->[\s\S]*?<!-- data:end -->/, `<!-- data:start --><link rel="preload" href="/shelf-data.json?v=${v}" as="fetch" crossorigin="anonymous" fetchpriority="high"><!-- data:end -->`)
    .replace(/<!-- pairs-note:start -->[\s\S]*?<!-- pairs-note:end -->/, `<!-- pairs-note:start -->${disclosure({ className: "assoc pairs-note", id: "pairs-note", hidden: true })}<!-- pairs-note:end -->`)
    .replace(/<!-- icons:start -->[\s\S]*?<!-- icons:end -->/, `<!-- icons:start -->${lucideSprite(pairIcons)}<!-- icons:end -->`)
    .replace(/<!-- roles:start -->[\s\S]*?<!-- roles:end -->/, `<!-- roles:start -->${ROLES.length ? `<div class="selwrap role">
      <label class="sr" for="roles">Role word</label>
      <select id="roles" title="The exact word in the bot's own name or description"><option value="">Any role</option>${ROLES.map(([r, c]) => `<option value="${esc(slugify(r))}">${esc(r)} (${c})</option>`).join("")}</select>
      ${lucide("chevron-down")}
    </div>` : ""}<!-- roles:end -->`);
  if (n !== h) fs.writeFileSync(f, n);
}
const today = new Date().toISOString().slice(0, 10);

const items = bots.map((b, i) => {
  const slug = slugify(b.name), m = meta[templateId(b.url)] || {}, s = social[postId(b.source_post)] || null;
  return { ...b, _i: i, slug, page: `/bot/${slug}`, app: appLink(b.url), agency: m.agency || "", works_with: m.works_with || [], collections: collectionsOf(b), social: s };
});
const handleOf = (b) => b.creator_handle.replace(/^@/, "");
// Group key: lowercase handle, or "~" + name slug for creators with no X handle (kept apart, but no /@ page)
const ckey = (b) => b.creator_handle ? handleOf(b).toLowerCase() : "~" + slugify(b.creator_name);
// "Fitness Coach by Jenna" by Jenna → no second " by Jenna"
const titled = (b) => b.name.toLowerCase().endsWith(` by ${b.creator_name}`.toLowerCase()) ? b.name : `${b.name} by ${b.creator_name}`;
const STRIP_EMOJI = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE00}-\u{FE0F}\u{200D}\u{20E3}]/gu;
const plain = (s) => String(s ?? "").replace(STRIP_EMOJI, "").replace(/\s+/g, " ").trim();
const docTitle = (b) => {
  const name = plain(b.name), who = plain(b.creator_name);
  const already = name.toLowerCase().endsWith(` by ${who}`.toLowerCase());
  return already ? `${name}: Grok Bot template · Grok Bot Shelf` : `${name}: Grok Bot template by ${who} · Grok Bot Shelf`;
};
const catSlug = (name) => slugify(name);
const catPath = (name) => `/category/${catSlug(name)}`;
const handleCount = (list) => new Set(list.map((b) => (b.creator_handle ? handleOf(b).toLowerCase() : "")).filter(Boolean)).size;
const ogFile = (dir, name) => fs.existsSync(path.join(PUB, "og", dir, name + ".png")) ? SITE + versioned(`/og/${dir}/${name}.png`) : `${SITE}/og.png?v=3`;
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
// Job hubs (Find by job). Editors' picks until a real usage map exists. See scripts/collections.js.
// Plug Template Rewards in here later, as { [templateId]: number }. Leave this null until then.
// Do not invent install counts, and do not print a number the map does not have.
const usageByTemplateId = null;
const jobCollections = loadCollections(read("collections.json", {}), items).map((c) => {
  const ranked = rankJobMembers(c.members, c.pickSlugs, usageByTemplateId);
  return { ...c, ...ranked };
});
const jobBySlug = new Map();
for (const c of jobCollections) for (const b of c.members) {
  if (!jobBySlug.has(b.slug)) jobBySlug.set(b.slug, []);
  jobBySlug.get(b.slug).push(c);
}
// Shelfer template link, read from public/config.js (window.SHELFER_URL) for llms.txt and the protocol copy
const SHELFER_URL = ((() => { try { return fs.readFileSync(path.join(PUB, "config.js"), "utf8"); } catch { return ""; } })().match(/SHELFER_URL\s*=\s*"(https:\/\/x\.ai\/bot\/[A-Za-z0-9_-]+)"/) || [])[1] || "https://x.ai/bot/PkJM_w44LhHGmBnqCG_gi";
// One header for every shelf page. The mark and the "Grok Bot Shelf" words are a single link to /.
// title:true wraps that link in the page's h1 (the homepage). job is the "Find by job" line.
// addCurrent marks the Add bot button on /add. Anything else is a copy that will drift.
const MARK = `<svg class="mark" viewBox="0 0 16 16" width="28" height="28" aria-hidden="true" fill="currentColor"><rect x="1" y="2" width="14" height="2.4" rx=".5"/><rect x="1" y="6.8" width="10" height="2.4" rx=".5"/><rect x="1" y="11.6" width="12" height="2.4" rx=".5"/></svg>`;
const THEME_BTN = `<button type="button" class="theme-btn" id="theme" aria-label="Dark mode" aria-pressed="true" title="Toggle dark mode">${lucide("moon", { className: "moon" })}${lucide("sun", { className: "sun" })}</button>`;
function shelvedLabel(d) {
  return /^\d{4}-\d{2}-\d{2}$/.test(d || "") ? new Date(d + "T12:00:00Z").toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric", timeZone: "UTC" }) : "";
}
function growthStrip() {
  const when = shelvedLabel(items.reduce((m, b) => ((b.added || "") > m ? b.added : m), ""));
  return `<p class="growth" aria-label="Shelf">
  <span>${lucide("bot")}<b>${items.length.toLocaleString("en-US")}</b> bots</span>
  ${when ? `<span>${lucide("calendar")}Shelved ${esc(when)}</span>` : ""}
</p>`;
}
// Homepage footer only. Amazon pairs and the Gift referral help cover the plan.
// No fee dollars until a real Associates total exists: the line says they will show once they start.
// The Gift link uses .gift-top so shelf-up.js rotates Phil and Nick with the header.
function planNote() {
  const paired = items.filter((b) => pairsFor(b, products).length).length;
  const n = (x) => x.toLocaleString("en-US");
  return `<section class="cover-note" aria-labelledby="cover-note-h">
  <h2 id="cover-note-h">Helps pay for Grok Bot</h2>
  <p class="cover-note-line">Amazon pairs and Gift referrals help cover the plan. The shelf stays free.</p>
  <p class="cover-note-row">
    <span class="cover-chip">${lucide("bot")}<b>${n(items.length)}</b> bots</span>
    <span class="cover-chip">${lucide("shopping-bag")}<b>${n(paired)}</b> with pairs</span>
    <a class="cover-chip gift-top" href="https://grok.com/refer/bot?code=K9VPNSANC263" target="_blank" rel="noopener" aria-label="Gift Grok Bot (opens in new tab)">${lucide("gift")}Gift Grok Bot</a>
  </p>
  <p class="cover-note-fees">Affiliate Fees will show here once they start.</p>
</section>`;
}
// Search on every shelf header except the homepage, which already has the live dock.
// Submits to /?q= so the homepage scorer runs the query. Styled here, not in styles.css,
// so a header tweak does not rewrite the inlined CSS on every bot page.
const HERO_FIND_STYLE = `<style>.hero-find{flex:1 0 100%;display:flex;align-items:center;height:44px;min-width:0;margin:0;border-radius:9999px;background:var(--field);border:1px solid transparent;padding:0 6px 0 14px}.hero-find:focus-within{background:var(--bg);border-color:var(--blue)}.hero-find:focus-within .hf-i{stroke:var(--blue)}.hero-find .hf-i{width:18px;height:18px;flex:none;fill:none;stroke:var(--text2);stroke-width:2;stroke-linecap:round;stroke-linejoin:round}.hero-find input{flex:1;min-width:0;height:100%;border:0;background:transparent;color:var(--text);font:inherit;font-size:16px;padding:0 10px;outline:none}.hero-find input::placeholder{color:var(--text2)}.hero-find input::-webkit-search-cancel-button{-webkit-appearance:none;appearance:none}</style>\n`;
const HERO_FIND = `<form class="hero-find" action="/" method="get" role="search">
  <label class="sr" for="hq">Search bots</label>
  <svg class="hf-i" viewBox="0 0 24 24" aria-hidden="true"><path d="m21 21-4.34-4.34"/><circle cx="11" cy="11" r="8"/></svg>
  <input id="hq" name="q" type="search" placeholder="Search bots" autocomplete="off" autocapitalize="off" spellcheck="false" enterkeyhint="search">
</form>`;
function siteHeader({ title = false, job = "", addCurrent = false, growth = false } = {}) {
  const link = `<a class="home${title ? " gbs-brand" : ""}" href="/">${MARK}Grok Bot Shelf</a>`;
  const shelfH1 = title ? `\n  <h1 class="shelf-h1">${items.length.toLocaleString("en-US")} Grok Bot templates you can import</h1>` : "";
  const brand = link;
  const add = `<a class="btn add-top" href="/add"${addCurrent ? ` aria-current="page"` : ""}>Add bot</a>`;
  const gift = `<a class="btn gift-top" href="https://grok.com/refer/bot?code=K9VPNSANC263" target="_blank" rel="noopener" aria-label="Gift Grok Bot (opens in new tab)">Gift<span class="opt"> Grok Bot</span></a>`;
  const jobLine = job ? `\n<p class="job-find">${job}</p>` : "";
  const growthLine = growth ? `\n${growthStrip()}` : "";
  const findStyle = title ? "" : HERO_FIND_STYLE;
  const find = title ? "" : `\n  ${HERO_FIND}`;
  // Homepage only. .home is the compact size used on every other page; here the link keeps the large h1.
  // In the page, not styles.css, so a title-size tweak does not rewrite every bot page's stylesheet hash.
  const homeSize = title ? `<style>.gbs-brand{display:inline-flex;align-items:center;font-size:clamp(26px,4vw,34px);font-weight:700;letter-spacing:0;word-spacing:-.06em;line-height:1.1;color:inherit;gap:12px;min-width:0;text-decoration:none}h1.shelf-h1{display:block;flex:1 0 100%;margin:2px 0 0;white-space:normal;font-size:clamp(22px,3.2vw,30px);font-weight:500;letter-spacing:0;line-height:1.2}@media (max-width:640px){.gbs-brand{gap:9px;font-size:26px}h1.shelf-h1{font-size:22px}}@media (max-width:380px){.gbs-brand{gap:8px;font-size:24px}}</style>\n` : "";
  return `${homeSize}${findStyle}<header class="wrap hero">
  ${brand}
  <div class="hero-actions">${add}${gift}${THEME_BTN}</div>${find}
  <p class="affil">Not affiliated with SpaceXSI.</p>${shelfH1}${jobLine}${growthLine}
</header>`;
}
const HEADER = siteHeader();
function stampHeader(file, html) {
  const f = path.join(PUB, file), h = fs.readFileSync(f, "utf8");
  if (!h.includes("<!-- header:end -->")) throw new Error(`${file}: missing <!-- header:start --> / <!-- header:end --> markers`);
  const n = h.replace(/<!-- header:start -->[\s\S]*?<!-- header:end -->/, `<!-- header:start -->\n${html}\n<!-- header:end -->`);
  if (n !== h) fs.writeFileSync(f, n);
}
stampHeader("index.html", siteHeader({ title: true, growth: true, job: `<a href="/collections">Find by job</a><span aria-hidden="true"> · </span><a href="/stacks">Stacks</a>` }));
stampHeader("404.html", HEADER);
// Card-action sprite (#i-share and the rest). index.html and the lab mock both <use> it.
function stampActions(file) {
  const f = path.join(PUB, file), h = fs.readFileSync(f, "utf8");
  const block = `<!-- actions:start -->${actionSprite()}<!-- actions:end -->`;
  const n = h.includes("<!-- actions:end -->")
    ? h.replace(/<!-- actions:start -->[\s\S]*?<!-- actions:end -->/, block)
    : h.replace(/<svg width="0" height="0" style="position:absolute"[\s\S]*?<\/svg>/, block);
  if (!n.includes('id="i-share"') || !n.includes('id="i-x"')) throw new Error(`${file}: action sprite did not land`);
  if (n !== h) fs.writeFileSync(f, n);
}
stampActions("index.html");
stampActions("lab/desk/index.html");
// The lab mock redraws cards from shelf-data.json. Stamp the emoji map so those icons stay Lucide.
function stampDeskMarks() {
  const f = path.join(PUB, "lab/desk.js");
  const h = fs.readFileSync(f, "utf8");
  if (!h.includes("/* gbs-marks:end */")) throw new Error("lab/desk.js: missing gbs-marks markers");
  const block = `/* gbs-marks:start */${JSON.stringify(markLookup())}/* gbs-marks:end */`;
  const n = h.replace(/\/\* gbs-marks:start \*\/[\s\S]*?\/\* gbs-marks:end \*\//, block);
  if (!n.includes("function botIcon") || !n.includes("M12 8V4H8")) throw new Error("lab/desk.js: Lucide mark table did not land");
  if (n !== h) fs.writeFileSync(f, n);
}
stampDeskMarks();
{
  const f = path.join(PUB, "lab/desk/index.html");
  const h = fs.readFileSync(f, "utf8");
  const n = withFontPreload(h).replace(/(href|src)="(\/(?:styles\.css|shelf-up\.js|lab\/desk\.js))(\?v=[^"]*)?"/g, (_, a, file) => `${a}="${versioned(file)}"`);
  if (n !== h) fs.writeFileSync(f, n);
}
// Plan note is homepage-only, above the tip card. Bot pages and 404 keep the tip card alone.
{
  const f = path.join(PUB, "index.html"), h = fs.readFileSync(f, "utf8");
  if (!h.includes("<!-- plan:end -->")) throw new Error("index.html: missing <!-- plan:start --> / <!-- plan:end --> markers");
  const n = h.replace(/<!-- plan:start -->[\s\S]*?<!-- plan:end -->/, () => `<!-- plan:start -->\n${planNote()}\n<!-- plan:end -->`);
  if (n !== h) fs.writeFileSync(f, n);
}
// Tip card (scripts/tip.js) opens every footer; index.html and 404.html get it between their tip markers
const TIP = tipCard(versioned);
for (const page of ["index.html", "404.html"]) {
  const f = path.join(PUB, page); if (!fs.existsSync(f)) continue;
  const h = fs.readFileSync(f, "utf8");
  if (!h.includes("<!-- tip:end -->")) throw new Error(`${page}: the <!-- tip:start --> / <!-- tip:end --> markers in the footer are missing`);
  const n = h.replace(/<!-- tip:start -->[\s\S]*?<!-- tip:end -->/, () => `<!-- tip:start -->\n${TIP}\n<!-- tip:end -->`);
  if (n !== h) fs.writeFileSync(f, n);
}
const footer = (showAssoc) => `<footer class="site-foot wrap">
${TIP}
  <p>Not affiliated with SpaceXSI.</p>
${showAssoc ? `  ${disclosure()}\n` : ""}  <p class="by"><a href="/category">Categories</a> · <a href="/collections">Find by job</a> · <a href="/stacks">Stacks</a> · <a href="/add">Add a bot</a></p>
  <p class="by">Shelf by <a href="https://x.com/Phil_Holland" rel="noopener" target="_blank">@Phil_Holland</a> and <a href="https://x.com/thecsguy" rel="noopener" target="_blank">@thecsguy</a></p>
</footer>`;
// css: true (bot and creator pages) leaves a marker that becomes the inlined critical CSS once every page is built (round 6 #5)
const head = ({ title, desc, url, img, ogTitle, alt, creator, ld, css, ogType }) => {
  const meta = clipDesc(desc);
  const type = ogType === "profile" ? "profile" : "website";
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>${esc(title)}</title>
<meta name="description" content="${esc(meta)}">
<meta name="robots" content="max-image-preview:large, max-snippet:-1, max-video-preview:-1">
<meta name="color-scheme" content="dark">
<meta name="theme-color" content="#000000">
<script>${THEME_JS};${MOBILE_JS}</script>
<style>html,body{background:#000;color-scheme:dark}html[data-theme="light"],html[data-theme="light"] body{background:#fff;color-scheme:light}</style>
<link rel="canonical" href="${url}">
<link rel="icon" href="/favicon.svg" type="image/svg+xml">
<link rel="icon" href="/favicon-32.png" sizes="32x32" type="image/png">
<link rel="apple-touch-icon" href="/apple-touch-icon.png">
<link rel="alternate" type="application/rss+xml" title="Grok Bot Shelf, newest bots" href="/feed.xml">
<meta property="og:locale" content="en_US">
<meta property="og:type" content="${type}">
<meta property="og:site_name" content="Grok Bot Shelf">
<meta property="og:title" content="${esc(ogTitle)}">
<meta property="og:description" content="${esc(meta)}">
<meta property="og:url" content="${url}">
<meta property="og:image" content="${img}">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta property="og:image:alt" content="${esc(alt)}">
${type === "profile" ? `<meta property="profile:username" content="${esc(String(creator || "").replace(/^@/, ""))}">\n` : ""}<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${esc(ogTitle)}">
<meta name="twitter:description" content="${esc(meta)}">
<meta name="twitter:image" content="${img}">
<meta name="twitter:image:alt" content="${esc(alt)}">
<meta name="twitter:site" content="@Phil_Holland">
<meta name="twitter:creator" content="${esc(creator)}">
${ldScript(ld)}
<script>${PREFETCH_JS}</script>
${FONT_PRELOAD}
${css ? PAGE_CSS_MARK : `<link rel="stylesheet" href="${versioned("/styles.css")}">`}
<script src="${versioned("/shelf-up.js")}" defer></script>
<script>window.va = window.va || function () { (window.vaq = window.vaq || []).push(arguments); };</script>
<script defer src="/_vercel/insights/script.js"></script>
${GOOGLE_HEAD}
</head>`;
};
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
const SVG = (name) => `<svg viewBox="0 0 24 24" aria-hidden="true">${PATHS[name]}</svg>`;
const XLOGO = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/></svg>`;
const VOTE = (b) => `<span class="vote bp-vote" data-vote="bot-${b.slug}" data-tip="No votes yet. Be the first"><button type="button" class="ib vb up" data-v="1" aria-pressed="false" aria-label="Upvote ${esc(b.name)}">${SVG("arrow-up")}</button><span class="vn zero">0</span><span class="sr vsr"> votes</span><button type="button" class="ib vb dn" data-v="-1" aria-pressed="false" aria-label="Downvote ${esc(b.name)}">${SVG("arrow-down")}</button></span>`;
// JSON-LD: only fields the shelf actually has. No ratings or vote counts, no publisher.
const crumbs = (list) => ({ "@type": "BreadcrumbList", itemListElement: list.map(([name, item], i) => ({ "@type": "ListItem", position: i + 1, name, item })) });
function crumbsNav(list) {
  const parts = list.map(([name, href], i) => {
    const last = i === list.length - 1;
    return !last && href ? `<a href="${esc(href)}">${esc(name)}</a>` : `<span${last ? ' aria-current="page"' : ""}>${esc(name)}</span>`;
  }).join('<span class="sep" aria-hidden="true">/</span>');
  return `<nav class="crumbs" aria-label="Breadcrumb">${parts}</nav>`;
}
const xProfile = (handle) => "https://x.com/" + handle;
function botLd(b, url, img) {
  const author = { "@type": "Person", name: b.creator_name, ...(b.creator_handle ? { url: SITE + "/@" + ckey(b), sameAs: xProfile(handleOf(b)) } : {}) };
  const trail = [["Grok Bot Shelf", SITE + "/"], ...(b.creator_handle ? [[b.creator_name, SITE + "/@" + ckey(b)]] : []), [b.name, url]];
  return { "@context": "https://schema.org", "@graph": [
    { "@type": "WebPage", "@id": url, url, name: titled(b), description: b.description, breadcrumb: { "@id": url + "#breadcrumb" },
      mainEntity: { "@type": "SoftwareApplication", name: b.name, description: b.description, applicationCategory: b.category, operatingSystem: "Grok Bot", url, installUrl: b.url, sameAs: b.url, image: img,
        offers: { "@type": "Offer", price: "0", priceCurrency: "USD" }, author } },
    { "@id": url + "#breadcrumb", ...crumbs(trail) },
  ] };
}
// Other bots in the same job hub, plus a link to the hub. Uses the existing bot-page list
// styles so this does not add classes the critical CSS pass would have to learn.
function sameJob(b) {
  const jobs = jobBySlug.get(b.slug) || [];
  if (!jobs.length) return "";
  const items = jobs.flatMap((c) => {
    const others = c.members.filter((m) => m.slug !== b.slug).slice(0, 3);
    return [
      ...others.map((r) => `<li><a href="${r.page}">${markSpan(r.emoji)} ${esc(r.name)}${r.creator_name ? `<small>${esc(r.creator_name)}</small>` : ""}</a></li>`),
      `<li><a href="/collection/${esc(c.slug)}"><span class="job-glyph" aria-hidden="true">${hubGlyph(c)}</span> Also in: ${esc(c.name)}</a></li>`,
    ];
  }).join("");
  return `\n  <section class="bp-more"><h2>Bots for the same job</h2><ul>${items}</ul></section>`;
}
// Quiet Amazon row under the bot card. Curated pairs.json plus overrides. Empty when nothing qualifies.
// Disclosure sits in this section only, not again in the footer.
function pairsSection(b) {
  const hits = pairsFor(b, products);
  if (!hits.length) return "";
  const rel = products.ux.rel;
  const rows = hits.map(({ product: p, soft }, i) => {
    const href = productUrl(p, products.tag);
    const softAttr = soft ? ` data-soft=""` : "";
    return `<li><a class="pair" href="${esc(href)}" rel="${esc(rel)}" target="_blank" data-product="${esc(p.id)}" data-position="${i + 1}" data-bot="${esc(b.slug)}" data-surface="bot"${softAttr}><span class="icon" aria-hidden="true">${lucide(emojiIcon(p.emoji))}</span><span class="pair-copy"><span class="pair-name">${esc(p.name)}</span><span class="pair-blurb">${esc(p.blurb)}</span></span><span class="pair-cta">${esc(products.ux.cta)}</span></a></li>`;
  }).join("");
  return `\n  <section class="bp-pairs" aria-labelledby="pairs-h"><div class="pairs-head"><h2 id="pairs-h">${esc(products.ux.label)}</h2><span class="badge pair">Amazon</span></div><ul class="pairs">${rows}</ul>${disclosure({ className: "fine" })}</section>`;
}
// Quiet chip row beside a list card. At most two Amazon links, and at most one of them
// is still on probation (muted). Then +N to the bot page, which still lists every pair.
// Not inside the bot's own link. Disclosure is once per page, not on the card.
function miniPairs(b, surface) {
  const hits = pairsFor(b, products);
  if (!hits.length) return "";
  const { shown, extra } = listPairSlice(hits);
  const links = shown.map(({ product: p, soft }, i) => {
    const href = productUrl(p, products.tag);
    const softAttr = soft ? ` data-soft=""` : "";
    return `<a class="pair pair-mini" href="${esc(href)}" rel="${esc(products.ux.rel)}" target="_blank" data-product="${esc(p.id)}" data-position="${i + 1}" data-bot="${esc(b.slug)}" data-surface="${surface}"${softAttr}>${lucide(emojiIcon(p.emoji))} ${esc(p.name)}</a>`;
  }).join("");
  const more = extra ? `<a class="pair-more" href="${b.page}#pairs-h">+${extra}</a>` : "";
  return `<p class="card-pairs"><span class="card-pairs-l">${esc(products.ux.label)}</span>${links}${more}</p>`;
}
function page(b, related, similar) {
  const title = docTitle(b);
  const desc = b.description, url = SITE + b.page, img = ogImg(b);
  const badges = [...b.collections.map((c) => `<a class="badge coll" href="/?collection=${esc(slugify(c))}" title="In the shelf's ${esc(c)} collection">${esc(c)}</a>`), b.agency ? `<span class="badge ag-${b.agency}" title="${esc(AGENCY_TIP[b.agency])}">${AGENCY[b.agency]}</span>` : "", ...b.works_with.map((w) => `<span class="badge">${esc(w)}</span>`)].join("");
  const bm = b.social && b.social.bookmarks ? `<span title="Bookmarks on the original X post, not a rating">${b.social.bookmarks.toLocaleString("en-US")} ${b.social.bookmarks === 1 ? "bookmark" : "bookmarks"} on X</span>` : "";
  const ld = botLd(b, url, img);
  const snipHtml = `<a href="${url}"><img src="${BADGE.light}" alt="Featured on Grok Bot Shelf" width="220" height="44"></a>`;
  const snipMd = `[![Featured on Grok Bot Shelf](${BADGE.light})](${url})`;
  // Share pill in the header (round 4 #2): x.com's post intent with the page link as its own url param, the bot
  // credited the same way the cards credit it
  const shareText = `${b.name.toLowerCase().endsWith(` by ${b.creator_name}`.toLowerCase()) ? b.name : `${b.name} by ${b.creator_handle || b.creator_name}`} on Grok Bot Shelf`;
  const share = `https://x.com/intent/post?text=${encodeURIComponent(shareText)}&url=${encodeURIComponent(url)}`;
  const trail = [["Grok Bot Shelf", "/"], ...(b.creator_handle ? [[b.creator_name, "/@" + ckey(b)]] : []), [b.name, ""]];
  return `${head({ title, desc, url, img, ogTitle: `${b.emoji} ${titled(b)}`, alt: `${b.name}, a Grok Bot template by ${b.creator_name}`, creator: b.creator_handle || "@Phil_Holland", ld, css: true })}
<body class="botpage">
${HEADER}
<main class="wrap bp" id="main">
  ${crumbsNav(trail)}
  <article class="bp-card" data-slug="bot-${b.slug}">
    <div class="bp-head"><div class="icon big" aria-hidden="true">${markIcon(b.emoji)}</div><div>
      <h1>${esc(b.name)}</h1>
      <p class="sub"><a href="${catPath(b.category)}">${esc(b.category)}</a><span class="dot" aria-hidden="true">·</span>${b.creator_handle ? `<a href="/@${esc(ckey(b))}"><img src="${esc(avatarSm(b.creator_avatar))}" alt="" width="16" height="16"> ${esc(b.creator_name)}</a>` : esc(b.creator_name)}${bm ? `<span class="dot" aria-hidden="true">·</span>${bm}` : ""}</p>
    </div><a class="bp-share" href="${esc(share)}" rel="noopener" target="_blank" aria-label="Share ${esc(b.name)} on X">${XLOGO}<span class="lbl">Share</span></a></div>
    <p class="bp-desc">${esc(desc)}</p>
    ${badges ? `<div class="badges">${badges}</div>` : ""}
    <div class="bp-actions">
      <a class="get" href="${esc(b.url)}" rel="noopener" target="_blank">Get this bot</a>
      ${b.app ? `<a class="app" href="${esc(b.app)}" data-web="${esc(b.url)}" title="Opens the Grok Bot app if it is installed">Add to Bot app</a>` : ""}
      ${VOTE(b)}
    </div>
    <p class="bp-links">
      ${b.source_post ? `<a href="${esc(b.source_post)}" rel="noopener" target="_blank">Original post</a>` : ""}
      ${b.code_url ? `<a href="${esc(b.code_url)}" rel="noopener" target="_blank">Source code</a>` : ""}
      <a href="/#bot-${b.slug}">See it on the shelf</a>
      ${b.creator_handle ? `<a href="${esc(b.creator_url)}" rel="noopener" target="_blank">${esc(b.creator_handle)} on X</a>` : ""}${(jobBySlug.get(b.slug) || []).map((c) => `\n      <a href="/collection/${esc(c.slug)}">Also in: ${esc(c.name)}</a>`).join("")}
    </p>
    ${badges ? `<p class="fine">Badges are set by the shelf from the bot's description.</p>` : ""}
  </article>
  ${pairsSection(b)}
  ${underTheHood(b)}${sameJob(b)}
  ${similar.length ? `<section class="bp-more"><h2>Similar bots</h2><ul>${similar.map((r) => `<li><a href="${r.page}">${markSpan(r.emoji)} ${esc(r.name)}<small>${esc(r.creator_name)}</small></a></li>`).join("")}</ul></section>` : ""}
  ${related.length ? `<section class="bp-more"><h2>More from ${esc(b.creator_name)}</h2><ul>${related.map((r) => `<li><a href="${r.page}">${markSpan(r.emoji)} ${esc(r.name)}</a></li>`).join("")}</ul></section>` : ""}
  <section class="bp-embed" aria-labelledby="em-h">
    <h2 id="em-h">Featured badge</h2>
    <p class="fine">Made this bot? Put the badge in your README or site. It links back to this page.</p>
    <p class="em-prev"><img src="/badge.svg" alt="Featured on Grok Bot Shelf" width="220" height="44"><img src="/badge-dark.svg" alt="Featured on Grok Bot Shelf, dark" width="220" height="44"></p>
    <div class="snip"><div class="snip-h"><span>HTML</span><button type="button" class="clear" data-copy="em-html">Copy</button></div><pre id="em-html">${esc(snipHtml)}</pre></div>
    <div class="snip"><div class="snip-h"><span>Markdown</span><button type="button" class="clear" data-copy="em-md">Copy</button></div><pre id="em-md">${esc(snipMd)}</pre></div>
    <p class="fine">On a dark background, use <code>${BADGE.dark}</code> instead.</p>
  </section>
</main>
${footer()}
<script src="${versioned("/bot-page.js")}" defer></script>
</body>
</html>
`;
}

// Per-bot pages (clear out pages for bots that were removed or renamed)
const BOTDIR = path.join(PUB, "bot");
const pagesOut = []; // [file, html] for the bot and creator pages, written once the critical CSS is known
fs.rmSync(BOTDIR, { recursive: true, force: true });
for (const b of items) {
  const related = items.filter((r) => ckey(r) === ckey(b) && r !== b).slice(0, 8);
  const dir = path.join(BOTDIR, b.slug);
  fs.mkdirSync(dir, { recursive: true });
  pagesOut.push([path.join(dir, "index.html"), page(b, related, similarTo(b))]);
}

// Creator pages: one per handle, at /@<handle in lowercase> (the canonical URL used in links, sitemap and canonical tags).
// The creator's own casing (/@Phil_Holland, the way X shows it and people type it) is served the same page with status 200
// from public/@Phil_Holland.html (cleanUrls), so crawlers and no-JS visitors get the real page; its canonical tag is the
// lowercase URL and an inline history.replaceState puts the lowercase URL in the address bar without a reload. A file, not
// a folder, so it never collides with public/@phil_holland/ on a case-insensitive disk; one casing per creator for the same reason.
// Any other casing (/@PHIL_HOLLAND) and unknown handles get public/404.html (status 404), which sends a mixed-case /@Handle
// to the lowercase URL and otherwise says "Creator not found"; /u/:handle redirects to /@:handle in vercel.json.
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
  const jobs = [];
  const seenJob = new Set();
  for (const b of c.bots) for (const j of jobBySlug.get(b.slug) || []) if (!seenJob.has(j.slug)) { seenJob.add(j.slug); jobs.push(j); }
  const paired = c.bots.some((b) => pairsFor(b, products).length);
  const jobLinks = jobs.length ? `<p class="bp-links">${jobs.map((j) => `<a href="/collection/${esc(j.slug)}"><span class="job-glyph" aria-hidden="true">${hubGlyph(j)}</span> ${esc(j.name)}</a>`).join("")}</p>` : "";
  return `${head({ title: `${c.name} (@${c.handle}) · Grok Bot Shelf`, desc, url, img: ogFile("creator", c.handle.toLowerCase()), ogTitle: `${c.name} on Grok Bot Shelf`, alt: `${nb} by ${c.name} on Grok Bot Shelf`, creator: "@" + c.handle, ld, css: true, ogType: "profile" })}
<body class="botpage">
${HEADER}
<main class="wrap bp" id="main">
  ${crumbsNav([["Grok Bot Shelf", "/"], [c.name, ""]])}
  <article class="bp-card">
    <div class="bp-head"><img class="cp-av" src="${esc(versioned(c.avatar))}" alt="${esc(c.name)}" width="56" height="56"><div>
      <h1>${esc(c.name)}</h1>
      <p class="sub"><a href="${esc(c.url)}" rel="noopener" target="_blank">@${esc(c.handle)} on X</a><span class="dot" aria-hidden="true">·</span><span>${nb}${dates.length ? ` since ${fmtDate(dates[0])}` : " on the shelf"}</span></p>
    </div></div>
    <ul class="cp-cats" aria-label="Categories">${cats.map((k) => { const m = c.bots.filter((b) => b.category === k).length;
      return `<li><a href="/?creator=${esc(c.handle.toLowerCase())}&amp;cat=${esc(slugify(k))}">${esc(k)}${n > 1 ? ` <span class="n" aria-label="${m} ${m === 1 ? "bot" : "bots"}">${m}</span>` : ""}</a></li>`; }).join("")}</ul>
    <p class="bp-links"><a href="/?creator=${esc(c.handle.toLowerCase())}">Open on the shelf</a><a href="${esc(c.url)}" rel="noopener" target="_blank">Follow on X</a></p>
    ${jobLinks}
  </article>
  <section class="bp-more cp-list"><h2>Bots by ${esc(c.name)}</h2><ul>${c.bots.map((b) => `<li><a href="${b.page}">${markSpan(b.emoji)} ${esc(b.name)}<small class="cat"><span>${esc(b.category)}</span><span class="cp-sc zero" data-score="bot-${b.slug}" data-tip="No votes yet">${SVG("arrow-up")}${SVG("arrow-down")}<span class="n">0</span><span class="sr"> votes</span></span></small><small>${esc(b.description)}</small></a>${miniPairs(b, "creator")}</li>`).join("")}</ul></section>
  ${paired ? disclosure() : ""}
</main>
${footer()}
<script src="${versioned("/bot-page.js")}" defer></script>
</body>
</html>
`;
}
for (const f of fs.readdirSync(PUB)) if (f.startsWith("@")) fs.rmSync(path.join(PUB, f), { recursive: true, force: true });
for (const c of creatorList) {
  fs.mkdirSync(path.join(PUB, c.page.slice(1)), { recursive: true });
  const html = creatorPage(c);
  pagesOut.push([path.join(PUB, c.page.slice(1), "index.html"), html]);
  if (c.handle !== c.handle.toLowerCase()) pagesOut.push([path.join(PUB, "@" + c.handle + ".html"), html.replace("</head>",
    `<script>try{history.replaceState(history.state,"",${JSON.stringify(c.page)}+location.search+location.hash)}catch(e){}</script>\n</head>`)]);
}
// Find by job. These pages link the full stylesheet (they are not in pagesOut), so their classes
// stay out of the inlined critical CSS on bot and creator pages. Header, tip card and theme
// toggle are the same as every other shelf page.
function jobWho(b) {
  if (b.creator_handle) return `<a href="/@${esc(ckey(b))}">${esc(b.creator_name)}</a>`;
  return b.creator_name ? esc(b.creator_name) : "";
}
function jobBot(b) {
  const who = jobWho(b);
  return `<li class="job-bot"><a class="job-main" href="${b.page}"><span class="icon" aria-hidden="true">${markIcon(b.emoji)}</span><span class="jt"><h3>${esc(b.name)}</h3><small>${esc(b.description)}</small></span></a>${who ? `<p class="by">by ${who}</p>` : ""}${miniPairs(b, "collection")}</li>`;
}
function jobHeader(onIndex) {
  const jobs = onIndex ? `<a href="/collections" aria-current="page">Find by job</a>` : `<a href="/collections">Find by job</a>`;
  return siteHeader({ job: `${jobs}<span aria-hidden="true"> · </span><a href="/stacks">Stacks</a>` });
}
function writeJob(rel, html) {
  const f = path.join(PUB, rel);
  fs.mkdirSync(path.dirname(f), { recursive: true });
  fs.writeFileSync(f, html);
}
function guideHtml(text) {
  return `<div class="hub-guide">${paragraphs(text).map((p) => `<p>${esc(p)}</p>`).join("")}</div>`;
}
function faqHtml(faqs) {
  return `<section class="hub-faq" aria-labelledby="faq-h"><h2 id="faq-h">Questions</h2><dl>${faqs.map((f) => `<div><dt>${esc(f.q)}</dt><dd>${esc(f.a)}</dd></div>`).join("")}</dl></section>`;
}
function chipNav(label, links) {
  if (!links.length) return "";
  return `<nav class="job-more" aria-label="${esc(label)}"><h2>${esc(label)}</h2><ul>${links.join("")}</ul></nav>`;
}
// Card text per share dir, saved to scripts/og-cards.json for og.js.
const shareCards = {};
process.on("exit", (c) => { if (!c) fs.writeFileSync(path.join(__dirname, "og-cards.json"), JSON.stringify(shareCards, null, 1) + "\n"); });
function writeShares(dir, rows) {
  const abs = path.join(PUB, "og", dir);
  fs.mkdirSync(abs, { recursive: true });
  const keep = new Set(rows.map((r) => r.slug + ".png"));
  for (const f of fs.readdirSync(abs)) if (!keep.has(f)) fs.rmSync(path.join(abs, f));
  const urls = new Map();
  shareCards[dir] = rows;
  // og.js draws these in Shelf Serif; the bitmap cardPng only fills in a card that is missing.
  for (const r of rows) {
    const f = path.join(abs, r.slug + ".png");
    if (!fs.existsSync(f)) fs.writeFileSync(f, cardPng(r.card));
    urls.set(r.slug, SITE + versioned(`/og/${dir}/${r.slug}.png`));
  }
  return urls;
}
const categories = (() => {
  const m = new Map();
  for (const b of items) {
    if (!m.has(b.category)) m.set(b.category, []);
    m.get(b.category).push(b);
  }
  return [...m].sort((a, b) => a[0].localeCompare(b[0])).map(([name, members]) => {
    members.sort((a, b) => a.name.localeCompare(b.name) || a.slug.localeCompare(b.slug));
    return { name, slug: catSlug(name), members };
  });
})();
function categoryIntro(c) {
  const n = c.members.length;
  const creators = handleCount(c.members);
  const shown = c.members.slice(0, 3).map((b) => b.name);
  const who = shown.length >= 3 ? `${shown[0]}, ${shown[1]}, and ${shown[2]} are in this set.` : `${shown.join(" and ")} ${shown.length === 1 ? "is" : "are"} in this set.`;
  const from = creators ? ` from ${creators} ${creators === 1 ? "creator" : "creators"}` : "";
  return `${c.name} is a shelf category with ${n} Grok Bot ${n === 1 ? "template" : "templates"}${from}. ${who} Each page links the free template you import into Grok Bot. Open a bot to add it, or use the category filter on the home shelf when you want to mix this list with a search.`;
}
function botItems(name, members, category) {
  return {
    "@type": "ItemList", name, numberOfItems: members.length, category,
    itemListElement: members.map((b, i) => ({ "@type": "ListItem", position: i + 1, url: SITE + b.page, name: b.name })),
  };
}
fs.rmSync(path.join(PUB, "collection"), { recursive: true, force: true });
fs.rmSync(path.join(PUB, "collections"), { recursive: true, force: true });
const jobOg = writeShares("hub", jobCollections.map((c) => ({ slug: c.slug, card: { kicker: "Find by job", title: c.name, line: `${c.members.length} bots` } })));
{
  const desc = "Pick a job. Each page starts with a few bots, then lists the rest.";
  const guide = indexGuide("collections");
  const url = `${SITE}/collections`;
  const faqs = [
    { q: "When should I use Find by job?", a: "When you know the task, such as dinner or a claim, and you do not know which bot to open. Each card is a short list for that job." },
    { q: "How do I pick a bot on a job page?", a: "Read Start here first. Those are the editors' picks, in order. The shelf has no install counts, so this is not a popularity rank." },
    { q: "How is a job page different from a category?", a: "A category lists every template with that label. A job page keeps only the bots chosen for that task, and links the category when you want the wider set." },
  ];
  const ld = { "@context": "https://schema.org", "@graph": [
    { "@type": "CollectionPage", "@id": url, url, name: "Find a bot by the job", description: desc, isPartOf: { "@type": "WebSite", name: "Grok Bot Shelf", url: SITE + "/" },
      breadcrumb: { "@id": url + "#breadcrumb" },
      mainEntity: { "@type": "ItemList", name: "Jobs", numberOfItems: jobCollections.length, itemListElement: jobCollections.map((c, i) => ({ "@type": "ListItem", position: i + 1, url: `${SITE}/collection/${c.slug}`, name: c.name })) } },
    faqLd(url, faqs),
    { "@id": url + "#breadcrumb", ...crumbs([["Grok Bot Shelf", SITE + "/"], ["Find by job", url]]) },
  ] };
  const catLinks = categories.map((c) => `<li><a href="${catPath(c.name)}">${esc(c.name)}</a></li>`).join("");
  writeJob("collections/index.html", `${head({ title: "Find a bot by the job · Grok Bot Shelf", desc, url, img: `${SITE}${versioned("/og.png")}`, ogTitle: "Find a bot by the job", alt: "Grok Bot Shelf, find a bot by the job you need", creator: "@Phil_Holland", ld })}
<body class="botpage">
${jobHeader(true)}
<main class="wrap bp" id="main">
  ${crumbsNav([["Grok Bot Shelf", "/"], ["Find by job", ""]])}
  <article class="bp-card page-intro">
    <h1>Find a bot by the job</h1>
    <p class="job-lead">${esc(desc)}</p>
    ${guideHtml(guide)}
  </article>
  <ul class="job-index">${jobCollections.map((c) => `<li><a class="job-card" href="/collection/${esc(c.slug)}"><span class="icon" aria-hidden="true">${hubGlyph(c)}</span><span><h2>${esc(c.name)}</h2><small>${esc(c.blurb)}</small><small>${c.members.length} bots</small></span></a></li>`).join("")}</ul>
  ${faqHtml(faqs)}
  ${chipNav("Categories", [catLinks])}
</main>
${footer()}
</body>
</html>
`);
  for (const c of jobCollections) {
    const url = `${SITE}/collection/${c.slug}`;
    const n = c.members.length;
    const desc = c.blurb;
    const guide = jobGuide(c);
    const faqs = jobFaq(c);
    const catNames = catsOf(c.members);
    const ld = { "@context": "https://schema.org", "@graph": [
      { "@type": "CollectionPage", "@id": url, url, name: c.name, description: desc, isPartOf: { "@type": "WebSite", name: "Grok Bot Shelf", url: SITE + "/" },
        breadcrumb: { "@id": url + "#breadcrumb" },
        mainEntity: botItems(`${c.name} bots`, c.members, catNames.join(", ")) },
      faqLd(url, faqs),
      { "@id": url + "#breadcrumb", ...crumbs([["Grok Bot Shelf", SITE + "/"], ["Find by job", SITE + "/collections"], [c.name, url]]) },
    ] };
    const alts = c.rest.length ? `<section class="job-alts" aria-labelledby="more-h"><h2 id="more-h">More like this</h2><ul class="job-bots">${c.rest.map(jobBot).join("")}</ul></section>` : "";
    const hubPairs = c.members.some((b) => pairsFor(b, products).length);
    const catLinks = catNames.map((name) => `<li><a href="${catPath(name)}">${esc(name)}</a></li>`);
    writeJob(`collection/${c.slug}/index.html`, `${head({ title: `${c.name} · Grok Bot Shelf`, desc, url, img: jobOg.get(c.slug), ogTitle: `${c.name} bots on Grok Bot Shelf`, alt: `${c.name}: bots for this job on Grok Bot Shelf`, creator: "@Phil_Holland", ld })}
<body class="botpage">
${jobHeader(false)}
<main class="wrap bp" id="main">
  ${crumbsNav([["Grok Bot Shelf", "/"], ["Find by job", "/collections"], [c.name, ""]])}
  <article class="bp-card page-intro">
    <div class="bp-head hub-head"><div class="icon big" aria-hidden="true">${hubGlyph(c)}</div><div>
      <h1>${esc(c.name)}</h1>
      <p class="sub"><a href="/collections">Find by job</a><span class="dot" aria-hidden="true">·</span><span>${n} ${n === 1 ? "bot" : "bots"}</span></p>
    </div></div>
    ${guideHtml(guide)}
  </article>
  <section class="job-picks" aria-labelledby="start-h">
    <h2 id="start-h">Start here</h2>
    <ul class="job-bots">${c.start.map(jobBot).join("")}</ul>
  </section>
  ${alts}
  ${faqHtml(faqs)}
  ${chipNav("Categories in this job", catLinks)}
  ${hubPairs ? disclosure() : ""}
  ${jobCollections.length > 1 ? `<nav class="job-more" aria-label="Other jobs"><h2>Other jobs</h2><ul>${jobCollections.filter((o) => o.slug !== c.slug).map((o) => `<li><a href="/collection/${esc(o.slug)}"><span class="job-glyph" aria-hidden="true">${hubGlyph(o)}</span> ${esc(o.name)}</a></li>`).join("")}</ul></nav>` : ""}
</main>
${footer()}
</body>
</html>
`);
  }
}
// Category hubs. /?cat= stays the home-shelf filter. These pages are the crawlable landing.
fs.rmSync(path.join(PUB, "category"), { recursive: true, force: true });
const categoryOg = writeShares("category", categories.map((c) => ({ slug: c.slug, card: { kicker: "Category", title: c.name, line: `${c.members.length} templates` } })));
{
  const desc = `${categories.length} categories of shared Grok Bot templates. Each page lists the bots you can import.`;
  const url = `${SITE}/category`;
  const ld = { "@context": "https://schema.org", "@graph": [
    { "@type": "CollectionPage", "@id": url, url, name: "Categories", description: desc, isPartOf: { "@type": "WebSite", name: "Grok Bot Shelf", url: SITE + "/" },
      breadcrumb: { "@id": url + "#breadcrumb" },
      mainEntity: { "@type": "ItemList", name: "Categories", numberOfItems: categories.length, itemListElement: categories.map((c, i) => ({ "@type": "ListItem", position: i + 1, url: `${SITE}/category/${c.slug}`, name: c.name })) } },
    { "@id": url + "#breadcrumb", ...crumbs([["Grok Bot Shelf", SITE + "/"], ["Categories", url]]) },
  ] };
  writeJob("category/index.html", `${head({ title: "Categories · Grok Bot Shelf", desc, url, img: `${SITE}${versioned("/og.png")}`, ogTitle: "Grok Bot template categories", alt: "Categories of Grok Bot templates on Grok Bot Shelf", creator: "@Phil_Holland", ld })}
<body class="botpage">
${siteHeader({ job: `<a href="/category" aria-current="page">Categories</a><span aria-hidden="true"> · </span><a href="/collections">Find by job</a><span aria-hidden="true"> · </span><a href="/stacks">Stacks</a>` })}
<main class="wrap bp" id="main">
  ${crumbsNav([["Grok Bot Shelf", "/"], ["Categories", ""]])}
  <article class="bp-card page-intro">
    <h1>Categories</h1>
    <p class="job-lead">${esc(desc)} The home shelf can still filter with <a href="/?cat=${esc(categories[0] ? categories[0].slug : "")}">?cat=</a>. These pages are the ones to link and to index.</p>
  </article>
  <ul class="job-index">${categories.map((c) => `<li><a class="job-card" href="/category/${esc(c.slug)}"><span><h2>${esc(c.name)}</h2><small>${c.members.length} bots</small></span></a></li>`).join("")}</ul>
</main>
${footer()}
</body>
</html>
`);
  for (const c of categories) {
    const url = `${SITE}/category/${c.slug}`;
    const n = c.members.length;
    const intro = categoryIntro(c);
    const creators = handleCount(c.members);
    const jobs = jobCollections.filter((j) => j.members.some((b) => b.category === c.name)).slice(0, 6);
    const ld = { "@context": "https://schema.org", "@graph": [
      { "@type": "CollectionPage", "@id": url, url, name: c.name, description: intro, isPartOf: { "@type": "WebSite", name: "Grok Bot Shelf", url: SITE + "/" },
        breadcrumb: { "@id": url + "#breadcrumb" },
        mainEntity: { "@id": url + "#bots", ...botItems(`${c.name} Grok Bot templates`, c.members, c.name) } },
      { "@id": url + "#breadcrumb", ...crumbs([["Grok Bot Shelf", SITE + "/"], ["Categories", SITE + "/category"], [c.name, url]]) },
    ] };
    const other = categories.filter((o) => o.slug !== c.slug).map((o) => `<li><a href="/category/${esc(o.slug)}">${esc(o.name)}</a></li>`);
    const jobLinks = jobs.map((j) => `<li><a href="/collection/${esc(j.slug)}"><span class="job-glyph" aria-hidden="true">${hubGlyph(j)}</span> ${esc(j.name)}</a></li>`);
    writeJob(`category/${c.slug}/index.html`, `${head({ title: `${c.name} Grok Bot templates · Grok Bot Shelf`, desc: intro, url, img: categoryOg.get(c.slug), ogTitle: `${c.name} on Grok Bot Shelf`, alt: `${c.name}: ${n} Grok Bot templates`, creator: "@Phil_Holland", ld })}
<body class="botpage">
${siteHeader({ job: `<a href="/category">Categories</a><span aria-hidden="true"> · </span><a href="/collections">Find by job</a><span aria-hidden="true"> · </span><a href="/stacks">Stacks</a>` })}
<main class="wrap bp" id="main">
  ${crumbsNav([["Grok Bot Shelf", "/"], ["Categories", "/category"], [c.name, ""]])}
  <article class="bp-card page-intro">
    <h1>${esc(c.name)}</h1>
    <p class="sub"><a href="/category">Categories</a><span class="dot" aria-hidden="true">·</span><span>${n} ${n === 1 ? "bot" : "bots"}${creators ? ` · ${creators} ${creators === 1 ? "creator" : "creators"}` : ""}</span></p>
    <p class="bp-desc">${esc(intro)}</p>
    <p class="bp-links"><a href="/?cat=${esc(c.slug)}">Filter this category on the shelf</a></p>
  </article>
  <section class="bp-more cp-list"><h2>Bots in ${esc(c.name)}</h2><ul>${c.members.map((b) => `<li><a href="${b.page}">${markSpan(b.emoji)} ${esc(b.name)}<small>${esc(b.creator_name)}</small><small>${esc(b.description)}</small></a></li>`).join("")}</ul></section>
  ${chipNav("Jobs that use this category", jobLinks)}
  ${chipNav("Other categories", other)}
</main>
${footer()}
</body>
</html>
`);
  }
}
// Bot and creator pages get styles.css minus the rules that can't match on them, inlined (scripts/page-css.js), so the
// first paint needs no stylesheet request. Anything the pages' HTML or their scripts mention keeps its rules. The full
// stylesheet is prefetched at idle so going on to the shelf finds it cached, as it did when these pages linked it
// (not with Save-Data on or on 2g, the same rule as the page prefetch).
{
  const have = new Set();
  for (const [, html] of pagesOut) cssWords(html, have);
  for (const f of ["bot-page.js", "shelf-up.js"]) cssWords(fs.readFileSync(path.join(PUB, f), "utf8"), have);
  const css = pageCss(fs.readFileSync(path.join(PUB, "styles.css"), "utf8"), have);
  const warm = `<script>addEventListener("load",function(){var c=navigator.connection;if(c&&(c.saveData||/2g$/.test(c.effectiveType||"")))return;setTimeout(function(){var l=document.createElement("link");l.rel="prefetch";l.href=${JSON.stringify(versioned("/styles.css"))};document.head.appendChild(l)},1500)})</script>`;
  for (const [f, html] of pagesOut) fs.writeFileSync(f, html.replace(PAGE_CSS_MARK, () => `<style>${css}</style>\n${warm}`));
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
<p class="crawl-h">Jobs</p>
<nav aria-label="Find by job">
<a href="/category">Categories</a>
<a href="/collections">Find by job</a>
<a href="/stacks">Stacks</a>
${categories.map((c) => `<a href="/category/${esc(c.slug)}">${esc(c.name)}</a>`).join("\n")}
${jobCollections.map((c) => `<a href="/collection/${esc(c.slug)}">${esc(c.name)}</a>`).join("\n")}
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
const homeDesc = `${items.length} shared Grok Bot templates from ${handleCount(items)} creators. Search by category, app and what the bot does. Import in one tap.`;
{
  const site = { "@context": "https://schema.org", "@type": "WebSite", "@id": SITE + "/#website", name: "Grok Bot Shelf", url: SITE + "/", description: homeDesc,
    potentialAction: { "@type": "SearchAction", target: { "@type": "EntryPoint", urlTemplate: SITE + "/?q={search_term_string}" }, "query-input": "required name=search_term_string" },
    hasPart: [{ "@type": "CollectionPage", name: "Categories", url: `${SITE}/category` }, ...categories.map((c) => ({ "@type": "CollectionPage", name: c.name, url: `${SITE}/category/${c.slug}` })), { "@type": "CollectionPage", name: "Shelf stacks", url: `${SITE}/stacks` }, ...jobCollections.map((c) => ({ "@type": "CollectionPage", name: c.name, url: `${SITE}/collection/${c.slug}` }))] };
  const f = path.join(PUB, "index.html"), h = fs.readFileSync(f, "utf8");
  const n = h.replace(/<!-- ld:start -->[\s\S]*?<!-- ld:end -->/, `<!-- ld:start -->${ldScript(site)}<!-- ld:end -->`)
    .replace(/<!-- prefetch:start -->[\s\S]*?<!-- prefetch:end -->/, `<!-- prefetch:start --><script>${PREFETCH_JS}</script><!-- prefetch:end -->`);
  if (!n.includes("<!-- ld:end -->") || !n.includes("<!-- prefetch:end -->")) throw new Error("homepage is missing the ld or prefetch markers");
  if (n !== h) fs.writeFileSync(f, n);
}

// Homepage description and share title carry the live counts; twitter:site matches the bot and creator pages
{
  const f = path.join(PUB, "index.html"), h = fs.readFileSync(f, "utf8");
  const desc = homeDesc;
  const title = `Grok Bot Shelf: ${items.length} shared Grok Bot templates`;
  let n = h.replace(/(<meta (?:name="description"|property="og:description"|name="twitter:description") content=")[^"]*(">)/g, `$1${esc(desc)}$2`)
    .replace(/(<meta (?:property="og:title"|name="twitter:title") content=")[^"]*(">)/g, `$1${esc(title)}$2`)
    .replace(/<title>[^<]*<\/title>/, `<title>${esc(title)}</title>`);
  if (!n.includes('name="twitter:site"')) n = n.replace('<meta name="twitter:creator" content="@Phil_Holland">', '<meta name="twitter:site" content="@Phil_Holland">\n<meta name="twitter:creator" content="@Phil_Holland">');
  if ((n.match(new RegExp(`content="${esc(desc).replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}"`, "g")) || []).length !== 3 || !n.includes('name="twitter:site"')) throw new Error("homepage description/title meta tags not found");
  if (n !== h) fs.writeFileSync(f, n);
}

// /add: the "Add your bot" form on its own light page (no shelf, no shelf data until you type in the template field).
// The form is the #add section of public/index.html, so the two never drift; add.js runs it on both pages.
{
  const h = fs.readFileSync(path.join(PUB, "index.html"), "utf8");
  const sec = (h.match(/<section class="add" id="add"[\s\S]*?<\/section>/) || [""])[0]
    .replace('<h2 id="add-h">Add your bot</h2>\n    <p class="affil">Not affiliated with SpaceXSI.</p>\n', '<h1 id="add-h">Add your bot</h1>\n');
  if (!sec.includes('id="sub-form"')) throw new Error("index.html: the #add section with the form was not found");
  const dataURL = (h.match(/href="(\/shelf-data\.json\?v=[0-9a-f]+)"/) || [])[1] || "/shelf-data.json";
  const desc = "Suggest a Grok Bot template for the shelf: paste the template link, add your X post if you like, and it goes to review. Bots can POST /api/submit.";
  const ld = { "@context": "https://schema.org", "@type": "WebPage", name: "Add your bot", url: `${SITE}/add`, description: desc, isPartOf: { "@type": "WebSite", name: "Grok Bot Shelf", url: SITE } };
  const page = head({ title: "Add your bot · Grok Bot Shelf", desc, url: `${SITE}/add`, img: `${SITE}${versioned("/og.png")}`, ogTitle: "Add your bot to Grok Bot Shelf", alt: "Grok Bot Shelf", creator: "@Phil_Holland", ld })
    .replace("</head>", `<meta name="shelf-data" content="${dataURL}">\n<script src="/config.js" defer></script>\n<script src="${versioned("/add.js")}" defer></script>\n</head>`);
  fs.mkdirSync(path.join(PUB, "add"), { recursive: true });
  fs.writeFileSync(path.join(PUB, "add", "index.html"), `${page}
<body class="botpage addpage">
${siteHeader({ addCurrent: true })}
<main class="wrap bp" id="main">
  ${crumbsNav([["Grok Bot Shelf", "/"], ["Add your bot", ""]])}
  ${sec}
</main>
${footer()}
</body>
</html>
`);
}

// Shelf stacks: ordered install lists. Free public page, no paywall. Slugs must exist.
function loadStacks(data, list) {
  const by = new Map(list.map((b) => [b.slug, b]));
  const rows = Array.isArray(data && data.stacks) ? data.stacks : [];
  if (rows.length < 5 || rows.length > 9) throw new Error(`public/stacks.json: need 5 to 9 stacks (got ${rows.length})`);
  const seen = new Set();
  return rows.map((raw, i) => {
    const slug = String(raw.slug || "").trim();
    const title = String(raw.title || "").trim();
    const blurb = String(raw.blurb || "").trim();
    const icon = String(raw.icon || "").trim();
    const where = `stacks.json #${i + 1}${slug ? ` (${slug})` : ""}`;
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) throw new Error(`${where}: slug must be lowercase words separated by dashes`);
    if (seen.has(slug)) throw new Error(`${where}: duplicate slug`);
    seen.add(slug);
    if (!title || !blurb || !icon) throw new Error(`${where}: title, blurb, and icon are required`);
    const refs = Array.isArray(raw.bots) ? raw.bots : [];
    if (refs.length < 2 || refs.length > 6) throw new Error(`${where}: list 2 to 6 bots, in install order`);
    const members = [];
    const have = new Set();
    for (const ref of refs) {
      const b = by.get(String(ref || "").trim());
      if (!b) throw new Error(`${where}: unknown bot "${ref}"`);
      if (have.has(b.slug)) throw new Error(`${where}: duplicate bot ${b.slug}`);
      have.add(b.slug);
      members.push(b);
    }
    return { slug, title, blurb, icon, members };
  });
}
const stacks = loadStacks(read("stacks.json", null), items);
{
  const desc = "A few bots, in the order to add them.";
  const guide = indexGuide("stacks");
  const url = `${SITE}/stacks`;
  const faqs = stacksFaq(stacks);
  const stackOg = writeShares("stack", stacks.map((s) => ({ slug: s.slug, card: { kicker: "Stack", title: s.title, line: `${s.members.length} bots, in order` } })));
  const ld = { "@context": "https://schema.org", "@graph": [
    { "@type": "CollectionPage", "@id": url, url, name: "Shelf stacks", description: desc, isPartOf: { "@type": "WebSite", name: "Grok Bot Shelf", url: SITE + "/" },
      breadcrumb: { "@id": url + "#breadcrumb" },
      mainEntity: { "@type": "ItemList", name: "Shelf stacks", numberOfItems: stacks.length, itemListElement: stacks.map((s, i) => ({
        "@type": "ListItem", position: i + 1, name: s.title, url: `${url}#${s.slug}`,
        item: botItems(s.title, s.members, catsOf(s.members).join(", ")),
      })) } },
    faqLd(url, faqs),
    { "@id": url + "#breadcrumb", ...crumbs([["Grok Bot Shelf", SITE + "/"], ["Stacks", url]]) },
  ] };
  const cards = stacks.map((s) => {
    const cats = catsOf(s.members).map((name) => `<a href="${catPath(name)}">${esc(name)}</a>`).join(" · ");
    return `<li id="${esc(s.slug)}"><article class="stack">
    <div class="bp-head"><div class="icon big" aria-hidden="true">${lucide(s.icon)}</div><div>
      <h2>${esc(s.title)}</h2>
      <p class="stack-meta">${s.members.length} bots, in order${cats ? ` · ${cats}` : ""}</p>
    </div></div>
    ${guideHtml(stackGuide(s))}
    <ol class="stack-steps">${s.members.map((b, i) => `<li><a href="${b.page}"><span class="sn">${i + 1}</span><span class="st"><span class="nm">${markSpan(b.emoji)}${esc(b.name)}</span><small>${esc(b.description)}</small></span></a></li>`).join("")}</ol>
  </article></li>`;
  }).join("");
  writeJob("stacks/index.html", `${head({ title: "Shelf stacks · Grok Bot Shelf", desc, url, img: stackOg.get(stacks[0].slug), ogTitle: "Shelf stacks", alt: "Ordered install stacks on Grok Bot Shelf", creator: "@Phil_Holland", ld })}
<body class="botpage stackspage">
${siteHeader({ job: `<a href="/collections">Find by job</a><span aria-hidden="true"> · </span><a href="/stacks" aria-current="page">Stacks</a>` })}
<main class="wrap bp" id="main">
  ${crumbsNav([["Grok Bot Shelf", "/"], ["Stacks", ""]])}
  <article class="bp-card page-intro">
    <h1>Shelf stacks</h1>
    <p class="job-lead">${esc(desc)}</p>
    ${guideHtml(guide)}
  </article>
  <ol class="stack-index">${cards}</ol>
  ${faqHtml(faqs)}
</main>
${footer()}
</body>
</html>
`);
}
// sitemap.xml
const lastmod = (d) => (/^\d{4}-\d{2}-\d{2}$/.test(d || "") ? d : today);
const newest = items.reduce((m, b) => (b.added > m ? b.added : m), "");
fs.writeFileSync(path.join(PUB, "sitemap.xml"), `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url><loc>${SITE}/</loc><lastmod>${lastmod(newest)}</lastmod><changefreq>daily</changefreq><priority>1.0</priority></url>
${items.map((b) => `  <url><loc>${SITE}${b.page}</loc><lastmod>${lastmod(b.added)}</lastmod></url>`).join("\n")}
  <url><loc>${SITE}/add</loc><lastmod>${lastmod(newest)}</lastmod></url>
${jobCollections.length ? `  <url><loc>${SITE}/collections</loc><lastmod>${lastmod(newest)}</lastmod></url>\n` : ""}  <url><loc>${SITE}/stacks</loc><lastmod>${lastmod(newest)}</lastmod></url>
  <url><loc>${SITE}/category</loc><lastmod>${lastmod(newest)}</lastmod></url>
${categories.map((c) => `  <url><loc>${SITE}/category/${c.slug}</loc><lastmod>${lastmod(c.members.reduce((m, b) => (b.added > m ? b.added : m), ""))}</lastmod></url>`).join("\n")}
${jobCollections.map((c) => `  <url><loc>${SITE}/collection/${c.slug}</loc><lastmod>${lastmod(c.members.reduce((m, b) => (b.added > m ? b.added : m), ""))}</lastmod></url>`).join("\n")}
${creatorList.map((c) => `  <url><loc>${SITE}${c.page}</loc><lastmod>${lastmod(c.bots.reduce((m, b) => (b.added > m ? b.added : m), ""))}</lastmod></url>`).join("\n")}
</urlset>
`);

// robots.txt
fs.writeFileSync(path.join(PUB, "robots.txt"), `User-agent: *\nAllow: /\nDisallow: /api/\nDisallow: /lab/\n\nSitemap: ${SITE}/sitemap.xml\n`);

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
- [products.json](${SITE}/products.json): Amazon gear catalog. Links use tag botshelf-20. Match rules are specific phrases only; category does not attach a product.
- [pairs.json](${SITE}/pairs.json): one "Pairs with" row per bot slug, 0–3 product ids with score 4 or 5 and a short reason. Empty is normal. At most 3. Shown on the bot page and, when a row exists, as a short chip on homepage, creator, and job-hub cards. A new auto product id is marked probation until it is promoted. Run node scripts/pairs-gen.js when a bot is added. Add --backfill after products.json changes. The build fails if a slug is missing. Curated rows (no auto flag) are never rewritten.
- [pairs-overrides.json](${SITE}/pairs-overrides.json): pin, block, none, or promote per slug. Overrides win. promote lifts probation. Bot Tools defaults to none.
- [pair-signals.json](${SITE}/pair-signals.json): real pair_click counts (bot slug, then product id). A probation row leaves probation at min clicks (default 3). Do not invent counts.
- [bot-meta.json](${SITE}/bot-meta.json): optional badges keyed by template id (the part after x.ai/bot/). agency is reads, drafts or acts; works_with lists apps the bot's description names; collections lists the shelf collections a bot is in (e.g. Family). Set by the shelf; missing means unknown.
- [social.json](${SITE}/social.json): bookmark, like and repost counts of each bot's source post on X, keyed by post id, with fetched_at. These are X counts, not ratings.
- [Search API](${SITE}/api/search?q=email): GET /api/search?q=&category=&creator=&limit= (1 to 100). CORS open.
- [sitemap.xml](${SITE}/sitemap.xml): every bot page and creator page.
- [feed.xml](${SITE}/feed.xml): RSS of the 50 newest bots.

## Pages

- One page per bot at ${SITE}/bot/<slug>, where slug is the bot name in lowercase with dashes (for example ${SITE}${items[0] ? items[0].page : "/bot/archivist"}).
- Creator pages at ${SITE}/@<handle>. The creator count in the homepage description is unique X handles, one per creator page.
- Category pages at ${SITE}/category/<slug> (index: ${SITE}/category). The home shelf still filters with ?cat=. Link the category page when you want a crawlable landing.
- Find by job: ${SITE}/collections and one page per hub at ${SITE}/collection/<slug> (for example ${SITE}/collection/${jobCollections[0] ? jobCollections[0].slug : "deal-hunting"}). Hubs are curated lists in collections.json. They do not remove bots. Each hub links its bots, their creators, and the other jobs. "Start here" is the editors' picks until a usage feed exists. See scripts/collections.js.
- Shelf stacks: ${SITE}/stacks. Ordered install lists from stacks.json. Free and public. Each bot still has its own page.
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
- Humans: form at ${SITE}/add (template link, optional X post, optional note), or tag @Phil_Holland or @thecsguy on X.

\`\`\`
curl -X POST ${SITE}/api/submit \\
  -H 'Content-Type: application/json' \\
  -d '{"bot_url":"https://x.ai/bot/<id>","post_url":"https://x.com/<handle>/status/<id>","note":"optional","creator_handle":"@author","inspired_by":"@idea_credit"}'
\`\`\`
`);

{ // Share cards come from scripts/og.js by hand, not from this build; say which bots still need one so it is not missed
  const noCard = items.filter((b) => !fs.existsSync(path.join(PUB, "og", "bot", b.slug + ".png"))).map((b) => b.slug);
  if (noCard.length) console.warn(`share cards missing for ${noCard.length} bot${noCard.length === 1 ? "" : "s"} (${noCard.join(", ")}): run node scripts/og.js, then build again`);
}
console.log(`built ${items.length} bot pages, ${creatorList.length} creator pages, ${categories.length} categories, ${jobCollections.length} job collections, ${stacks.length} stacks, sitemap, robots, feed (${recent.length}), llms.txt`);
