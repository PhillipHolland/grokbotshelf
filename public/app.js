// The add-your-bot form (add.js, also on /add) reads the same shelf-data.json the home view loads; no extra request
// let, not const: "Try again" after a failed load starts a fresh promise
let shelfDone; let shelfData = new Promise((r) => { shelfDone = r; });
(() => {
  "use strict";
  const $ = (s) => document.querySelector(s);
  const q = $("#q"), sortEl = $("#sort"), results = $("#results"), creatorEl = $("#creators"), catsEl = $("#cats");
  const appsEl = $("#apps"), agencyEl = $("#agency"), freshEl = $("#fresh"), oneEl = $("#onejob"), resetEl = $("#reset");
  const SORTS = ["featured", "newest", "bookmarks", "votes", "az", "creator"];
  const AGENCY = { acts: "Takes actions", drafts: "Drafts for you", reads: "Reads only" };
  const AGENCY_TIP = { acts: "Can take actions, usually after your OK", drafts: "Prepares things for you to send or approve", reads: "Looks things up and reports back" };
  let bots = [], creators = [], cats = [], apps = [], st = blank(), active = -1, tagged = { any: 0, agency: 0, by: {} };

  function blank() { return { q: "", creator: "", cats: [], sort: "featured", app: "", agency: "", fresh: false, oneJob: false, more: [] }; }
  // Unfiltered grouped views show the first few cards per creator plus a "Show N more" button; expanded groups are
  // kept in ?more=a,b. Featured (the home view) keeps it to one desktop row so the A-Z rail and scrolling stay quick;
  // Creator sort is for browsing whole catalogs, so it keeps 12 (as before). Small leftovers are shown rather than
  // hidden behind "Show 1 more". Search and filters always show every match.
  const GROUP_CAP = { featured: 3, creator: 12 }, GROUP_SLACK = { featured: 1, creator: 3 };
  let capNow = Infinity;
  const filtering = () => !!(st.creator || st.cats.length || st.app || st.agency || st.fresh || st.oneJob);
  // Reset shows only when search, a filter or the sort differs from the default home view
  const changed = () => !!(st.q.trim() || filtering() || st.sort !== "featured");
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
  const fold = (s) => String(s).toLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g, "");
  const slug = (s) => fold(s).replace(/&/g, " and ").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  // Group key: the lowercase handle, or "~" + name slug for creators with no X handle (they get no /@ page, avatar or share)
  const ckey = (b) => b.creator_handle ? b.creator_handle.replace(/^@/, "").toLowerCase() : "~" + slug(b.creator_name);
  const anonKey = (k) => k.charAt(0) === "~";

  // Very narrow phones (320px): a shorter search placeholder so it is not clipped next to the sort menu
  const mqNarrow = matchMedia("(max-width:360px)"), syncPh = () => { q.placeholder = mqNarrow.matches ? "Search" : "Search bots"; };
  syncPh(); if (mqNarrow.addEventListener) mqNarrow.addEventListener("change", syncPh);

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
    // Swap the theme in one frame. Per-element color transitions on every node (hundreds of cards, the blurred dock) made
    // the browser animate thousands of properties at once while gradients, scrollbars and native controls snapped instantly.
    // Instead: freeze all transitions during the swap, and where supported cross-fade a single composited snapshot.
    const swap = () => { root.classList.add("theme-switching"); applyTheme(next); getComputedStyle(root).color; };
    const done = () => requestAnimationFrame(() => root.classList.remove("theme-switching"));
    if (document.startViewTransition && !matchMedia("(prefers-reduced-motion: reduce)").matches) {
      try { document.startViewTransition(swap).finished.finally(done); } catch { swap(); done(); }
    } else { swap(); done(); }
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
  // Creator filter from legacy ?creator=handle. /@handle is a static page; an unknown or mixed-case /@handle is the 404
  // page (which sends other casings to the lowercase URL), and /u/handle redirects to /@handle in vercel.json.
  const SITE = "https://grokbotshelf.com";
  const profilePath = (key) => "/@" + key; // creator pages live at the lowercase handle
  const BASE_TITLE = document.title;
  function setTitle() {
    const c = st.creator && creators.find((x) => x.key === st.creator);
    document.title = c ? `${c.label} · Grok Bot Shelf` : BASE_TITLE;
    const canon = document.querySelector('link[rel="canonical"]'); if (canon) canon.href = SITE + (c && !c.anon ? profilePath(c.key) : "/");
  }
  function readURL() {
    const p = new URLSearchParams(location.search), s = blank();
    s.q = p.get("q") || "";
    const c = (p.get("creator") || "").toLowerCase(); s.creator = creators.some((x) => x.key === c) ? c : "";
    s.cats = (p.get("cat") || "").split(",").map((x) => cats.find((c) => slug(c) === slug(x))).filter(Boolean);
    const so = p.get("sort"); s.sort = SORTS.includes(so) ? so : "featured";
    const ap = p.get("app"); s.app = ap && apps.some((a) => a.key === ap) ? ap : "";
    const ag = p.get("does"); s.agency = AGENCY[ag] ? ag : "";
    s.fresh = p.get("new") === "1";
    s.oneJob = p.get("one_job") === "1";
    s.more = (p.get("more") || "").toLowerCase().split(",").filter((k, i, a) => k && a.indexOf(k) === i && creators.some((c) => c.key === k));
    return s;
  }
  function writeURL(push) {
    const p = new URLSearchParams();
    if (st.q) p.set("q", st.q);
    if (st.creator && anonKey(st.creator)) p.set("creator", st.creator);
    if (st.cats.length) p.set("cat", st.cats.map(slug).join(","));
    if (st.app) p.set("app", st.app);
    if (st.agency) p.set("does", st.agency);
    if (st.fresh) p.set("new", "1");
    if (st.oneJob) p.set("one_job", "1");
    if (st.sort !== "featured") p.set("sort", st.sort);
    if (st.more.length) p.set("more", st.more.join(","));
    const url = (st.creator && !anonKey(st.creator) ? profilePath(st.creator) : "/") + (p.toString() ? "?" + p.toString().replace(/%2C/g, ",").replace(/%7E/g, "~") : "") + location.hash;
    if (url !== location.pathname + location.search + location.hash) history[push ? "pushState" : "replaceState"](null, "", url);
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
    const T = encodeURIComponent(`Check out ${fold(b.name).endsWith(fold(" by " + b.creator_name)) ? b.name : `${b.name} by ${b.creator_handle || b.creator_name}`} on Grok Bot Shelf\n${SITE}${b._page}`);
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
    const m = b._meta; if (!m) return '<div class="badges"></div>';
    const out = (m.agency && AGENCY[m.agency] ? [`<span class="badge ag-${m.agency}" title="${esc(AGENCY_TIP[m.agency])}">${AGENCY[m.agency]}</span>`] : [])
      .concat((m.works_with || []).map((w) => `<span class="badge">${esc(w)}</span>`));
    // Always present (empty without meta) so the tag line sits at the same height on every card
    return `<div class="badges"${out.length ? ` title="Set by the shelf from the bot's description"` : ""}>${out.join("")}</div>`;
  }
  function card(b, m, pre) {
    const h = m ? m.hits : {}, id = (pre || "") + b._slug;
    const nb = b._social && b._social.bookmarks, bw = nb === 1 ? "bookmark" : "bookmarks";
    const bk = nb ? `<span class="dot" aria-hidden="true">·</span><span class="bm" title="${nb} ${bw} on the original X post (not a rating)">${I.bm}${nb.toLocaleString("en-US")}<span class="sr"> ${bw} on X</span></span>` : "";
    const av = b.avatar_sm || b.creator_avatar;
    return `<article class="card" id="${id}" tabindex="-1" data-url="${esc(b.url)}" aria-labelledby="${id}-t">
<div class="head"><div class="icon" aria-hidden="true">${esc(b.emoji)}</div><div class="ttl">
<h3 id="${id}-t"><a href="${b._page}">${hl(b.name, h.name)}</a></h3>
<div class="sub"><span>${esc(b.category)}</span><span class="dot" aria-hidden="true">·</span>${av ? `<img src="${esc(av)}" alt="" width="16" height="16" loading="lazy" decoding="async">` : ""}${b.creator_handle ? `<a class="cn" href="${profilePath(ckey(b))}">${esc(b.creator_name)}</a>` : `<span class="cn">${esc(b.creator_name)}</span>`}${bk}</div>
</div></div>
<p class="desc">${hl(b.description, h.description)}</p>
${badgesHTML(b)}
<div class="foot-row"><div class="tools">
${voteHTML(b)}
<button type="button" class="ib" data-copy="${esc(b.url)}" aria-label="Copy link to ${esc(b.name)}" title="Copy link">${I.copy}</button>
<a class="ib" href="${esc(shareX(b).web)}" data-sharex="${b._slug}" rel="noopener" target="_blank" aria-label="Share ${esc(b.name)} on X" title="Share ${esc(b.name)} on X">${I.share}</a>
${b.source_post ? `<a class="ib" href="${esc(b.source_post)}" rel="noopener" target="_blank" aria-label="${esc(b.name)}: original post on X" title="Original post on X">${I.x}</a>` : ""}
${b.code_url ? `<a class="ib" href="${esc(b.code_url)}" rel="noopener" target="_blank" aria-label="${esc(b.name)}: source code" title="Source code">${I.code}</a>` : ""}
${b.source_post || b.code_url ? "" : '<span class="ib slot" aria-hidden="true"></span>'}
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
      .sort((a, b) => b[1].score - a[1].score || b[1].up - a[1].up || a[0].name.localeCompare(b[0].name));
    const per = {}; const capped = [];
    for (const t of top) { const k = ckey(t[0]); if ((per[k] = (per[k] || 0) + 1) > 2) continue; capped.push(t); if (capped.length === TOP_N) break; }
    top.length = 0; top.push(...capped);
    if (!top.length) return "";
    return `<div class="thead"><h2 id="topv-h">Top voted</h2><a class="tall" href="/?sort=votes" data-sortvotes>See all by votes →</a></div>
<ol class="tlist">${top.map(([b, s], i) => `<li><a href="${b._page}" title="${s.up} up, ${s.down} down"><span class="rk">${i + 1}</span><span class="em" aria-hidden="true">${esc(b.emoji)}</span><span class="nm">${esc(b.name)}<small>${esc(b.creator_name)}</small></span><span class="sc">${I.up}${s.score}<span class="sr"> net votes</span></span></a></li>`).join("")}</ol>`;
  }
  let topEl = null;
  function topNode() {
    if (!topEl) { topEl = document.createElement("section"); topEl.className = "topvotes"; topEl.setAttribute("aria-labelledby", "topv-h"); topEl._inner = null; }
    const inner = topInner();
    if (inner !== topEl._inner) { topEl.innerHTML = inner; topEl.hidden = !inner; topEl._inner = inner; }
    return topEl;
  }
  // Tallies arrive after a #add or #bot jump has scrolled; the strip sits above the view then, and the form
  // below the shelf opts out of scroll anchoring, so keep what is on screen still by hand.
  function paintTop() {
    if (!topEl || !topEl.isConnected) return;
    const next = topEl.nextElementSibling, y0 = next ? next.getBoundingClientRect().top : 1;
    topNode();
    const d = next ? next.getBoundingClientRect().top - y0 : 0;
    if (!d) return;
    // mid smooth jump: an instant scroll would cut it short, so aim the jump again at its moved target
    if (glide && performance.now() < glide.until) glide.el.scrollIntoView(glide.opts);
    else if (y0 <= 0) scrollBy({ top: d, behavior: "instant" });
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
    const n = vote.global && s ? s.score : 0; // always shown: the shared tally, 0 when nobody has voted or the tally is offline
    const title = !vote.global ? "Your vote is saved in this browser" : s && s.up + s.down ? `${s.up} up, ${s.down} down` : "No votes yet";
    return { v, n, title };
  }
  function voteHTML(b) {
    const { v, n, title } = voteBits(b._slug), nm = esc(b.name);
    return `<span class="vote" data-vote="${b._slug}" title="${esc(title)}"><button type="button" class="ib vb up" data-v="1" aria-pressed="${v === 1}" aria-label="Upvote ${nm}">${I.up}</button><span class="vn">${n}</span><button type="button" class="ib vb dn" data-v="-1" aria-pressed="${v === -1}" aria-label="Downvote ${nm}">${I.down}</button></span>`;
  }
  const voteKey = ({ v, n, title }) => v + "|" + n + "|" + title;
  function paintVoteEl(el, bits = voteBits(el.dataset.vote)) {
    const { v, n, title } = bits, k = voteKey(bits);
    if (el._vk === k) return;
    el._vk = k; el.title = title;
    el.querySelector(".up").setAttribute("aria-pressed", String(v === 1));
    el.querySelector(".dn").setAttribute("aria-pressed", String(v === -1));
    el.querySelector(".vn").textContent = n;
  }
  function paintVote(slug) {
    const bits = voteBits(slug);
    results.querySelectorAll(`.vote[data-vote="${slug}"]`).forEach((el) => paintVoteEl(el, bits));
  }
  // One pass over the vote widgets (a per-slug lookup for each widget was O(n²) on load and after each tail chunk)
  const paintAll = () => { for (const el of results.querySelectorAll(".vote")) paintVoteEl(el); };
  function bump(slug, from, to) {
    const s = vote.scores[slug] || (vote.scores[slug] = { up: 0, down: 0, score: 0 });
    if (from === 1) s.up--; if (from === -1) s.down--;
    if (to === 1) s.up++; if (to === -1) s.down++;
    s.score = s.up - s.down;
  }
  // One announcement per vote, through the #toast status region without showing it (the .vn counts are not live regions:
  // 260 of them changing at once when tallies arrive read out as a stream of numbers)
  function sayVote(slug, to) {
    const b = bots.find((x) => x._slug === slug), name = b ? b.name : "this bot";
    toast.textContent = (to === 1 ? `Upvoted ${name}` : to === -1 ? `Downvoted ${name}` : `Vote removed from ${name}`) + (vote.global ? `, score ${voteBits(slug).n}` : ", saved in this browser");
  }
  async function castVote(slug, dir) {
    const from = vote.mine[slug] || 0, to = from === dir ? 0 : dir;
    const prevScore = vote.scores[slug] ? { ...vote.scores[slug] } : null;
    if (to) vote.mine[slug] = to; else delete vote.mine[slug];
    saveMine(); bump(slug, from, to); paintVote(slug);
    if (!vote.global) return sayVote(slug, to);
    const undo = () => {
      if (from) vote.mine[slug] = from; else delete vote.mine[slug];
      if (prevScore) vote.scores[slug] = prevScore; else delete vote.scores[slug];
      saveMine(); paintVote(slug);
    };
    try {
      const r = await fetch("/api/votes", { method: "POST", headers: { "Content-Type": "application/json" }, credentials: "same-origin", body: JSON.stringify({ slug, value: to }) });
      const d = await r.json().catch(() => ({}));
      if (r.ok && d.global) { vote.scores[slug] = { up: d.up, down: d.down, score: d.score }; paintVote(slug); return sayVote(slug, to); }
      if (r.status === 503) { vote.global = false; paintAll(); return sayVote(slug, to); } // no database: keep the local vote
      undo();
      // Vote caps (cap_network, cap_daily) come with a sentence for people; show it long enough to read
      if (r.status === 429 && /^cap_/.test(d.code || "") && d.error) say(d.error, 6000);
      else say(r.status === 429 ? "Too many votes, try again in a minute" : "Vote did not save, try again");
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
  // Typing re-renders at most every 100ms. Clicks (sort, filters, reset, Show more) paint the control's new state
  // first and render in the task after that frame (renderNext), so the press shows at once. Anything that reads
  // the cards right away calls flush() first.
  let renderT = 0, renderF = 0, afterRender = null;
  const cancelRender = () => { clearTimeout(renderT); renderT = 0; cancelAnimationFrame(renderF); renderF = 0; };
  const renderSoon = () => { cancelRender(); renderT = setTimeout(render, 100); };
  function renderNext(then) {
    cancelRender(); afterRender = then || null;
    renderF = requestAnimationFrame(() => { renderF = 0; renderT = setTimeout(render, 0); });
  }
  const flush = () => { if (renderT || renderF) render(); finishTail(); };
  // Render on demand. First load: the strip and the first few creator groups go in right away; the other groups are
  // appended a few at a time when a sentinel under the results comes within ~1.5 screens of the viewport. Flat views
  // (search, Votes, Newest, A-Z...) show FLAT_STEP cards and add FLAT_STEP more the same way. Anything that needs every
  // card (keyboard moves) calls finishTail() first; #bot- deep links and rail jumps build only up to their target group
  // (tailTo), and "Add your bot" builds nothing and holds the appends while the form is on screen. On a reload or back/forward
  // the old behavior stays (the rest follows in small tasks right away) so the browser can restore the scroll position.
  const FIRST_GROUPS = 3, TAIL_GROUPS = 4, FLAT_STEP = 48;
  // tail: pending { L, f } groups (f builds the section), or pending [bot, match] rows of a flat view (tailFlat)
  let tail = [], tailFlat = false, tailT = 0, chunkNext = false;
  const navType = (performance.getEntriesByType && (performance.getEntriesByType("navigation")[0] || {}).type) || "navigate";
  const eager = navType === "reload" || navType === "back_forward" || !("IntersectionObserver" in window);
  const sentinel = document.createElement("div"); sentinel.className = "sentinel"; sentinel.setAttribute("aria-hidden", "true");
  results.after(sentinel);
  // In range when it is within 1.5 screens under the viewport or anywhere above it (End key, scrollbar drag)
  const io = "IntersectionObserver" in window ? new IntersectionObserver((es) => { if (es.some((e) => e.isIntersecting)) pumpTail(); }, { rootMargin: "100000px 0px 150% 0px" }) : null;
  function appendTail(n) {
    const take = tail.splice(0, n);
    if (tailFlat) { if (flatEl) flatEl.append(...cardEls(take)); }
    else { results.append(...take.map((g) => g.f())); railGroups = [...results.querySelectorAll(".group")]; }
  }
  function watchTail() {
    clearTimeout(tailT); tailT = 0; syncTailing();
    if (!tail.length) return tailDone();
    if (eager) { tailT = setTimeout(pumpTail, 0); return; }
    // Re-observing reports the sentinel's state again, so a sentinel that is still in range after an append loads more
    io.unobserve(sentinel); io.observe(sentinel);
  }
  // tailHold: set by the jump to #add, so groups don't pile in above the form while the visitor reads it
  let tailHold = false;
  function pumpTail() { if (!tail.length || tailHold) return; appendTail(tailFlat ? FLAT_STEP : TAIL_GROUPS); watchTail(); }
  function finishTail() {
    if (!tail.length) return;
    appendTail(tail.length); watchTail();
  }
  // Build pending groups (or flat rows) up to and including the first one that matches; the rest stay on the sentinel.
  // Returns false when nothing pending matches.
  function tailTo(match) {
    const i = tail.findIndex(match);
    if (i < 0) return false;
    // near the end, build the rest too: with the form and footer out of the layout (.tailing) a short page couldn't scroll
    // the target to the top, and the last appends would then move it
    appendTail(tail.length - i - 1 <= TAIL_GROUPS ? tail.length : i + 1); watchTail();
    return true;
  }
  function tailDone() { if (io) io.unobserve(sentinel); syncTailing(); }
  // .tailing hides the Add form and footer (display:none) while groups are still pending, so appends never push them
  // around on screen; once "Add your bot" has shown the form it stays (addShown)
  let addShown = false;
  const syncTailing = () => document.documentElement.classList.toggle("tailing", tail.length > 0 && !addShown);
  // Ctrl/Cmd+F (or F3): the browser's find only sees built cards, so build the rest in small idle chunks.
  // The key does its normal job; there is no preventDefault.
  let idleTailOn = false;
  function idleTail() {
    if (idleTailOn || !tail.length) return;
    idleTailOn = true; tailHold = false; if (holdOff) holdOff();
    const later = window.requestIdleCallback ? (f) => requestIdleCallback(f, { timeout: 200 }) : (f) => setTimeout(f, 0);
    const step = () => {
      if (!tail.length) { idleTailOn = false; return tailDone(); }
      appendTail(tailFlat ? FLAT_STEP : 2); later(step);
    };
    later(step);
  }

  // Re-renders reuse DOM nodes: each card is built once per bot (per search highlight) and kept by its id, and
  // group sections are kept by creator, so sort, filter and Show more only move nodes. A reused card keeps
  // the size the browser remembered for it (content-visibility), so nothing above the viewport jumps.
  const tpl = document.createElement("template");
  const nodes = (html) => { tpl.innerHTML = html; return [...tpl.content.children]; };
  const cardCache = new Map(), groupCache = new Map();
  function reuse(el) {
    el.classList.remove("active", "flash");
    const v = el.querySelector(".vote"); if (v) paintVoteEl(v);
  }
  function cardEls(rows, pre) {
    const out = new Array(rows.length), miss = [];
    rows.forEach(([b, m], i) => {
      const id = (pre || "") + b._slug, sig = m ? JSON.stringify(m.hits) : "", el = cardCache.get(id);
      if (el && el._sig === sig) { reuse(el); out[i] = el; } else miss.push([i, id, sig, card(b, m, pre)]);
    });
    if (miss.length) nodes(miss.map((x) => x[3]).join("")).forEach((el, k) => {
      const [i, id, sig] = miss[k]; el._sig = sig; cardCache.set(id, el); out[i] = el;
      const v = el.querySelector(".vote"); if (v) v._vk = voteKey(voteBits(v.dataset.vote)); // built with the current state
    });
    return out;
  }
  // Make parent's children exactly kids, in order, moving only what is out of place
  function place(parent, kids) {
    let cur = parent.firstChild;
    for (const k of kids) { if (k === cur) cur = cur.nextSibling; else parent.insertBefore(k, cur); }
    while (cur) { const n = cur.nextSibling; cur.remove(); cur = n; }
  }
  function groupEl(c, g, shown) {
    let sec = groupCache.get(c.key);
    if (!sec) {
      const avImg = !c.anon && c.sm ? `<img src="${esc(c.sm)}"${c.sm !== c.avatar ? ` srcset="${esc(c.sm)} 48w, ${esc(c.avatar)} 128w" sizes="40px"` : ""} alt="" width="40" height="40" loading="lazy" decoding="async">` : "";
      const handle = c.anon ? "" : ` <a class="handle" href="${esc(c.url)}" rel="noopener" target="_blank">${esc(c.handle)}</a>`;
      const plink = c.anon ? "" : `<button type="button" class="ib plink" data-plink="${esc(SITE + profilePath(c.key))}" aria-label="Share ${esc(c.label)}'s bots (copy share link)" title="Copy share link to ${esc(c.handle)}'s bots">${I.share}<span class="ok" aria-hidden="true">Copied</span></button>`;
      sec = nodes(`<section class="group${c.anon ? " anon" : ""}" aria-labelledby="g-${c.key}"><div class="ghead">${avImg}
<h2 id="g-${c.key}" tabindex="-1" data-letter="${letterOf(c.label)}">${c.anon ? `<span class="nm">${esc(c.label)}</span>` : `<a class="nm" href="${profilePath(c.key)}">${esc(c.label)}</a>`}${handle}<span class="gn"></span></h2>${plink}</div>
<div class="grid"></div></section>`)[0];
      sec._gn = sec.querySelector(".gn"); sec._grid = sec.querySelector(".grid"); sec._more = null;
      groupCache.set(c.key, sec);
    }
    const gn = ` · ${g.length} ${g.length === 1 ? "bot" : "bots"}`;
    if (sec._gn.textContent !== gn) sec._gn.textContent = gn;
    place(sec._grid, cardEls(shown));
    if (shown.length < g.length) {
      const mb = sec._more || (sec._more = nodes(`<button type="button" class="btn more" data-more="${c.key}" aria-describedby="g-${c.key}"></button>`)[0]);
      const t = `Show ${g.length - shown.length} more`;
      if (mb.textContent !== t) mb.textContent = t;
      mb.removeAttribute("aria-busy");
      if (mb.parentNode !== sec) sec.append(mb);
    } else if (sec._more) sec._more.remove();
    return sec;
  }
  let buildersEl, flatEl;
  function buildersNode() {
    if (buildersEl === undefined) { const h = buildersHTML(); buildersEl = h ? nodes(h)[0] : null; }
    if (buildersEl) buildersEl.querySelectorAll(".card").forEach(reuse);
    return buildersEl;
  }
  function render() {
    cancelRender();
    const then = afterRender; afterRender = null;
    clearTimeout(tailT); tailT = 0; tail = []; tailFlat = false; tailHold = false; if (io) io.unobserve(sentinel);
    const chunk = chunkNext; chunkNext = false;
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
    const strip = st.sort === "featured" && !searching && !filtering() ? [buildersNode(), topNode()].filter(Boolean) : [];
    const cap = capNow = searching || filtering() ? Infinity : GROUP_CAP[st.sort] || 12;
    if (grouped) {
      const parts = creators.map((c) => {
        const g = list.filter(([b]) => ckey(b) === c.key);
        if (!g.length) return null;
        const shown = st.more.includes(c.key) || g.length <= cap + (GROUP_SLACK[st.sort] || 0) ? g : g.slice(0, cap);
        return { L: letterOf(c.label), k: c.key, f: () => groupEl(c, g, shown) };
      }).filter(Boolean);
      if (chunk && parts.length > FIRST_GROUPS + TAIL_GROUPS) tail = parts.splice(FIRST_GROUPS);
      place(results, strip.concat(parts.map((g) => g.f())));
    } else {
      if (list.length) { flatEl = flatEl || nodes('<div class="grid flat"></div>')[0]; place(flatEl, cardEls(list.slice(0, FLAT_STEP))); }
      if (list.length > FLAT_STEP) { tail = list.slice(FLAT_STEP); tailFlat = true; }
      place(results, list.length ? [flatEl] : []);
    }
    $("#empty").hidden = list.length > 0;
    $("#count").textContent = `${list.length} ${list.length === 1 ? "bot" : "bots"}`;
    paintCover();
    resetEl.classList.toggle("on", changed());
    results.removeAttribute("aria-busy"); renderRail(grouped);
    watchTail();
    active = -1;
    setTitle();
    renderFilters();
    if (then) then();
  }
  // The option lists never change after load: build them once, then only set values (and the "N categories" option)
  let filtersBuilt = false;
  function renderFilters() {
    const opt = (v, label) => `<option value="${esc(v)}">${esc(label)}</option>`;
    if (!filtersBuilt) {
      filtersBuilt = true;
      creatorEl.innerHTML = opt("", "All creators") + creators.map((c) => opt(c.key, c.short)).join("");
      catsEl.innerHTML = opt("", "All categories") + cats.map((c) => opt(c, c)).join("");
      appsEl.innerHTML = opt("", "Works with any app") + apps.map((a) => opt(a.key, `${a.label} (${a.n})`)).join("");
      agencyEl.innerHTML = opt("", "Can it act?") + Object.entries(AGENCY).map(([k, v]) => opt(k, `${v} (${tagged.by[k] || 0})`)).join("");
    }
    const multi = st.cats.length > 1;
    let mo = catsEl.querySelector('option[value="__multi"]');
    if (multi) {
      if (!mo) { mo = document.createElement("option"); mo.value = "__multi"; catsEl.options[0].after(mo); }
      mo.textContent = `${st.cats.length} categories`;
    } else if (mo) mo.remove();
    creatorEl.value = st.creator;
    catsEl.value = multi ? "__multi" : (st.cats[0] || "");
    appsEl.value = st.app;
    agencyEl.value = st.agency;
    paintControls();
  }
  // Cheap state the controls show (highlight when set, pressed toggles, Reset): painted before the cards re-render
  function paintControls() {
    creatorEl.classList.toggle("on", !!st.creator);
    catsEl.classList.toggle("on", st.cats.length > 0);
    appsEl.classList.toggle("on", !!st.app);
    agencyEl.classList.toggle("on", !!st.agency);
    freshEl.setAttribute("aria-pressed", String(st.fresh));
    oneEl.setAttribute("aria-pressed", String(st.oneJob));
    resetEl.classList.toggle("on", changed());
  }

  // Coverage note under the count while a shelf-tag filter (Can it act?, apps, One job) is on: only tagged bots can match
  const coverEl = $("#cover");
  function paintCover() {
    if (!coverEl) return;
    const on = !!(st.agency || st.app || st.oneJob);
    if (on) {
      const n = st.agency && !st.app && !st.oneJob ? tagged.agency : tagged.any;
      const what = st.agency && !st.app && !st.oneJob ? "tagged for \u201cCan it act?\u201d" : "tagged by the shelf";
      const msg = `Only ${n} of ${bots.length} bots are ${what} so far, so untagged bots are hidden.`;
      if (coverEl.dataset.msg !== msg) { coverEl.dataset.msg = msg; coverEl.innerHTML = `${esc(msg)} <button type="button" class="cover-all">Show all bots</button>`; }
    }
    coverEl.hidden = !on;
  }
  if (coverEl) coverEl.addEventListener("click", (e) => { if (e.target.closest(".cover-all")) set({ agency: "", app: "", oneJob: false }, true); });

  function set(patch, push) { Object.assign(st, patch); paintControls(); writeURL(push); renderNext(); }
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
  // Reset: clear search, filters and sort, collapse every group back to its first cards and drop ?more=
  const clearAll = () => { st = blank(); syncInputs(); paintControls(); writeURL(true); renderNext(); };
  resetEl.addEventListener("click", () => {
    clearAll();
    // The button hides itself; keep focus nearby (on phones the count, so the keyboard does not pop up)
    if (MOBILE) $("#count").focus({ preventScroll: true }); else q.focus({ preventScroll: true });
  });
  $("#empty-clear").addEventListener("click", () => { clearAll(); q.focus(); });
  window.addEventListener("popstate", () => { st = readURL(); syncInputs(); render(); });

  // Copy link + toast
  const toast = $("#toast"); let tt;
  // Skip link: focus the results (next Tab is the first card) without touching the URL hash
  const skip = $(".skip"); if (skip) skip.addEventListener("click", (e) => { e.preventDefault(); results.tabIndex = -1; results.focus({ preventScroll: true }); $("#count").scrollIntoView({ block: "start" }); });
  function say(msg, ms = 1800) { toast.textContent = msg; toast.classList.add("show"); clearTimeout(tt); tt = setTimeout(() => toast.classList.remove("show"), ms); }
  async function copy(text) {
    try { await navigator.clipboard.writeText(text); }
    catch { const t = document.createElement("textarea"); t.value = text; t.style.position = "fixed"; t.style.opacity = "0"; document.body.append(t); t.select(); document.execCommand("copy"); t.remove(); }
  }
  function showMore(key, btn) {
    if (!st.more.includes(key)) st.more = [...st.more, key];
    writeURL(false);
    if (btn) btn.setAttribute("aria-busy", "true");
    renderNext(() => {
      const next = results.querySelectorAll(`[aria-labelledby="g-${key}"] .card`)[capNow];
      if (next) next.focus({ preventScroll: true });
    });
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
    if (mo) { showMore(mo.dataset.more, mo); return; }
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
  const cardsNow = () => { finishTail(); return [...results.querySelectorAll(".card")]; };
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
    if ((e.key === "f" || e.key === "F") && (e.metaKey || e.ctrlKey) && !e.altKey || e.key === "F3") idleTail();
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

  // Old /#add links (the header button is a plain link to /add): scroll to the form without building the rest of the shelf. Appends wait (tailHold) until the
  // visitor scrolls back up a quarter screen, so nothing piles in above the form while it is being read.
  let jumpT, holdOff = null, glide = null;
  const glideTo = (el, opts) => { glide = opts.behavior === "smooth" ? { el, opts, until: performance.now() + 1500 } : null; el.scrollIntoView(opts); };
  function scrollToAdd(instant) {
    const add = document.getElementById("add"), root = document.documentElement;
    // a reload or back/forward builds everything anyway (eager): finish first so the form doesn't move after the jump
    if (eager) finishTail(); else tailHold = true;
    addShown = true; syncTailing();
    if (holdOff) holdOff();
    clearTimeout(jumpT); root.classList.add("jumping"); syncDock(); void add.offsetTop;
    // instant on a first load; a reload keeps the smooth scroll so it wins over the browser restoring the old position
    glideTo(add, { block: "start", behavior: (instant && !eager) || matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
    jumpT = setTimeout(() => {
      root.classList.remove("jumping");
      if (!tailHold) return;
      let y0 = scrollY;
      const onScroll = () => { if (scrollY > y0) y0 = scrollY; else if (scrollY < y0 - innerHeight / 4) { off(); tailHold = false; watchTail(); } };
      const off = holdOff = () => { window.removeEventListener("scroll", onScroll); if (holdOff === off) holdOff = null; };
      window.addEventListener("scroll", onScroll, { passive: true });
    }, 1500); // "jumping" keeps cards at their real size until the page settles under the form
  }

  // Deep links: #add jumps to the form; #bot-slug scrolls to and highlights a card
  function openHash(e) {
    if (location.hash === "#add") return scrollToAdd(!e);
    const id = decodeURIComponent(location.hash.slice(1)); if (!id || !bots.some((b) => b._slug === id)) return;
    const hb = bots.find((b) => b._slug === id);
    // build only up to the bot's group (or row), not the whole shelf; a re-render (to open the group or clear filters)
    // starts over from the first groups the same way
    const toBot = () => { if (!document.getElementById(id)) tailTo((g) => tailFlat ? g[0]._slug === id : g.k === ckey(hb)); return document.getElementById(id); };
    let el = toBot();
    if (!el && !st.more.includes(ckey(hb))) { st.more = [...st.more, ckey(hb)]; chunkNext = true; render(); writeURL(false); el = toBot(); }
    if (!el) { st = blank(); st.more = [ckey(hb)]; syncInputs(); chunkNext = true; render(); writeURL(false); el = toBot(); }
    if (!el) return;
    const grp = el.closest(".group"); if (grp) grp.classList.add("landing");
    el.scrollIntoView({ block: "center" });
    el.classList.remove("flash"); void el.offsetWidth; el.classList.add("flash");
  }
  window.addEventListener("hashchange", openHash);

  /* ---------- A-Z rail: jump to the first creator group under a letter ---------- */
  // Fixed to the right edge, under the dock. Shows the whole alphabet (plus # when a group needs it) so letters keep the
  // same spot; letters with no visible group are dimmed and skipped. Tap or click jumps; on touch you can also drag along
  // it (contacts-style). Hidden on flat views and when fewer than two letters have a group.
  function letterOf(name) {
    const ch = String(name || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/^[^\p{L}\p{N}]+/u, "").charAt(0).toUpperCase();
    return /[A-Z]/.test(ch) ? ch : "#";
  }
  const ALPHA = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("");
  const rail = document.createElement("nav");
  rail.className = "rail"; rail.id = "rail"; rail.hidden = true;
  rail.setAttribute("aria-label", "Jump to creators by letter");
  document.body.append(rail);
  const pop = document.createElement("div");
  pop.className = "rail-pop"; pop.hidden = true; pop.setAttribute("aria-hidden", "true");
  document.body.append(pop);
  // railGroups: every visible group, in page order (read once per render, not on every scroll frame)
  let railLetters = [], railLock = "", railTop = -1, railGroups = [], railOn = null;
  function renderRail(grouped) {
    const seen = [];
    railGroups = grouped ? [...results.querySelectorAll(".group")] : [];
    const Ls = railGroups.map((g) => g.querySelector("h2[data-letter]").dataset.letter).concat(grouped && !tailFlat ? tail.map((g) => g.L) : []);
    for (const L of Ls) if (!seen.includes(L)) seen.push(L);
    const show = seen.length > 1;
    document.documentElement.classList.toggle("has-rail", show);
    if (seen.join() === railLetters.join() && rail.hidden === !show) { syncRail(); return; }
    railLetters = seen; rail.hidden = !show; railLock = ""; railTop = -1; railOn = null;
    const all = (seen.includes("#") ? ["#"] : []).concat(ALPHA);
    rail.innerHTML = show ? all.map((L) => {
      const on = seen.includes(L), name = L === "#" ? "a number or symbol" : L;
      return on
        ? `<button type="button" data-l="${L}" tabindex="-1" aria-label="Jump to creators starting with ${name}">${L}</button>`
        : `<button type="button" data-l="${L}" class="off" tabindex="-1" aria-disabled="true" aria-label="No creators starting with ${name}">${L}</button>`;
    }).join("") : "";
    const first = rail.querySelector("button:not(.off)"); if (first) first.tabIndex = 0;
    syncRail();
  }
  const liveBtns = () => [...rail.querySelectorAll("button:not(.off)")];
  // Jumps never force every card to render (that was a style recalc of every card plus a full-page layout per tap).
  // Instant jumps land on the page as laid out now; scroll anchoring keeps the target put while nearby cards get their
  // real size. Far smooth jumps still skip most of the way instantly and glide the last stretch; a one-off nudge after
  // scrollend fixes any leftover drift. The chosen letter stays highlighted until you scroll yourself: the last few
  // groups can't reach the top of the page, so the in-view letter would be wrong.
  const reduced = () => matchMedia("(prefers-reduced-motion: reduce)").matches;
  let jumpDone = null, jumpRaf = 0, jumpNext = null;
  function jumpTo(L, focus) {
    // the target group may not be built yet: build up to the first group under that letter, not the whole shelf
    if (!results.querySelector(`.group h2[data-letter="${L}"]`)) tailTo((g) => !tailFlat && g.L === L);
    const h = results.querySelector(`.group h2[data-letter="${L}"]`); if (!h) return;
    const sec = h.closest(".group");
    // reads first
    const pad = dock.offsetHeight + 12, dy = sec.getBoundingClientRect().top - pad, instant = focus === "drag" || reduced();
    // then writes
    if (jumpDone) jumpDone(); // cancel the previous jump's listeners
    railLock = L; markRail(L);
    if (!instant && Math.abs(dy) > innerHeight * 1.5) window.scrollBy(0, dy - Math.sign(dy) * innerHeight * 0.6);
    glideTo(sec, { block: "start", behavior: instant ? "auto" : "smooth" });
    if (focus === true) h.focus({ preventScroll: true });
    if (instant) return;
    const landed = () => { const off = sec.getBoundingClientRect().top - pad; return scrollY + innerHeight >= document.documentElement.scrollHeight - 2 ? 0 : Math.round(off); };
    let t = 0;
    const done = (e) => {
      if (e && e.type === "scrollend") { const off = landed(); if (Math.abs(off) >= 3 && Math.abs(off) < innerHeight) window.scrollBy({ top: off, behavior: "auto" }); }
      clearTimeout(t); window.removeEventListener("scrollend", done); if (jumpDone === done) jumpDone = null;
    };
    jumpDone = done;
    window.addEventListener("scrollend", done); t = setTimeout(done, 1500);
  }
  // During a drag, at most one jump per frame
  function jumpSoon(L) { jumpNext = L; if (!jumpRaf) jumpRaf = requestAnimationFrame(() => { jumpRaf = 0; const n = jumpNext; jumpNext = null; if (n) jumpTo(n, "drag"); }); }
  // Only the two buttons that change are touched
  function markRail(L) {
    const b = L ? rail.querySelector(`button[data-l="${L}"]:not(.off)`) : null;
    if (b === railOn) return;
    if (railOn) { railOn.classList.remove("on"); railOn.removeAttribute("aria-current"); }
    if (b) { b.classList.add("on"); b.setAttribute("aria-current", "true"); }
    railOn = b;
  }
  // Highlight the letter of the group at the top of the screen. All reads, then all writes; binary search over groups.
  let railRaf = 0;
  function syncRail() {
    if (rail.hidden) return;
    // At the top of the page the dock sits below the hero; start the rail under the dock's real bottom, not its stuck one
    const dr = dock.getBoundingClientRect(), t = Math.round(Math.max(0, dr.bottom)) + 10;
    let cur = railLock;
    if (!cur) {
      const top = dr.height + 24; let lo = 0, hi = railGroups.length - 1, idx = -1;
      while (lo <= hi) { const mid = (lo + hi) >> 1; if (railGroups[mid].getBoundingClientRect().top <= top) { idx = mid; lo = mid + 1; } else hi = mid - 1; }
      cur = idx >= 0 ? railGroups[idx].querySelector("h2[data-letter]").dataset.letter : "";
    }
    if (t !== railTop) { railTop = t; rail.style.top = t + "px"; }
    markRail(cur);
  }
  window.addEventListener("scroll", () => { if (!railRaf) railRaf = requestAnimationFrame(() => { railRaf = 0; syncRail(); }); }, { passive: true });
  // Your own scrolling (wheel, touch, keys outside the rail) hands the highlight back to the in-view letter
  const unlock = (e) => { if (railLock && !rail.contains(e.target)) { railLock = ""; } };
  for (const ev of ["wheel", "touchstart", "keydown", "mousedown"]) window.addEventListener(ev, unlock, { passive: true, capture: true });
  let dragging = false;
  // A click on a dimmed letter (no group) goes to the nearest letter that has one
  rail.addEventListener("click", (e) => {
    const b0 = e.target.closest("button[data-l]"), b = b0 && b0.classList.contains("off") ? atY(e.clientY) : b0;
    if (b && !dragging) jumpTo(b.dataset.l, e.detail === 0 && b === b0);
  });
  rail.addEventListener("keydown", (e) => {
    const bs = liveBtns(), i = bs.indexOf(document.activeElement); if (i < 0) return;
    const j = { ArrowDown: i + 1, ArrowRight: i + 1, ArrowUp: i - 1, ArrowLeft: i - 1, Home: 0, End: bs.length - 1 }[e.key];
    if (j === undefined) return;
    e.preventDefault(); e.stopPropagation();
    const n = bs[Math.max(0, Math.min(bs.length - 1, j))];
    bs.forEach((b) => b.tabIndex = b === n ? 0 : -1); n.focus();
  });
  // Touch: drag along the rail to scrub (contacts-style). The finger's height maps onto the letter list, so tiny letters
  // on short screens, overshooting the ends or sliding off the strip still land; a big letter bubble shows where you are.
  // Letters without a group snap to the nearest letter that has one. touch-action:none on the buttons stops the page
  // from scrolling, so the listeners can stay passive.
  let lastL = "", popT;
  const atY = (y) => {
    const bs = rail.children, a = bs[0].getBoundingClientRect().top, z = bs[bs.length - 1].getBoundingClientRect().bottom;
    let i = Math.max(0, Math.min(bs.length - 1, Math.floor((y - a) / ((z - a) / bs.length))));
    for (let d = 0; d < bs.length; d++) { // nearest live letter, looking up and down
      if (bs[i - d] && !bs[i - d].classList.contains("off")) return bs[i - d];
      if (bs[i + d] && !bs[i + d].classList.contains("off")) return bs[i + d];
    }
    return null;
  };
  const showPop = (b) => { const r = b.getBoundingClientRect(); pop.textContent = b.dataset.l; pop.style.top = Math.max(40, Math.min(innerHeight - 40, r.top + r.height / 2)) + "px"; pop.hidden = false; clearTimeout(popT); };
  rail.addEventListener("touchstart", (e) => { const t = e.touches[0], b = t && atY(t.clientY); dragging = false; lastL = b ? b.dataset.l : ""; if (b) showPop(b); }, { passive: true });
  rail.addEventListener("touchmove", (e) => {
    const t = e.touches[0], b = t && atY(t.clientY);
    if (b && b.dataset.l !== lastL) { dragging = true; lastL = b.dataset.l; showPop(b); jumpSoon(lastL); }
  }, { passive: true });
  const endTouch = () => { clearTimeout(popT); popT = setTimeout(() => { pop.hidden = true; }, 450); if (dragging) setTimeout(() => { dragging = false; }, 50); };
  rail.addEventListener("touchend", endTouch); rail.addEventListener("touchcancel", endTouch);

  /* ---------- Boot ---------- */
  const deep = (u) => { const m = String(u || "").match(/^https:\/\/x\.ai\/bot\/([A-Za-z0-9_-]+)\/?$/); return m ? "grokbot://app/v1/bot-template?id=" + m[1] : ""; };
  // One request: shelf-data.json (built by scripts/build.js from bots.json, bot-meta.json and social.json), at the
  // versioned URL index.html preloads
  const dataURL = (document.querySelector('link[rel="preload"][href^="/shelf-data.json"]') || {}).href || "/shelf-data.json";
  // A failed load shows the empty-state card with "Try again", which re-runs the fetch (round 2 #10)
  function loadShelf() {
    fetch(dataURL).then((r) => r.json()).then(({ bots: data }) => {
      bots = data.map((b, i) => ({ ...b, _i: i, _slug: "bot-" + slug(b.name), _page: "/bot/" + slug(b.name), _app: deep(b.url), _meta: b.meta || null, _social: b.social || null, _f: { name: fold(b.name), description: fold(b.description), category: fold(b.category), creator: fold(b.creator_name + " " + b.creator_handle) } }));
      const seen = new Map();
      for (const b of bots) if (!seen.has(ckey(b))) seen.set(ckey(b), { key: ckey(b), anon: !b.creator_handle, url: b.creator_url, handle: b.creator_handle, avatar: b.creator_avatar, sm: b.avatar_sm || b.creator_avatar, short: b.creator_name, label: b.creator_name });
      creators = [...seen.values()].sort((a, b) => a.short.localeCompare(b.short, undefined, { sensitivity: "base" }));
      bots.forEach((b) => { b._ci = creators.findIndex((c) => c.key === ckey(b)); });
      cats = [...new Set(bots.map((b) => b.category))].sort();
      const am = new Map();
      for (const b of bots) for (const w of (b._meta && b._meta.works_with) || []) { const k = slug(w); const a = am.get(k) || { key: k, label: w, n: 0 }; a.n++; am.set(k, a); }
      apps = [...am.values()].sort((a, b) => b.n - a.n || a.label.localeCompare(b.label));
      // Shelf tags (bot-meta.json) cover only part of the shelf; the coverage note and the option counts say how much
      for (const b of bots) if (b._meta) { tagged.any++; const a = b._meta.agency; if (AGENCY[a]) { tagged.agency++; tagged.by[a] = (tagged.by[a] || 0) + 1; } }
      shelfDone(bots);
      st = readURL(); syncInputs();
      const show = () => {
        if (shelfReady) return;
        shelfReady = true; chunkNext = true; render();
        writeURL(false);
        if (location.hash) requestAnimationFrame(() => openHash());
      };
      // Most upvoted needs tallies; wait briefly so the first paint is not every bot tied at 0.
      if (st.sort === "votes") { const t = setTimeout(show, 400); loadVotes().finally(() => { clearTimeout(t); show(); }); }
      else { show(); loadVotes(); }
    }).catch(() => {
      shelfDone(null); results.removeAttribute("aria-busy"); document.documentElement.classList.remove("tailing");
      results.innerHTML = '<div class="empty" role="alert"><p class="empty-t">The shelf did not load</p><p class="empty-s">Check your connection, then try again.</p><button type="button" class="btn" data-retry>Try again</button></div>';
      results.querySelector("[data-retry]").addEventListener("click", (e) => {
        e.currentTarget.disabled = true; e.currentTarget.textContent = "Loading…";
        shelfData = new Promise((r) => { shelfDone = r; });
        results.setAttribute("aria-busy", "true"); loadShelf();
      });
    });
  }
  loadShelf();
})();

// Feedback: a post on X tagging the FEEDBACK_X handles, and a GitHub issue for bugs (both set in config.js)
(function () {
  var hs = [].concat(window.FEEDBACK_X || []).join(" ").split(/[\s,]+/).map(function (h) { return h.replace(/^@/, ""); }).filter(Boolean);
  var issues = String(window.FEEDBACK_ISSUES || "");
  var x = "https://x.com/intent/post" + (hs.length ? "?text=" + encodeURIComponent(hs.map(function (h) { return "@" + h; }).join(" ") + " Feedback on Grok Bot Shelf: ") : "");
  document.querySelectorAll("#fb-x, .fb-x").forEach(function (a) { a.href = x; });
  if (/^https:\/\//.test(issues)) document.querySelectorAll(".fb-issue").forEach(function (a) { a.href = issues; });
})();
