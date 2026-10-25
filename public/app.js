(() => {
  "use strict";
  const $ = (s) => document.querySelector(s);
  const q = $("#q"), sortEl = $("#sort"), results = $("#results"), creatorEl = $("#creators"), catsEl = $("#cats");
  const SORTS = ["featured", "newest", "az", "creator"];
  let bots = [], creators = [], cats = [], st = blank(), active = -1;

  function blank() { return { q: "", creator: "", cats: [], sort: "featured" }; }
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

  /* ---------- Bot face eyes, ported from iBot's eyes.js (ball character) ---------- */
  (() => {
    const eyes = document.querySelector("#botface .eyes"); if (!eyes) return;
    const ROWS = [[-16, -14, 14], [-12, -14, 14], [-8, -14, 14], [-4, -14, 14], [0, -14, 14], [4, -14, 14], [8, -14, 14], [10, -12, 12]];
    const rm = matchMedia("(prefers-reduced-motion: reduce)"), now = () => performance.now();
    const lerp = (a, b, t) => a + (b - a) * t, R = (a) => lerp(a[0], a[1], Math.random());
    const span = (dy) => { let lo = ROWS[0], hi = ROWS[ROWS.length - 1]; for (const r of ROWS) { if (r[0] <= dy) lo = r; if (r[0] >= dy) { hi = r; break; } } return [Math.max(lo[1], hi[1]), Math.min(lo[2], hi[2])]; };
    const spot = () => { if (Math.random() < 0.2) return [0, 0]; const y = lerp(-16, 10, Math.random()), s = span(y); return [lerp(s[0], s[1], Math.random()), y]; };
    const ease = (t) => 0.5 - Math.cos(Math.PI * Math.min(1, Math.max(0, t))) / 2;
    const st = { x: 0, y: 0, from: [0, 0], to: [0, 0], ms: 0, t0: 0, hold: 0, blinkAt: 0, bStart: -1, bDur: 200, bQ: 0, raf: 0, timer: 0, last: "" };
    const schedBlink = (t) => { const g = R([1600, 3500]); st.blinkAt = t + (rm.matches ? g * 2.5 : g); st.bDur = R([180, 220]); st.bQ = !rm.matches && Math.random() < 0.25 ? 1 : 0; };
    function write(k) {
      const r = (n) => Math.round(n * 100) / 100;
      const tf = k >= 0.999 ? `translate(${r(st.x)} ${r(st.y)})` : `translate(${r(st.x)} ${r(st.y + 63 * (1 - k))}) scale(1 ${r(k)})`;
      if (tf !== st.last) { eyes.setAttribute("transform", tf); st.last = tf; }
    }
    function frame() {
      st.raf = 0; if (document.hidden) return;
      const t = now();
      if (st.ms > 0) { const k = (t - st.t0) / st.ms, e = ease(k); st.x = lerp(st.from[0], st.to[0], e); st.y = lerp(st.from[1], st.to[1], e); if (k >= 1) st.ms = 0; }
      if (!st.ms && t >= st.hold) {
        if (rm.matches) { st.x = 0; st.y = 0; st.hold = Infinity; }
        else { const [x, y] = spot(), m = R([150, 210]); st.from = [st.x, st.y]; st.to = [x, y]; st.t0 = t; st.ms = m; st.hold = t + m + R([300, 1400]); }
      }
      let k = 1;
      if (st.bStart >= 0) {
        const bt = t - st.bStart;
        k = bt >= 0 && bt < st.bDur ? 1 - 0.9 * Math.sin(Math.PI * bt / st.bDur) : 1;
        if (bt >= st.bDur) { if (st.bQ > 0) { st.bQ--; st.bStart = t + 60; } else { st.bStart = -1; schedBlink(t); } }
      } else if (t >= st.blinkAt) st.bStart = t;
      write(k); plan(t);
    }
    function plan(t) {
      clearTimeout(st.timer); if (document.hidden) return;
      if (st.ms > 0 || st.bStart >= 0) { st.raf ||= requestAnimationFrame(frame); return; }
      const wait = Math.min(st.blinkAt, st.hold) - t;
      if (Number.isFinite(wait)) st.timer = setTimeout(() => { st.raf ||= requestAnimationFrame(frame); }, Math.max(0, wait));
    }
    const kick = () => { cancelAnimationFrame(st.raf); st.raf = requestAnimationFrame(frame); };
    document.addEventListener("visibilitychange", () => { if (document.hidden) { cancelAnimationFrame(st.raf); st.raf = 0; clearTimeout(st.timer); } else kick(); });
    rm.addEventListener?.("change", () => { st.hold = 0; kick(); });
    const t = now(); st.hold = t + 900; st.bStart = t; schedBlink(t); kick();
  })();

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
  const profilePath = (key) => { const c = creators.find((x) => x.key === key); return "/@" + (c ? c.handle.replace(/^@/, "") : key); };
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
    return s;
  }
  function writeURL(push) {
    const p = new URLSearchParams();
    if (st.q) p.set("q", st.q);
    if (st.cats.length) p.set("cat", st.cats.map(slug).join(","));
    if (st.sort !== "featured") p.set("sort", st.sort);
    const url = (st.creator ? profilePath(st.creator) : "/") + (p.toString() ? "?" + p.toString().replace(/%2C/g, ",") : "") + location.hash;
    if (url !== location.pathname + location.search + location.hash) history[push ? "pushState" : "replaceState"](null, "", url);
  }

  /* ---------- Rendering ---------- */
  const I = {
    share: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3v12"/><path d="M8 7l4-4 4 4"/><path d="M5 12v7a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-7"/></svg>',
    copy: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M10 14a4 4 0 0 0 5.66 0l3-3a4 4 0 0 0-5.66-5.66l-1 1"/><path d="M14 10a4 4 0 0 0-5.66 0l-3 3a4 4 0 0 0 5.66 5.66l1-1"/></svg>',
    code: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m8 7-5 5 5 5M16 7l5 5-5 5"/></svg>',
    up: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 19V5"/><path d="m6 11 6-6 6 6"/></svg>',
    down: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14"/><path d="m6 13 6 6 6-6"/></svg>',
    x: '<svg class="fill" viewBox="0 0 24 24" aria-hidden="true"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/></svg>',
  };
  // Share a bot on X: web intent everywhere; native app first on mobile (same pattern as #post-x)
  const MOBILE = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  function shareX(b) {
    const T = encodeURIComponent(`Check out ${b.name} by ${b.creator_handle} on Grok Bot Shelf\n${SITE}/#${b._slug}`);
    return { web: "https://twitter.com/intent/tweet?text=" + T, app: "twitter://post?message=" + T };
  }
  function openShareX(u) {
    const t = setTimeout(() => { if (document.visibilityState === "visible") window.location.href = u.web; }, 1200);
    document.addEventListener("visibilitychange", function h() {
      if (document.visibilityState === "hidden") { clearTimeout(t); document.removeEventListener("visibilitychange", h); }
    });
    window.location.href = u.app;
  }
  function card(b, m, pre) {
    const h = m ? m.hits : {}, id = (pre || "") + b._slug;
    return `<article class="card" id="${id}" tabindex="-1" data-url="${esc(b.url)}" aria-labelledby="${id}-t">
<div class="head"><div class="icon" aria-hidden="true">${esc(b.emoji)}</div><div class="ttl">
<h3 id="${id}-t"><a href="#${b._slug}">${hl(b.name, h.name)}</a></h3>
<div class="sub"><span>${esc(b.category)}</span><span class="dot" aria-hidden="true">·</span><img src="${esc(b.creator_avatar)}" alt="" width="16" height="16" loading="lazy" decoding="async"><span>${esc(b.creator_name)}</span></div>
</div></div>
<p class="desc">${hl(b.description, h.description)}</p>
<div class="foot-row"><div class="tools">
${voteHTML(b)}
<button type="button" class="ib" data-copy="${esc(b.url)}" aria-label="Copy link to ${esc(b.name)}" title="Copy link">${I.copy}</button>
<a class="ib" href="${esc(shareX(b).web)}" data-sharex="${b._slug}" rel="noopener" target="_blank" aria-label="Share ${esc(b.name)} on X" title="Share ${esc(b.name)} on X">${I.share}</a>
${b.source_post ? `<a class="ib" href="${esc(b.source_post)}" rel="noopener" target="_blank" aria-label="${esc(b.name)}: original post on X" title="Original post on X">${I.x}</a>` : ""}
${b.code_url ? `<a class="ib" href="${esc(b.code_url)}" rel="noopener" target="_blank" aria-label="${esc(b.name)}: source code" title="Source code">${I.code}</a>` : ""}
</div><a class="get" href="${esc(b.url)}" rel="noopener" target="_blank" aria-label="Get ${esc(b.name)} on x.ai">Get this bot</a></div>
</article>`;
  }
  /* ---------- From the builders strip (home Featured view only) ---------- */
  function buildersHTML() {
    const cfg = window.BUILDERS || {}, names = cfg.feature || [];
    const picks = names.map((n) => bots.find((b) => b.name === n)).filter(Boolean);
    if (!picks.length) return "";
    const people = (cfg.handles || []).map((h) => {
      const c = creators.find((x) => x.key === h.replace(/^@/, "").toLowerCase());
      const u = c ? c.url : "https://x.com/" + h.replace(/^@/, "");
      return `<span class="who"><a href="${esc(u)}" rel="noopener" target="_blank">${esc(h)}</a>` + (c ? ` <a class="all" href="${esc(profilePath(c.key))}" aria-label="All bots by ${esc(c.label)}">all bots</a>` : "") + "</span>";
    }).join('<span class="dot" aria-hidden="true">·</span>');
    return `<section class="builders" aria-labelledby="builders-h"><div class="bhead"><h2 id="builders-h">From the builders</h2><p class="bsub">${people}</p></div>
<div class="grid">${picks.map((b) => card(b, null, "f-")).join("")}</div></section>`;
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
  function loadVotes() {
    const mine = Object.keys(vote.mine).length > 0; // only ask for your own votes once you have some
    fetch("/api/votes" + (mine ? "?mine=1" : ""), { credentials: "same-origin" }).then((r) => r.ok ? r.json() : null).then((d) => {
      if (!d || !d.global) return;
      vote.global = true; vote.scores = d.scores || {};
      if (d.mine) { vote.mine = d.mine; saveMine(); }
      paintAll();
    }).catch(() => {});
  }

  function filtered(ignore) {
    const toks = fold(st.q).split(/\s+/).filter(Boolean);
    const out = [];
    for (const b of bots) {
      if (ignore !== "creator" && st.creator && ckey(b) !== st.creator) continue;
      if (ignore !== "cat" && st.cats.length && !st.cats.includes(b.category)) continue;
      const m = toks.length ? match(b, toks) : { score: 0, hits: {} };
      if (m) out.push([b, m]);
    }
    return out;
  }
  function render() {
    const list = filtered(), searching = !!st.q.trim();
    const by = {
      featured: (a, b) => searching ? b[1].score - a[1].score || a[0]._i - b[0]._i : a[0]._i - b[0]._i,
      newest: (a, b) => b[0].added.localeCompare(a[0].added) || b[0]._i - a[0]._i,
      az: (a, b) => a[0].name.replace(/^[^\p{L}\p{N}]+/u, "").localeCompare(b[0].name.replace(/^[^\p{L}\p{N}]+/u, "")),
      creator: (a, b) => a[0]._ci - b[0]._ci || a[0].name.localeCompare(b[0].name),
    }[st.sort];
    list.sort(by);
    const grouped = st.sort === "creator" || (st.sort === "featured" && !searching);
    const strip = st.sort === "featured" && !searching && !st.creator && !st.cats.length ? buildersHTML() : "";
    if (grouped) {
      results.innerHTML = strip + creators.map((c) => {
        const g = list.filter(([b]) => ckey(b) === c.key);
        if (!g.length) return "";
        return `<section class="group" aria-labelledby="g-${c.key}"><div class="ghead"><img src="${esc(c.avatar)}" alt="" width="40" height="40" decoding="async">
<h2 id="g-${c.key}"><span class="nm">${esc(c.label)}</span> <a class="handle" href="${esc(c.url)}" rel="noopener" target="_blank">${esc(c.handle)}</a><span class="gn"> · ${g.length} ${g.length === 1 ? "bot" : "bots"}</span></h2><button type="button" class="ib plink" data-plink="${esc(SITE + profilePath(c.key))}" aria-label="Share ${esc(c.label)}'s bots (copy share link)" title="Copy share link to ${esc(c.handle)}'s bots">${I.share}<span class="ok" aria-hidden="true">Copied</span></button></div>
<div class="grid">${g.map(([b, m]) => card(b, m)).join("")}</div></section>`;
      }).join("");
    } else {
      results.innerHTML = list.length ? `<div class="grid flat">${list.map(([b, m]) => card(b, m)).join("")}</div>` : "";
    }
    $("#empty").hidden = list.length > 0;
    $("#count").textContent = `${list.length} ${list.length === 1 ? "bot" : "bots"}`;
    $("#clear").hidden = !(st.q || st.creator || st.cats.length || st.sort !== "featured");
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
  }

  function set(patch, push) { Object.assign(st, patch); render(); writeURL(push); }
  function syncInputs() { q.value = st.q; sortEl.value = st.sort; }

  /* ---------- Events ---------- */
  let typing;
  q.addEventListener("input", () => { st.q = q.value; render(); clearTimeout(typing); typing = setTimeout(() => writeURL(false), 250); });
  sortEl.addEventListener("change", () => set({ sort: sortEl.value }, true));
  creatorEl.addEventListener("change", () => set({ creator: creatorEl.value }, true));
  catsEl.addEventListener("change", () => { if (catsEl.value !== "__multi") set({ cats: catsEl.value ? [catsEl.value] : [] }, true); });
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
  results.addEventListener("click", (e) => {
    const vb = e.target.closest(".vb");
    if (vb) { castVote(vb.closest(".vote").dataset.vote, Number(vb.dataset.v)); return; }
    const pl = e.target.closest("[data-plink]");
    if (pl) { copy(pl.dataset.plink).then(() => { pl.classList.add("done"); clearTimeout(pl._t); pl._t = setTimeout(() => pl.classList.remove("done"), 1400); }); return; }
    const sx = e.target.closest("[data-sharex]");
    if (sx) { if (MOBILE) { const bot = bots.find((x) => x._slug === sx.dataset.sharex); if (bot) { e.preventDefault(); openShareX(shareX(bot)); } } return; }
    const b = e.target.closest("[data-copy]"); if (b) copy(b.dataset.copy).then(() => say("Link copied"));
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
      if (onCard) { e.preventDefault(); window.open(t.dataset.url, "_blank", "noopener"); }
      else if (inSearch && cardsNow().length) { e.preventDefault(); focusCard(0); }
    }
  });
  results.addEventListener("focusin", (e) => { if (e.target.classList.contains("card")) { const i = cardsNow().indexOf(e.target); if (i >= 0) active = i; } });

  // Keep scroll-padding-top in sync with the real sticky dock height (it wraps/grows on phones)
  const dock = document.getElementById("dock");
  const syncDock = () => document.documentElement.style.setProperty("--dock-h", dock.offsetHeight + "px");
  syncDock(); if (window.ResizeObserver) new ResizeObserver(syncDock).observe(dock);

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
    if (!el) { st = blank(); syncInputs(); render(); writeURL(false); el = document.getElementById(id); }
    el.scrollIntoView({ block: "center" });
    el.classList.remove("flash"); void el.offsetWidth; el.classList.add("flash");
  }
  window.addEventListener("hashchange", openHash);

  /* ---------- Boot ---------- */
  fetch("/bots.json").then((r) => r.json()).then((data) => {
    bots = data.map((b, i) => ({ ...b, _i: i, _slug: "bot-" + slug(b.name), _f: { name: fold(b.name), description: fold(b.description), category: fold(b.category), creator: fold(b.creator_name + " " + b.creator_handle) } }));
    const seen = new Map();
    for (const b of bots) if (!seen.has(ckey(b))) seen.set(ckey(b), { key: ckey(b), url: b.creator_url, handle: b.creator_handle, avatar: b.creator_avatar, short: b.creator_name, label: b.creator_name });
    creators = [...seen.values()].sort((a, b) => a.short.localeCompare(b.short, undefined, { sensitivity: "base" }));
    bots.forEach((b) => { b._ci = creators.findIndex((c) => c.key === ckey(b)); });
    cats = [...new Set(bots.map((b) => b.category))].sort();
    st = readURL(); syncInputs(); render(); writeURL(false);
    if (location.hash) requestAnimationFrame(openHash);
    loadVotes();
  }).catch(() => { results.innerHTML = '<p class="count">The shelf did not load. Refresh to try again.</p>'; });
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
