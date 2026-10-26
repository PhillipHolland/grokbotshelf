(() => {
  "use strict";
  const $ = (s) => document.querySelector(s);
  const q = $("#q"), sortEl = $("#sort"), results = $("#results"), creatorEl = $("#creators"), catsEl = $("#cats");
  const appsEl = $("#apps"), agencyEl = $("#agency"), freshEl = $("#fresh"), oneEl = $("#onejob");
  const SORTS = ["featured", "newest", "bookmarks", "votes", "az", "creator"];
  const AGENCY = { acts: "Takes actions", drafts: "Drafts for you", reads: "Reads only" };
  const AGENCY_TIP = { acts: "Can take actions, usually after your OK", drafts: "Prepares things for you to send or approve", reads: "Looks things up and reports back" };
  let bots = [], creators = [], cats = [], apps = [], st = blank(), active = -1;

  function blank() { return { q: "", creator: "", cats: [], sort: "featured", app: "", agency: "", fresh: false, oneJob: false, more: [] }; }
  // Unfiltered grouped views show the first few cards per creator plus a "Show N more" button; expanded groups are
  // kept in ?more=a,b. Featured (the home view) keeps it to one desktop row so the A-Z rail and scrolling stay quick;
  // Creator sort is for browsing whole catalogs, so it keeps 12 (as before). Small leftovers are shown rather than
  // hidden behind "Show 1 more". Search and filters always show every match.
  const GROUP_CAP = { featured: 3, creator: 12 }, GROUP_SLACK = { featured: 1, creator: 3 };
  let capNow = Infinity;
  const filtering = () => !!(st.creator || st.cats.length || st.app || st.agency || st.fresh || st.oneJob);
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
  const fold = (s) => String(s).toLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g, "");
  const slug = (s) => fold(s).replace(/&/g, " and ").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  const ckey = (b) => b.creator_handle.replace(/^@/, "").toLowerCase();

  // Launch post link lives in config.js. Plain text until it is set.
  const launch = (window.LAUNCH_POST_URL || "").trim();
  if (/^https:\/\//.test(launch)) $("#launch").outerHTML = '<a href="' + esc(launch) + '" rel="noopener" target="_blank">launch post</a>';

  /* ---------- Theme toggle: dark by default, choice kept in localStorage ---------- */
  const root = document.documentElement, themeBtn = $("#theme");
  function applyTheme(t) {
    root.setAttribute("data-theme", t);
    document.querySelector('meta[name="theme-color"]').content = t === "light" ? "#ffffff" : "#000000";
    document.querySelector('meta[name="color-scheme"]').content = t;
    themeBtn.setAttribute("aria-pressed", String(t === "dark"));
  }
  applyTheme(root.getAttribute("data-theme") === "light" ? "light" : "dark");
  themeBtn.addEventListener("click", () => {
    const next = root.getAttribute("data-theme") === "light" ? "dark" : "light";
    if (!matchMedia("(prefers-reduced-motion: reduce)").matches) { root.classList.add("theme-anim"); setTimeout(() => root.classList.remove("theme-anim"), 250); }
    applyTheme(next);
    try { localStorage.setItem("theme", next); } catch {}
  });

  /* ---------- Fuzzy search ---------- */
  // Optimal string alignment distance, capped at max+1.
  function dist(a, b, max) {
    if (Math.abs(a.length - b.length) > max) return max + 1;
    let p2 = null, p = Array.from({ length: b.length + 1 }, (_, i) => i);
    for (let i = 1; i <= a.length; i++) {
      const c = [i]; let lo = i;
      for (let j = 1; j <= b.length; j++) {
        let v = Math.min(p[j] + 1, c[j - 1] + 1, p[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
        if (p2 && i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) v = Math.min(v, p2[j - 2] + 1);
        c[j] = v; if (v < lo) lo = v;
      }
      if (lo > max) return max + 1;
      p2 = p; p = c;
    }
    return p[b.length];
  }
  // Score one query token against one field. Returns [score, [start, end]] or null.
  function tokenIn(tok, text, isName) {
    const i = text.indexOf(tok);
    if (i >= 0) return [12 + (i === 0 || /[^a-z0-9]/.test(text[i - 1]) ? 6 : 0) + (isName && i === 0 ? 4 : 0), [i, i + tok.length]];
    if (tok.length < 4) return null;
    const max = tok.length >= 7 ? 2 : 1;
    let best = null;
    for (const m of text.matchAll(/[a-z0-9]+/g)) {
      const w = m[0];
      const d = Math.min(dist(tok, w, max), w.length > tok.length ? dist(tok, w.slice(0, tok.length), max) : max + 1);
      if (d <= max && (!best || 8 - d * 3 > best[0])) best = [8 - d * 3, [m.index, m.index + w.length]];
    }
    if (best || !isName) return best;
    let k = 0, start = -1; // subsequence fallback on names only
    for (let j = 0; j < text.length && k < tok.length; j++) if (text[j] === tok[k]) { if (start < 0) start = j; k++; }
    return k === tok.length ? [2, [start, start + 1]] : null;
  }
  const FIELDS = [["name", 3], ["category", 1.6], ["creator", 1.3], ["description", 1]];
  function match(b, toks) {
    let total = 0; const hits = { name: [], description: [] };
    for (const t of toks) {
      let best = 0, bestF = null, bestR = null;
      for (const [f, w] of FIELDS) {
        const r = tokenIn(t, b._f[f], f === "name");
        if (r && r[0] * w > best) { best = r[0] * w; bestF = f; bestR = r[1]; }
      }
      if (!best) return null;
      total += best;
      if (hits[bestF]) hits[bestF].push(bestR);
    }
    return { score: total, hits };
  }
  function hl(text, ranges) {
    if (!ranges || !ranges.length) return esc(text);
    const rs = ranges.slice().sort((a, b) => a[0] - b[0]); let out = "", pos = 0;
    for (const [s, e] of rs) { if (e <= pos) continue; const a = Math.max(s, pos); out += esc(text.slice(pos, a)) + "<mark>" + esc(text.slice(a, e)) + "</mark>"; pos = e; }
    return out + esc(text.slice(pos));
  }

  /* ---------- URL state ---------- */
  // Creator profile links: /@handle and /u/handle (any case), plus legacy ?creator=handle.
  const pathCreator = () => { const m = location.pathname.match(/^\/(?:@|%40|u\/)([A-Za-z0-9_]+)\/?$/i); return m ? m[1].toLowerCase() : ""; };
  const SITE = "https://grokbotshelf.com";
  const profilePath = (key) => "/@" + key; // creator pages live at the lowercase handle
  const BASE_TITLE = document.title;
  function setTitle() {
    const c = st.creator && creators.find((x) => x.key === st.creator);
    document.title = c ? `${c.label} · Grok Bot Shelf` : BASE_TITLE;
    const canon = document.querySelector('link[rel="canonical"]'); if (canon) canon.href = SITE + (c ? profilePath(c.key) : "/");
  }
  function readURL() {
    const p = new URLSearchParams(location.search), s = blank();
    s.q = p.get("q") || "";
    const c = (pathCreator() || p.get("creator") || "").toLowerCase(); s.creator = creators.some((x) => x.key === c) ? c : "";
    s.cats = (p.get("cat") || "").split(",").map((x) => cats.find((c) => slug(c) === slug(x))).filter(Boolean);
    const so = p.get("sort"); s.sort = SORTS.includes(so) ? so : "featured";
    const ap = p.get("app"); s.app = ap && apps.some((a) => a.key === ap) ? ap : "";
    const ag = p.get("does"); s.agency = AGENCY[ag] ? ag : "";
    s.fresh = p.get("new") === "1";
    s.oneJob = p.get("one_job") === "1";
    s.more = (p.get("more") || "").toLowerCase().split(",").filter((k, i, a) => k && a.indexOf(k) === i && creators.some((c) => c.key === k));
    return s;
  }
  // Unknown /@handle (served the home page by the catch-all rewrite): say so, and keep it out of search results
  let notFound = null;
  function showNotFound(h) {
    const m = document.createElement("meta"); m.name = "robots"; m.content = "noindex"; document.head.append(m);
    notFound = document.createElement("div"); notFound.className = "empty notfound"; notFound.setAttribute("role", "status");
    notFound.innerHTML = `<p class="empty-t">Creator not found</p><p class="empty-s">No bots by @${esc(h)} are on the shelf. Pick a creator above, or browse every bot below.</p>`;
    notFound._meta = m; results.before(notFound);
    document.title = "Creator not found · Grok Bot Shelf";
  }
  function writeURL(push) {
    const p = new URLSearchParams();
    if (st.q) p.set("q", st.q);
    if (st.cats.length) p.set("cat", st.cats.map(slug).join(","));
    if (st.app) p.set("app", st.app);
    if (st.agency) p.set("does", st.agency);
    if (st.fresh) p.set("new", "1");
    if (st.oneJob) p.set("one_job", "1");
    if (st.sort !== "featured") p.set("sort", st.sort);
    if (st.more.length) p.set("more", st.more.join(","));
    const url = (st.creator ? profilePath(st.creator) : "/") + (p.toString() ? "?" + p.toString().replace(/%2C/g, ",") : "") + location.hash;
    if (url !== location.pathname + location.search + location.hash) history[push ? "pushState" : "replaceState"](null, "", url);
    if (notFound) { notFound._meta.remove(); notFound.remove(); notFound = null; }
  }

  /* ---------- Rendering ---------- */
  // Card icons: one hidden SVG sprite in index.html (#i-<name>); each card only carries a <use> reference
  const icon = (n, cls) => `<svg${cls ? ` class="${cls}"` : ""} viewBox="0 0 24 24" aria-hidden="true"><use href="#i-${n}"/></svg>`;
  const I = {
    share: icon("share"),
    copy: icon("copy"),
    code: icon("code"),
    up: icon("up"),
    down: icon("down"),
    app: icon("app"),
    bm: icon("bm"),
    x: icon("x", "fill"),
  };
  // Share a bot on X: web intent everywhere; native app first on mobile (same pattern as #post-x)
  const MOBILE = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  function shareX(b) {
    const T = encodeURIComponent(`Check out ${b.name} by ${b.creator_handle} on Grok Bot Shelf\n${SITE}${b._page}`);
    return { web: "https://twitter.com/intent/tweet?text=" + T, app: "twitter://post?message=" + T };
  }
  function openShareX(u) {
    const t = setTimeout(() => { if (document.visibilityState === "visible") window.location.href = u.web; }, 1200);
    document.addEventListener("visibilitychange", function h() {
      if (document.visibilityState === "hidden") { clearTimeout(t); document.removeEventListener("visibilitychange", h); }
    });
    window.location.href = u.app;
  }
  // Add to Bot app: grokbot:// deep link; on phones fall back to x.ai if the app does not open
  function openApp(deep, web) {
    const t = setTimeout(() => { if (document.visibilityState === "visible") window.location.href = web; }, 1500);
    document.addEventListener("visibilitychange", function h() {
      if (document.visibilityState === "hidden") { clearTimeout(t); document.removeEventListener("visibilitychange", h); }
    });
    window.location.href = deep;
  }
  function badgesHTML(b) {
    const m = b._meta; if (!m) return "";
    const out = (m.agency && AGENCY[m.agency] ? [`<span class="badge ag-${m.agency}" title="${esc(AGENCY_TIP[m.agency])}">${AGENCY[m.agency]}</span>`] : [])
      .concat((m.works_with || []).map((w) => `<span class="badge">${esc(w)}</span>`));
    return out.length ? `<div class="badges" title="Set by the shelf from the bot's description">${out.join("")}</div>` : "";
  }
  function card(b, m, pre) {
    const h = m ? m.hits : {}, id = (pre || "") + b._slug;
    const bk = b._social && b._social.bookmarks ? `<span class="dot" aria-hidden="true">·</span><span class="bm" title="${b._social.bookmarks} bookmarks on the original X post (not a rating)">${I.bm}${b._social.bookmarks.toLocaleString("en-US")}<span class="sr"> bookmarks on X</span></span>` : "";
    return `<article class="card" id="${id}" tabindex="-1" data-url="${esc(b.url)}" aria-labelledby="${id}-t">
<div class="head"><div class="icon" aria-hidden="true">${esc(b.emoji)}</div><div class="ttl">
<h3 id="${id}-t"><a href="${b._page}">${hl(b.name, h.name)}</a></h3>
<div class="sub"><span>${esc(b.category)}</span><span class="dot" aria-hidden="true">·</span><img src="${esc(b.avatar_sm || b.creator_avatar)}" alt="" width="16" height="16" loading="lazy" decoding="async"><span>${esc(b.creator_name)}</span>${bk}</div>
</div></div>
<p class="desc">${hl(b.description, h.description)}</p>
${badgesHTML(b)}
<div class="foot-row"><div class="tools">
${voteHTML(b)}
<button type="button" class="ib" data-copy="${esc(b.url)}" aria-label="Copy link to ${esc(b.name)}" title="Copy link">${I.copy}</button>
<a class="ib" href="${esc(shareX(b).web)}" data-sharex="${b._slug}" rel="noopener" target="_blank" aria-label="Share ${esc(b.name)} on X" title="Share ${esc(b.name)} on X">${I.share}</a>
${b.source_post ? `<a class="ib" href="${esc(b.source_post)}" rel="noopener" target="_blank" aria-label="${esc(b.name)}: original post on X" title="Original post on X">${I.x}</a>` : ""}
${b.code_url ? `<a class="ib" href="${esc(b.code_url)}" rel="noopener" target="_blank" aria-label="${esc(b.name)}: source code" title="Source code">${I.code}</a>` : ""}
</div><div class="gets">${b._app ? `<a class="app" href="${esc(b._app)}" data-app="${b._slug}" aria-label="Add to Bot app: ${esc(b.name)}" title="Add to Bot app (opens the Grok Bot app if installed)">${I.app}<span class="t">Add to Bot app</span></a>` : ""}<a class="get" href="${esc(b.url)}" rel="noopener" target="_blank" aria-label="Get this bot: ${esc(b.name)} on x.ai">Get this bot</a></div></div>
</article>`;
  }
  /* ---------- From the builders strip (home Featured view only) ---------- */
  function buildersHTML() {
    const cfg = window.BUILDERS || {}, names = cfg.feature || [];
    const picks = names.map((n) => bots.find((b) => b.name === n)).filter(Boolean);
    if (!picks.length) return "";
    const people = (cfg.handles || []).map((h) => {
      const k = h.replace(/^@/, "").toLowerCase(), c = creators.find((x) => x.key === k);
      const u = c ? c.url : "https://x.com/" + h.replace(/^@/, "");
      const n = c ? bots.filter((b) => ckey(b) === k).length : 0;
      const av = c && c.sm ? `<img src="${esc(c.sm)}" alt="" width="24" height="24" loading="lazy" decoding="async">` : "";
      return `<span class="who">${av}<a class="h" href="${esc(u)}" rel="noopener" target="_blank">${esc(h)}</a>` + (c ? `<a class="all" href="${esc(profilePath(c.key))}" aria-label="All ${n} bots by ${esc(c.label)}">All ${n} bots →</a>` : "") + "</span>";
    }).join("");
    return `<section class="builders" aria-labelledby="builders-h"><div class="bhead"><h2 id="builders-h">From the builders</h2><p class="bsub">${people}</p></div>
<div class="grid">${picks.map((b) => card(b, null, "f-")).join("")}</div></section>`;
  }

  /* ---------- Top voted strip (home Featured view, right under the builders panel) ---------- */
  // Lighter than the builders panel on purpose: no tint, smaller heading. Fills in once tallies load.
  const TOP_N = 6;
  function topInner() {
    if (!vote.global) return "";
    const top = bots.map((b) => [b, vote.scores[b._slug]]).filter(([, s]) => s && s.score > 0)
      .sort((a, b) => b[1].score - a[1].score || b[1].up - a[1].up || a[0].name.localeCompare(b[0].name)).slice(0, TOP_N);
    if (!top.length) return "";
    return `<div class="thead"><h2 id="topv-h">Top voted</h2><a class="tall" href="/?sort=votes" data-sortvotes>See all by votes →</a></div>
<ol class="tlist">${top.map(([b, s], i) => `<li><a href="${b._page}" title="${s.up} up, ${s.down} down"><span class="rk">${i + 1}</span><span class="em" aria-hidden="true">${esc(b.emoji)}</span><span class="nm">${esc(b.name)}<small>${esc(b.creator_name)}</small></span><span class="sc">${I.up}${s.score}<span class="sr"> net votes</span></span></a></li>`).join("")}</ol>`;
  }
  const topHTML = () => { const inner = topInner(); return `<section class="topvotes" aria-labelledby="topv-h"${inner ? "" : " hidden"}>${inner}</section>`; };
  function paintTop() {
    const el = results.querySelector(".topvotes"); if (!el) return;
    const inner = topInner(); el.innerHTML = inner; el.hidden = !inner;
  }

  /* ---------- Up / down votes ---------- */
  // Server (Neon via /api/votes) is the source of truth for tallies. localStorage remembers which way
  // you voted so arrows paint instantly. With no database configured, votes stay in this browser only.
  const VKEY = "gbs_votes";
  const vote = { global: false, scores: {}, mine: {} };
  try { vote.mine = JSON.parse(localStorage.getItem(VKEY) || "{}") || {}; } catch {}
  const saveMine = () => { try { localStorage.setItem(VKEY, JSON.stringify(vote.mine)); } catch {} };
  function voteBits(slug) {
    const v = vote.mine[slug] || 0, s = vote.scores[slug];
    const n = vote.global && s && s.up + s.down ? s.score : "";
    const title = !vote.global ? "Your vote is saved in this browser" : s && s.up + s.down ? `${s.up} up, ${s.down} down` : "No votes yet";
    return { v, n, title };
  }
  function voteHTML(b) {
    const { v, n, title } = voteBits(b._slug), nm = esc(b.name);
    return `<span class="vote" data-vote="${b._slug}" title="${esc(title)}"><button type="button" class="ib vb up" data-v="1" aria-pressed="${v === 1}" aria-label="Upvote ${nm}">${I.up}</button><span class="vn" aria-live="polite">${n}</span><button type="button" class="ib vb dn" data-v="-1" aria-pressed="${v === -1}" aria-label="Downvote ${nm}">${I.down}</button></span>`;
  }
  function paintVote(slug) {
    const { v, n, title } = voteBits(slug);
    results.querySelectorAll(`.vote[data-vote="${slug}"]`).forEach((el) => {
      el.title = title;
      el.querySelector(".up").setAttribute("aria-pressed", String(v === 1));
      el.querySelector(".dn").setAttribute("aria-pressed", String(v === -1));
      el.querySelector(".vn").textContent = n;
    });
  }
  const paintAll = () => results.querySelectorAll(".vote").forEach((el) => paintVote(el.dataset.vote));
  function bump(slug, from, to) {
    const s = vote.scores[slug] || (vote.scores[slug] = { up: 0, down: 0, score: 0 });
    if (from === 1) s.up--; if (from === -1) s.down--;
    if (to === 1) s.up++; if (to === -1) s.down++;
    s.score = s.up - s.down;
  }
  async function castVote(slug, dir) {
    const from = vote.mine[slug] || 0, to = from === dir ? 0 : dir;
    const prevScore = vote.scores[slug] ? { ...vote.scores[slug] } : null;
    if (to) vote.mine[slug] = to; else delete vote.mine[slug];
    saveMine(); bump(slug, from, to); paintVote(slug);
    if (!vote.global) return;
    const undo = () => {
      if (from) vote.mine[slug] = from; else delete vote.mine[slug];
      if (prevScore) vote.scores[slug] = prevScore; else delete vote.scores[slug];
      saveMine(); paintVote(slug);
    };
    try {
      const r = await fetch("/api/votes", { method: "POST", headers: { "Content-Type": "application/json" }, credentials: "same-origin", body: JSON.stringify({ slug, value: to }) });
      const d = await r.json().catch(() => ({}));
      if (r.ok && d.global) { vote.scores[slug] = { up: d.up, down: d.down, score: d.score }; paintVote(slug); return; }
      if (r.status === 503) { vote.global = false; paintAll(); return; } // no database: keep the local vote
      undo(); say(r.status === 429 ? "Too many votes, try again in a minute" : "Vote did not save, try again");
    } catch { undo(); say("Vote did not save, try again"); }
  }
  let shelfReady = false;
  function loadVotes() {
    const mine = Object.keys(vote.mine).length > 0; // only ask for your own votes once you have some
    return fetch("/api/votes" + (mine ? "?mine=1" : ""), { credentials: "same-origin" }).then((r) => r.ok ? r.json() : null).then((d) => {
      if (d && d.global) {
        vote.global = true; vote.scores = d.scores || {};
        if (d.mine) { vote.mine = d.mine; saveMine(); }
      }
      if (!shelfReady) return;
      if (st.sort === "votes") render(); else if (d && d.global) { paintAll(); paintTop(); }
    }).catch(() => {});
  }

  function filtered(ignore) {
    const toks = fold(st.q).split(/\s+/).filter(Boolean);
    const out = [];
    for (const b of bots) {
      if (ignore !== "creator" && st.creator && ckey(b) !== st.creator) continue;
      if (ignore !== "cat" && st.cats.length && !st.cats.includes(b.category)) continue;
      if (st.app && !(b._meta && (b._meta.works_with || []).some((w) => slug(w) === st.app))) continue;
      if (st.agency && !(b._meta && b._meta.agency === st.agency)) continue;
      if (st.fresh && !(b.added >= weekAgo())) continue;
      if (st.oneJob && !(b._meta && b._meta.one_job === true)) continue;
      const m = toks.length ? match(b, toks) : { score: 0, hits: {} };
      if (m) out.push([b, m]);
    }
    return out;
  }
  const weekAgo = () => { const d = new Date(Date.now() - 6 * 864e5); return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0"); };
  const bmOf = (b) => (b._social ? b._social.bookmarks : -1);
  // Typing re-renders at most every 100ms; anything that reads the cards right away calls flush() first
  let renderT = 0;
  const renderSoon = () => { clearTimeout(renderT); renderT = setTimeout(render, 100); };
  const flush = () => { if (renderT) render(); };
  function render() {
    clearTimeout(renderT); renderT = 0;
    const list = filtered(), searching = !!st.q.trim();
    const by = {
      featured: (a, b) => searching ? b[1].score - a[1].score || a[0]._i - b[0]._i : a[0]._i - b[0]._i,
      newest: (a, b) => b[0].added.localeCompare(a[0].added) || b[0]._i - a[0]._i,
      bookmarks: (a, b) => bmOf(b[0]) - bmOf(a[0]) || ((b[0]._social || {}).likes || 0) - ((a[0]._social || {}).likes || 0) || a[0]._i - b[0]._i,
      votes: (a, b) => ((vote.scores[b[0]._slug] || {}).score || 0) - ((vote.scores[a[0]._slug] || {}).score || 0) || ((vote.scores[b[0]._slug] || {}).up || 0) - ((vote.scores[a[0]._slug] || {}).up || 0) || a[0].name.localeCompare(b[0].name),
      az: (a, b) => a[0].name.replace(/^[^\p{L}\p{N}]+/u, "").localeCompare(b[0].name.replace(/^[^\p{L}\p{N}]+/u, "")),
      creator: (a, b) => a[0]._ci - b[0]._ci || a[0].name.localeCompare(b[0].name),
    }[st.sort];
    list.sort(by);
    const grouped = st.sort === "creator" || (st.sort === "featured" && !searching);
    const strip = st.sort === "featured" && !searching && !filtering() ? buildersHTML() + topHTML() : "";
    const cap = capNow = searching || filtering() ? Infinity : GROUP_CAP[st.sort] || 12;
    if (grouped) {
      results.innerHTML = strip + creators.map((c) => {
        const g = list.filter(([b]) => ckey(b) === c.key);
        if (!g.length) return "";
        const shown = st.more.includes(c.key) || g.length <= cap + (GROUP_SLACK[st.sort] || 0) ? g : g.slice(0, cap);
        return `<section class="group" aria-labelledby="g-${c.key}"><div class="ghead"><img src="${esc(c.sm)}"${c.sm !== c.avatar ? ` srcset="${esc(c.sm)} 48w, ${esc(c.avatar)} 128w" sizes="40px"` : ""} alt="" width="40" height="40" loading="lazy" decoding="async">
<h2 id="g-${c.key}" tabindex="-1" data-letter="${letterOf(c.label)}"><span class="nm">${esc(c.label)}</span>${c.url && c.handle ? ` <a class="handle" href="${esc(c.url)}" rel="noopener" target="_blank">${esc(c.handle)}</a>` : ""}<span class="gn"> · ${g.length} ${g.length === 1 ? "bot" : "bots"}</span></h2><button type="button" class="ib plink" data-plink="${esc(SITE + profilePath(c.key))}" aria-label="Share ${esc(c.label)}'s bots (copy share link)" title="Copy share link to ${esc(c.handle)}'s bots">${I.share}<span class="ok" aria-hidden="true">Copied</span></button></div>
<div class="grid">${shown.map(([b, m]) => card(b, m)).join("")}</div>${shown.length < g.length ? `<button type="button" class="btn more" data-more="${c.key}" aria-describedby="g-${c.key}">Show ${g.length - shown.length} more</button>` : ""}</section>`;
      }).join("");
    } else {
      results.innerHTML = list.length ? `<div class="grid flat">${list.map(([b, m]) => card(b, m)).join("")}</div>` : "";
    }
    $("#empty").hidden = list.length > 0;
    $("#count").textContent = `${list.length} ${list.length === 1 ? "bot" : "bots"}`;
    $("#clear").hidden = !(st.q || filtering() || st.sort !== "featured");
    results.removeAttribute("aria-busy");
    renderRail(grouped);
    active = -1;
    setTitle();
    renderFilters();
  }
  function renderFilters() {
    const opt = (v, label, on) => `<option value="${esc(v)}"${on ? " selected" : ""}>${esc(label)}</option>`;
    creatorEl.innerHTML = opt("", "All creators", !st.creator) +
      creators.map((c) => opt(c.key, c.short, st.creator === c.key)).join("");
    creatorEl.value = st.creator;
    creatorEl.classList.toggle("on", !!st.creator);
    const multi = st.cats.length > 1;
    catsEl.innerHTML = opt("", "All categories", !st.cats.length) +
      (multi ? opt("__multi", `${st.cats.length} categories`, true) : "") +
      cats.map((c) => opt(c, c, !multi && st.cats[0] === c)).join("");
    catsEl.value = multi ? "__multi" : (st.cats[0] || "");
    catsEl.classList.toggle("on", st.cats.length > 0);
    appsEl.innerHTML = opt("", "Works with any app", !st.app) + apps.map((a) => opt(a.key, `${a.label} (${a.n})`, st.app === a.key)).join("");
    appsEl.value = st.app; appsEl.classList.toggle("on", !!st.app);
    agencyEl.innerHTML = opt("", "Can it act?", !st.agency) + Object.entries(AGENCY).map(([k, v]) => opt(k, v, st.agency === k)).join("");
    agencyEl.value = st.agency; agencyEl.classList.toggle("on", !!st.agency);
    freshEl.setAttribute("aria-pressed", String(st.fresh));
    oneEl.setAttribute("aria-pressed", String(st.oneJob));
  }

  function set(patch, push) { Object.assign(st, patch); render(); writeURL(push); }
  function syncInputs() { q.value = st.q; sortEl.value = st.sort; }

  /* ---------- Events ---------- */
  let typing;
  q.addEventListener("input", () => { st.q = q.value; renderSoon(); clearTimeout(typing); typing = setTimeout(() => writeURL(false), 250); });
  sortEl.addEventListener("change", () => set({ sort: sortEl.value }, true));
  creatorEl.addEventListener("change", () => set({ creator: creatorEl.value }, true));
  catsEl.addEventListener("change", () => { if (catsEl.value !== "__multi") set({ cats: catsEl.value ? [catsEl.value] : [] }, true); });
  appsEl.addEventListener("change", () => set({ app: appsEl.value }, true));
  agencyEl.addEventListener("change", () => set({ agency: agencyEl.value }, true));
  freshEl.addEventListener("click", () => set({ fresh: !st.fresh }, true));
  oneEl.addEventListener("click", () => set({ oneJob: !st.oneJob }, true));
  const clearAll = () => { st = blank(); syncInputs(); render(); writeURL(true); };
  $("#clear").addEventListener("click", clearAll);
  $("#empty-clear").addEventListener("click", () => { clearAll(); q.focus(); });
  window.addEventListener("popstate", () => { st = readURL(); syncInputs(); render(); });

  // Copy link + toast
  const toast = $("#toast"); let tt;
  function say(msg) { toast.textContent = msg; toast.classList.add("show"); clearTimeout(tt); tt = setTimeout(() => toast.classList.remove("show"), 1800); }
  async function copy(text) {
    try { await navigator.clipboard.writeText(text); }
    catch { const t = document.createElement("textarea"); t.value = text; t.style.position = "fixed"; t.style.opacity = "0"; document.body.append(t); t.select(); document.execCommand("copy"); t.remove(); }
  }
  function showMore(key) {
    if (!st.more.includes(key)) st.more = [...st.more, key];
    render(); writeURL(false);
    const next = results.querySelectorAll(`[aria-labelledby="g-${key}"] .card`)[capNow];
    if (next) next.focus({ preventScroll: true });
  }
  // "Get this bot" (x.ai) and "Add to Bot app" (grokbot://). gtag exists only after the production
  // hostname check in the head snippet. Mark get_bot as a key event in GA4 Admin → Data display →
  // Events → get_bot → Mark as key event.
  function trackGetBot(el) {
    if (typeof gtag !== "function") return;
    const card = el.closest("article");
    const raw = card ? (card.getAttribute("data-slug") || card.id || "") : "";
    gtag("event", "get_bot", {
      bot_slug: raw.replace(/^(f-)?bot-/, ""),
      destination: el.classList.contains("app") ? "app" : "x.ai",
      transport_type: "beacon",
    });
  }
  results.addEventListener("click", (e) => {
    const conv = e.target.closest("a.get, a.app");
    if (conv) trackGetBot(conv);
    const mo = e.target.closest("[data-more]");
    if (mo) { showMore(mo.dataset.more); return; }
    const vb = e.target.closest(".vb");
    if (vb) { castVote(vb.closest(".vote").dataset.vote, Number(vb.dataset.v)); return; }
    const sv = e.target.closest("[data-sortvotes]");
    if (sv && !e.metaKey && !e.ctrlKey && !e.shiftKey) { e.preventDefault(); sortEl.value = "votes"; set({ sort: "votes" }, true); window.scrollTo({ top: 0 }); return; }
    const pl = e.target.closest("[data-plink]");
    if (pl) { copy(pl.dataset.plink).then(() => { pl.classList.add("done"); clearTimeout(pl._t); pl._t = setTimeout(() => pl.classList.remove("done"), 1400); }); return; }
    const ap = e.target.closest("[data-app]");
    if (ap) { if (MOBILE) { const bot = bots.find((x) => x._slug === ap.dataset.app); if (bot) { e.preventDefault(); openApp(bot._app, bot.url); } } return; }
    const sx = e.target.closest("[data-sharex]");
    if (sx) { if (MOBILE) { const bot = bots.find((x) => x._slug === sx.dataset.sharex); if (bot) { e.preventDefault(); openShareX(shareX(bot)); } } return; }
    const b = e.target.closest("[data-copy]"); if (b) { copy(b.dataset.copy).then(() => say("Link copied")); return; }
    // Whole card opens the bot's own page (same as creator views); real controls keep their behavior
    if (e.target.closest("a,button,input,select,textarea,label,summary,[role=button]")) return;
    const card = e.target.closest(".card"); if (!card) return;
    if (String(window.getSelection && window.getSelection()) ) return;
    const link = card.querySelector("h3 a[href]"); if (!link) return;
    if (e.metaKey || e.ctrlKey) window.open(link.href, "_blank", "noopener"); else location.href = link.href;
  });

  // Keyboard: / or Cmd/Ctrl+K focus search, Esc clears, arrows move, Enter opens
  const cardsNow = () => [...results.querySelectorAll(".card")];
  function focusCard(i) {
    const cs = cardsNow(); if (!cs.length) return;
    active = Math.max(0, Math.min(cs.length - 1, i));
    cs.forEach((c, j) => c.classList.toggle("active", j === active));
    cs[active].focus({ preventScroll: true });
    cs[active].scrollIntoView({ block: "nearest", behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
  }
  function step(dir) {
    const cs = cardsNow(); if (!cs.length) return;
    if (active < 0 || !cs[active]) return focusCard(0);
    if (dir === "left") return focusCard(active - 1);
    if (dir === "right") return focusCard(active + 1);
    const r0 = cs[active].getBoundingClientRect(); let best = -1, bd = Infinity;
    cs.forEach((c, j) => {
      const r = c.getBoundingClientRect(), dy = dir === "down" ? r.top - r0.top : r0.top - r.top;
      if (dy < 8) return;
      const d = dy * 4 + Math.abs(r.left - r0.left);
      if (d < bd) { bd = d; best = j; }
    });
    if (best >= 0) focusCard(best); else if (dir === "up") { active = -1; cs.forEach((c) => c.classList.remove("active")); q.focus(); }
  }
  document.addEventListener("keydown", (e) => {
    const t = document.activeElement, inSearch = t === q, onCard = t && t.classList && t.classList.contains("card");
    if (inSearch && /^(Arrow|Enter$)/.test(e.key)) flush();
    if ((e.key === "k" && (e.metaKey || e.ctrlKey)) || (e.key === "/" && !inSearch && !/INPUT|SELECT|TEXTAREA/.test(t.tagName))) {
      e.preventDefault(); q.focus(); q.select(); return;
    }
    if (e.key === "Escape") {
      if (inSearch && q.value) { e.preventDefault(); st.q = ""; q.value = ""; render(); writeURL(false); }
      else if (onCard) { q.focus(); }
      else if (inSearch) q.blur();
      return;
    }
    const dirs = { ArrowDown: "down", ArrowUp: "up", ArrowLeft: "left", ArrowRight: "right" };
    if (dirs[e.key] && (onCard || (inSearch && e.key === "ArrowDown") || t === document.body)) {
      e.preventDefault(); if (inSearch) focusCard(0); else step(dirs[e.key]); return;
    }
    if (e.key === "Enter") {
      // Same as a click on the card: open the bot's own page (Cmd/Ctrl+Enter opens it in a new tab)
      const link = onCard && t.querySelector("h3 a[href]");
      if (link) { e.preventDefault(); if (e.metaKey || e.ctrlKey) window.open(link.href, "_blank", "noopener"); else location.href = link.href; }
      else if (inSearch && cardsNow().length) { e.preventDefault(); focusCard(0); }
    }
  });
  results.addEventListener("focusin", (e) => { if (e.target.classList.contains("card")) { const i = cardsNow().indexOf(e.target); if (i >= 0) active = i; } });

  // Keep scroll-padding-top in sync with the real sticky dock height (it wraps/grows on phones)
  const dock = document.getElementById("dock");
  const syncDock = () => document.documentElement.style.setProperty("--dock-h", dock.offsetHeight + "px");
  syncDock(); if (window.ResizeObserver) new ResizeObserver(syncDock).observe(dock);
  // Phones: filter row scrolls sideways; the arrow scrolls it and hides once the end is reached
  const fbar = dock.querySelector(".filterbar"), fbMore = $("#fb-more");
  const syncFb = () => dock.classList.toggle("fb-end", fbar.scrollLeft + fbar.clientWidth >= fbar.scrollWidth - 4);
  fbar.addEventListener("scroll", syncFb, { passive: true }); window.addEventListener("resize", syncFb); syncFb();
  fbMore.addEventListener("click", () => fbar.scrollBy({ left: fbar.clientWidth * 0.7, behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" }));

  // "Add your bot": render all cards first so content-visibility can't undershoot, then scroll
  let jumpT;
  function scrollToAdd() {
    const add = document.getElementById("add"), root = document.documentElement;
    clearTimeout(jumpT); root.classList.add("jumping"); syncDock(); void add.offsetTop;
    add.scrollIntoView({ block: "start", behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
    jumpT = setTimeout(() => root.classList.remove("jumping"), 1500);
  }
  document.querySelector(".add-top").addEventListener("click", (e) => {
    e.preventDefault();
    if (location.hash !== "#add") history.pushState(null, "", location.pathname + location.search + "#add");
    scrollToAdd();
  });

  // Deep links: #add jumps to the form; #bot-slug scrolls to and highlights a card
  function openHash() {
    if (location.hash === "#add") return scrollToAdd();
    const id = decodeURIComponent(location.hash.slice(1)); if (!id || !bots.some((b) => b._slug === id)) return;
    let el = document.getElementById(id);
    const hb = bots.find((b) => b._slug === id);
    if (!el && !st.more.includes(ckey(hb))) { st.more = [...st.more, ckey(hb)]; render(); writeURL(false); el = document.getElementById(id); }
    if (!el) { st = blank(); st.more = [ckey(hb)]; syncInputs(); render(); writeURL(false); el = document.getElementById(id); }
    if (!el) return;
    el.scrollIntoView({ block: "center" });
    el.classList.remove("flash"); void el.offsetWidth; el.classList.add("flash");
  }
  window.addEventListener("hashchange", openHash);

  /* ---------- A-Z rail: jump to the first creator group under a letter ---------- */
  // Fixed to the right edge, under the dock. Only letters with a visible group show; it hides on flat views and when
  // fewer than two letters are left. Tap or click jumps; on touch you can also drag along it (contacts-style).
  function letterOf(name) {
    const ch = String(name || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/^[^\p{L}\p{N}]+/u, "").charAt(0).toUpperCase();
    return /[A-Z]/.test(ch) ? ch : "#";
  }
  const rail = document.createElement("nav");
  rail.className = "rail"; rail.id = "rail"; rail.hidden = true;
  rail.setAttribute("aria-label", "Jump to creators by letter");
  document.body.append(rail);
  const pop = document.createElement("div");
  pop.className = "rail-pop"; pop.hidden = true; pop.setAttribute("aria-hidden", "true");
  document.body.append(pop);
  let railLetters = [], railLock = "", railTop = -1;
  function renderRail(grouped) {
    const seen = [];
    if (grouped) for (const h of results.querySelectorAll(".group h2[data-letter]")) if (!seen.includes(h.dataset.letter)) seen.push(h.dataset.letter);
    const show = seen.length > 1;
    document.documentElement.classList.toggle("has-rail", show);
    if (seen.join() === railLetters.join() && rail.hidden === !show) { syncRail(); return; }
    railLetters = seen; rail.hidden = !show; railLock = ""; railTop = -1;
    rail.innerHTML = show ? seen.map((L, i) => `<button type="button" data-l="${L}" tabindex="${i ? -1 : 0}" aria-label="Jump to creators starting with ${L === "#" ? "a number or symbol" : L}">${L}</button>`).join("") : "";
    syncRail();
  }
  // Far jumps land instantly most of the way, then glide the last stretch (Z from the top: ~0.5s instead of ~2s, and it
  // still reads as movement). Drag-scrub and reduced motion jump instantly. The chosen letter stays highlighted until
  // you scroll yourself: the last few groups can't reach the top of the page, so the in-view letter would be wrong.
  const reduced = () => matchMedia("(prefers-reduced-motion: reduce)").matches;
  function jumpTo(L, focus) {
    const h = results.querySelector(`.group h2[data-letter="${L}"]`); if (!h) return;
    const sec = h.closest(".group"), root = document.documentElement;
    clearTimeout(jumpT); root.classList.add("jumping"); syncDock(); void sec.offsetTop;
    railLock = L; markRail(L);
    const pad = dock.offsetHeight + 12, dy = sec.getBoundingClientRect().top - pad, instant = focus === "drag" || reduced();
    if (!instant && Math.abs(dy) > innerHeight * 1.5) window.scrollBy(0, dy - Math.sign(dy) * innerHeight * 0.6);
    sec.scrollIntoView({ block: "start", behavior: instant ? "auto" : "smooth" });
    if (focus === true) h.focus({ preventScroll: true });
    // Keep every card rendered until the scroll settles so content-visibility estimates can't move the target
    const landed = () => Math.abs(sec.getBoundingClientRect().top - pad) < 3 || scrollY + innerHeight >= root.scrollHeight - 2;
    const done = (e) => { if (e && !landed()) return; clearTimeout(jumpT); root.classList.remove("jumping"); window.removeEventListener("scrollend", done); };
    window.addEventListener("scrollend", done); jumpT = setTimeout(done, 1500);
  }
  function markRail(L) {
    for (const b of rail.children) { const on = b.dataset.l === L; b.classList.toggle("on", on); if (on) b.setAttribute("aria-current", "true"); else b.removeAttribute("aria-current"); }
  }
  // Highlight the letter of the group at the top of the screen
  let railRaf = 0;
  function syncRail() {
    if (rail.hidden) return;
    // At the top of the page the dock sits below the hero; start the rail under the dock's real bottom, not its stuck one
    const t = Math.round(Math.max(0, dock.getBoundingClientRect().bottom)) + 10;
    if (t !== railTop) { railTop = t; rail.style.top = t + "px"; }
    if (railLock) return markRail(railLock);
    const top = dock.offsetHeight + 24; let cur = "";
    for (const h of results.querySelectorAll(".group h2[data-letter]")) { if (h.closest(".group").getBoundingClientRect().top <= top) cur = h.dataset.letter; else break; }
    markRail(cur);
  }
  window.addEventListener("scroll", () => { if (!railRaf) railRaf = requestAnimationFrame(() => { railRaf = 0; syncRail(); }); }, { passive: true });
  // Your own scrolling (wheel, touch, keys outside the rail) hands the highlight back to the in-view letter
  const unlock = (e) => { if (railLock && !rail.contains(e.target)) { railLock = ""; } };
  for (const ev of ["wheel", "touchstart", "keydown", "mousedown"]) window.addEventListener(ev, unlock, { passive: true, capture: true });
  let dragging = false;
  rail.addEventListener("click", (e) => { const b = e.target.closest("button[data-l]"); if (b && !dragging) jumpTo(b.dataset.l, e.detail === 0); });
  rail.addEventListener("keydown", (e) => {
    const bs = [...rail.children], i = bs.indexOf(document.activeElement); if (i < 0) return;
    const j = { ArrowDown: i + 1, ArrowRight: i + 1, ArrowUp: i - 1, ArrowLeft: i - 1, Home: 0, End: bs.length - 1 }[e.key];
    if (j === undefined) return;
    e.preventDefault(); e.stopPropagation();
    const n = bs[Math.max(0, Math.min(bs.length - 1, j))];
    bs.forEach((b) => b.tabIndex = b === n ? 0 : -1); n.focus();
  });
  // Touch: drag along the rail to scrub (contacts-style). The finger's height maps onto the letter list, so tiny letters
  // on short screens, overshooting the ends or sliding off the strip still land; a big letter bubble shows where you are.
  let lastL = "", popT;
  const atY = (y) => {
    const bs = rail.children, a = bs[0].getBoundingClientRect().top, z = bs[bs.length - 1].getBoundingClientRect().bottom;
    return bs[Math.max(0, Math.min(bs.length - 1, Math.floor((y - a) / ((z - a) / bs.length))))];
  };
  const showPop = (b) => { const r = b.getBoundingClientRect(); pop.textContent = b.dataset.l; pop.style.top = Math.max(40, Math.min(innerHeight - 40, r.top + r.height / 2)) + "px"; pop.hidden = false; clearTimeout(popT); };
  rail.addEventListener("touchstart", (e) => { const t = e.touches[0], b = t && atY(t.clientY); dragging = false; lastL = b ? b.dataset.l : ""; if (b) showPop(b); }, { passive: true });
  rail.addEventListener("touchmove", (e) => {
    const t = e.touches[0], b = t && atY(t.clientY); e.preventDefault();
    if (b && b.dataset.l !== lastL) { dragging = true; lastL = b.dataset.l; showPop(b); jumpTo(lastL, "drag"); }
  }, { passive: false });
  const endTouch = () => { clearTimeout(popT); popT = setTimeout(() => { pop.hidden = true; }, 450); if (dragging) setTimeout(() => { dragging = false; }, 50); };
  rail.addEventListener("touchend", endTouch); rail.addEventListener("touchcancel", endTouch);

  /* ---------- Boot ---------- */
  const deep = (u) => { const m = String(u || "").match(/^https:\/\/x\.ai\/bot\/([A-Za-z0-9_-]+)\/?$/); return m ? "grokbot://app/v1/bot-template?id=" + m[1] : ""; };
  // One request: shelf-data.json (built by scripts/build.js from bots.json, bot-meta.json and social.json), at the
  // versioned URL index.html preloads
  const dataURL = (document.querySelector('link[rel="preload"][href^="/shelf-data.json"]') || {}).href || "/shelf-data.json";
  fetch(dataURL).then((r) => r.json()).then(({ bots: data }) => {
    bots = data.map((b, i) => ({ ...b, _i: i, _slug: "bot-" + slug(b.name), _page: "/bot/" + slug(b.name), _app: deep(b.url), _meta: b.meta || null, _social: b.social || null, _f: { name: fold(b.name), description: fold(b.description), category: fold(b.category), creator: fold(b.creator_name + " " + b.creator_handle) } }));
    const seen = new Map();
    for (const b of bots) if (!seen.has(ckey(b))) seen.set(ckey(b), { key: ckey(b), url: b.creator_url, handle: b.creator_handle, avatar: b.creator_avatar, sm: b.avatar_sm || b.creator_avatar, short: b.creator_name, label: b.creator_name });
    creators = [...seen.values()].sort((a, b) => a.short.localeCompare(b.short, undefined, { sensitivity: "base" }));
    bots.forEach((b) => { b._ci = creators.findIndex((c) => c.key === ckey(b)); });
    cats = [...new Set(bots.map((b) => b.category))].sort();
    const am = new Map();
    for (const b of bots) for (const w of (b._meta && b._meta.works_with) || []) { const k = slug(w); const a = am.get(k) || { key: k, label: w, n: 0 }; a.n++; am.set(k, a); }
    apps = [...am.values()].sort((a, b) => b.n - a.n || a.label.localeCompare(b.label));
    st = readURL(); syncInputs();
    const show = () => {
      if (shelfReady) return;
      shelfReady = true; render();
      const pc = pathCreator();
      if (pc && !creators.some((c) => c.key === pc)) showNotFound(pc); else writeURL(false);
      if (location.hash) requestAnimationFrame(openHash);
    };
    // Most upvoted needs tallies; wait briefly so the first paint is not every bot tied at 0.
    if (st.sort === "votes") { const t = setTimeout(show, 400); loadVotes().finally(() => { clearTimeout(t); show(); }); }
    else { show(); loadVotes(); }
  }).catch(() => { results.removeAttribute("aria-busy"); results.innerHTML = '<p class="count">The shelf did not load. Refresh to try again.</p>'; });
})();

// Post on X: native app on mobile, web composer fallback / desktop.
(function () {
  var a = document.getElementById("post-x");
  if (!a) return;
  var T = encodeURIComponent("Hey @Phil_Holland @thecsguy, add my bot to Grok Bot Shelf 🤖\nx.ai/bot/");
  var web = "https://twitter.com/intent/tweet?text=" + T;
  a.href = web;
  var mobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  if (!mobile) return;
  a.addEventListener("click", function (e) {
    e.preventDefault();
    var t = setTimeout(function () {
      if (document.visibilityState === "visible") window.location.href = web;
    }, 1200);
    document.addEventListener("visibilitychange", function h() {
      if (document.visibilityState === "hidden") { clearTimeout(t); document.removeEventListener("visibilitychange", h); }
    });
    window.location.href = "twitter://post?message=" + T;
  });
})();

// Suggest a bot: POST /api/submit. Shelf Inbox (or Phil/Nick) reviews for NSFW and security issues. Clean bots may be added without a second human click.
(function () {
  var f = document.getElementById("sub-form");
  if (!f) return;
  var msg = document.getElementById("sub-msg"), go = document.getElementById("sub-go");
  function show(t, cls) { msg.textContent = t; msg.className = "sub-msg" + (cls ? " " + cls : ""); }
  f.addEventListener("submit", function (e) {
    e.preventDefault();
    var bot = f.bot_url.value.trim(), post = f.post_url.value.trim();
    if (!bot && !post) { show("Paste an x.ai/bot link or an X post link.", "err"); f.bot_url.focus(); return; }
    go.disabled = true; show("Checking…");
    fetch("/api/submit", { method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ bot_url: bot, post_url: post, note: f.note.value.trim(), website: f.website.value }) })
      .then(function (r) { return r.json().catch(function () { return {}; }).then(function (d) { return [r, d]; }); })
      .then(function (rd) {
        var r = rd[0], d = rd[1];
        if (r.ok && d.ok) {
          show(d.message || "Thanks! It is in the review queue.", "ok");
          if (d.status !== "already_listed") f.reset();
          if (window.va) window.va("event", { name: "submit_bot" });
        } else show(d.error || "That did not go through. Try again in a minute.", "err");
      })
      .catch(function () { show("That did not go through. Try again in a minute.", "err"); })
      .then(function () { go.disabled = false; });
  });
})();
