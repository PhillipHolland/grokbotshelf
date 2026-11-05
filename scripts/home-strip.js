// The home page's first screen, drawn at build time: the "From the builders" strip, the (empty until tallies load) Top
// voted shell and the "New this week" list go into #results in public/index.html, so a phone paints them with the HTML
// instead of after shelf-data.json and app.js (that card was the mobile LCP, at 2.3 s). The markup is app.js's own,
// mirrored here function for function: card(), buildersHTML(), newHTML(). app.js keeps a server-drawn section only
// when it equals what it would draw itself (isEqualNode) and swaps in its own otherwise, so a change on one side
// without the other costs the pre-render, never shows stale markup. test/prerender.js checks the two agree.
// Input is the shelf-data.json bot list (the same objects app.js loads), window.BUILDERS from public/config.js, and
// the build date for the 7-day window. Output is one HTML string.
const { fold, slugify, appLink } = require("./shelf");
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const SITE = "https://grokbotshelf.com";
const AGENCY = { acts: "Takes actions", drafts: "Drafts for you", reads: "Reads only" };
const AGENCY_TIP = { acts: "Can take actions, usually after your OK", drafts: "Prepares things for you to send or approve", reads: "Looks things up and reports back" };
const ckey = (b) => b.creator_handle ? b.creator_handle.replace(/^@/, "").toLowerCase() : "~" + slugify(b.creator_name);
const profilePath = (key) => "/@" + key;
const icon = (n, cls) => `<svg${cls ? ` class="${cls}"` : ""} viewBox="0 0 24 24" aria-hidden="true"><use href="#i-${n}"/></svg>`;
const I = { share: icon("share"), copy: icon("copy"), code: icon("code"), up: icon("up"), down: icon("down"), app: icon("app"), bm: icon("bm"), x: icon("x", "fill") };
const li = (name) => name ? `<svg class="li" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><use href="#li-${esc(name)}"/></svg>` : "";
const mark = (b) => li(b.mark || "bot");
// app.js decorates each loaded bot the same way (loadShelf)
const decorate = (bots) => bots.map((b, i) => ({ ...b, _i: i, _slug: "bot-" + slugify(b.name), _page: "/bot/" + slugify(b.name), _app: appLink(b.url), _meta: b.meta || null, _social: b.social || null, _colls: b.collections || [] }));
function shareX(b) {
  const T = encodeURIComponent(`Check out ${fold(b.name).endsWith(fold(" by " + b.creator_name)) ? b.name : `${b.name} by ${b.creator_handle || b.creator_name}`} on Grok Bot Shelf\n${SITE}${b._page}`);
  return { web: "https://twitter.com/intent/tweet?text=" + T };
}
function badgesHTML(b) {
  const m = b._meta || {}, coll = b._colls.map((c) => `<span class="badge coll" title="In the shelf's ${esc(c)} collection">${esc(c)}</span>`);
  const out = coll.concat(m.agency && AGENCY[m.agency] ? [`<span class="badge ag-${m.agency}" title="${esc(AGENCY_TIP[m.agency])}">${AGENCY[m.agency]}</span>`] : [])
    .concat((m.works_with || []).map((w) => `<span class="badge">${esc(w)}</span>`));
  return `<div class="badges"${out.length ? ` title="Set by the shelf from the bot's description"` : ""}>${out.join("")}</div>`;
}
function pairsHTML(b, surface) {
  const rows = b.pairs;
  if (!rows || !rows.length) return "";
  const attr = `data-surface="${surface}"`;
  const extra = b.pairsMore || 0;
  const links = rows.map((p, i) => {
    const href = `https://www.amazon.com/dp/${encodeURIComponent(p.asin)}?tag=botshelf-20`;
    const soft = p.soft ? ` data-soft=""` : "";
    return `<a class="pair pair-mini" href="${esc(href)}" rel="noopener sponsored" target="_blank" data-product="${esc(p.id)}" data-position="${i + 1}" data-bot="${esc(b._page.slice(5))}" ${attr}${soft}>${li(p.icon)} ${esc(p.name)}</a>`;
  }).join("");
  const more = extra ? `<a class="pair-more" href="${esc(b._page)}#pairs-h">+${extra}</a>` : "";
  return `<p class="card-pairs"><span class="card-pairs-l">Pairs with</span>${links}${more}</p>`;
}
// No tally at build time: the shared count is 0 and the tip says the vote stays in this browser, as app.js draws
// before /api/votes answers. paintVoteEl brings an adopted card up to date before app.js compares.
function voteHTML(b) {
  const nm = esc(b.name);
  return `<span class="vote" data-vote="${b._slug}" data-tip="Saved in this browser"><button type="button" class="ib vb up" data-v="1" aria-pressed="false" aria-label="Upvote ${nm}">${I.up}</button><span class="vn">0</span><span class="sr vsr"> votes</span><button type="button" class="ib vb dn" data-v="-1" aria-pressed="false" aria-label="Downvote ${nm}">${I.down}</button></span>`;
}
function card(b, pre, surface) {
  const id = (pre || "") + b._slug;
  const nb = b._social && b._social.bookmarks, bw = nb === 1 ? "bookmark" : "bookmarks";
  const bk = nb ? `<span class="dot" aria-hidden="true">·</span><span class="bm" title="${nb} ${bw} on the original X post (not a rating)">${I.bm}${nb.toLocaleString("en-US")}<span class="sr"> ${bw} on X</span></span>` : "";
  const av = b.avatar_sm || b.creator_avatar;
  return `<article class="card" id="${id}" tabindex="-1" data-url="${esc(b.url)}" aria-labelledby="${id}-t">
<div class="head"><div class="icon" aria-hidden="true">${mark(b)}</div><div class="ttl">
<h3 id="${id}-t"><a href="${b._page}">${esc(b.name)}</a></h3>
<div class="sub"><a class="catlink" href="/category/${esc(slugify(b.category))}">${esc(b.category)}</a><span class="dot" aria-hidden="true">·</span>${av ? `<img src="${esc(av)}" alt="" width="16" height="16" loading="lazy" decoding="async">` : ""}${b.creator_handle ? `<a class="cn" href="${profilePath(ckey(b))}">${esc(b.creator_name)}</a>` : `<span class="cn">${esc(b.creator_name)}</span>`}${bk}</div>
</div></div>
<p class="desc">${esc(b.description)}</p>
${badgesHTML(b)}
<div class="foot-row"><div class="tools">
${voteHTML(b)}
<button type="button" class="ib" data-copy="${esc(b.url)}" aria-label="Copy link to ${esc(b.name)}" title="Copy link">${I.copy}</button>
<a class="ib" href="${esc(shareX(b).web)}" data-sharex="${b._slug}" rel="noopener" target="_blank" aria-label="Share ${esc(b.name)} on X" title="Share ${esc(b.name)} on X">${I.share}</a>
${b.source_post ? `<a class="ib" href="${esc(b.source_post)}" rel="noopener" target="_blank" aria-label="${esc(b.name)}: original post on X" title="Original post on X">${I.x}</a>` : ""}
${b.code_url ? `<a class="ib" href="${esc(b.code_url)}" rel="noopener" target="_blank" aria-label="${esc(b.name)}: source code" title="Source code">${I.code}</a>` : ""}
${b.source_post || b.code_url ? "" : '<span class="ib slot" aria-hidden="true"></span>'}
</div><div class="gets">${b._app ? `<a class="app" href="${esc(b._app)}" data-app="${b._slug}" aria-label="Add to Bot app: ${esc(b.name)}" title="Add to Bot app (opens the Grok Bot app if installed)">${I.app}<span class="t">Add to Bot app</span></a>` : ""}<a class="get" href="${esc(b.url)}" rel="noopener" target="_blank" aria-label="Get this bot: ${esc(b.name)} on x.ai">Get this bot</a></div></div>
${pairsHTML(b, surface)}
</article>`;
}
// Creators as app.js sees them: the first bot in shelf order names the creator's page link, avatar and label
function creatorsOf(bots) {
  const seen = new Map();
  for (const b of bots) if (!seen.has(ckey(b))) seen.set(ckey(b), { key: ckey(b), url: b.creator_url, sm: b.avatar_sm || b.creator_avatar, label: b.creator_name });
  return seen;
}
function buildersHTML(bots, cfg) {
  const names = (cfg && cfg.feature) || [], creators = creatorsOf(bots);
  const picks = names.map((n) => bots.find((b) => b.name === n)).filter(Boolean);
  if (!picks.length) return "";
  const people = ((cfg && cfg.handles) || []).map((h) => {
    const k = h.replace(/^@/, "").toLowerCase(), c = creators.get(k);
    const u = c ? c.url : "https://x.com/" + h.replace(/^@/, "");
    const n = c ? bots.filter((b) => ckey(b) === k).length : 0;
    const av = c && c.sm ? `<img src="${esc(c.sm)}" alt="" width="24" height="24" loading="lazy" decoding="async">` : "";
    return `<span class="who">${av}<a class="h" href="${esc(u)}" rel="noopener" target="_blank">${esc(h)}</a>` + (c ? `<a class="all" href="${esc(profilePath(c.key))}" aria-label="All ${n} bots by ${esc(c.label)}">All ${n} bots</a>` : "") + "</span>";
  }).join("");
  return `<section class="builders" aria-labelledby="builders-h"><div class="bhead"><h2 id="builders-h">From the builders</h2><p class="bsub">${people}</p></div>
<div class="grid">${picks.map((b) => card(b, "f-", "builders")).join("")}</div></section>`;
}
// Top voted: the shell app.js keeps hidden until /api/votes answers (there is no tally at build time)
const TOP_SHELL = `<section class="topvotes" aria-labelledby="topv-h" hidden></section>`;
const NEW_N = 6;
const fmtDay = (d) => new Date(d + "T12:00:00Z").toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
const weekAgo = (now) => { const d = new Date(now.getTime() - 6 * 864e5); return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0"); };
function newHTML(bots, now) {
  const wk = weekAgo(now), recent = bots.filter((b) => b.added >= wk).sort((a, b) => b.added.localeCompare(a.added) || b._i - a._i);
  if (!recent.length) return "";
  const per = {}, picks = [];
  for (const b of recent) { const k = ckey(b); if ((per[k] = (per[k] || 0) + 1) > 2) continue; picks.push(b); if (picks.length === NEW_N) break; }
  const all = recent.length === bots.length, h = all ? "Just added" : "New this week";
  return `<section class="topvotes newv" aria-labelledby="newv-h"><div class="thead"><h2 id="newv-h">${h}</h2><a class="tall" href="/?sort=newest${all ? "" : "&amp;new=1"}">See all ${recent.length.toLocaleString("en-US")}</a></div>
<ol class="tlist">${picks.map((b) => `<li><a href="${b._page}" title="Added ${esc(fmtDay(b.added))}"><span class="em" aria-hidden="true">${mark(b)}</span><span class="nm">${esc(b.name)}<small>${esc(b.creator_name)}</small></span><span class="sc dt">${esc(fmtDay(b.added))}<span class="sr"> added</span></span></a></li>`).join("")}</ol></section>`;
}
function homeStrip({ bots, builders, now = new Date() }) {
  const list = decorate(bots);
  const strip = buildersHTML(list, builders);
  const html = strip ? strip + TOP_SHELL + newHTML(list, now) : "";
  return { html, cards: strip ? (strip.match(/<article class="card"/g) || []).length : 0, pairs: html.includes('class="card-pairs"') };
}
module.exports = { homeStrip };
