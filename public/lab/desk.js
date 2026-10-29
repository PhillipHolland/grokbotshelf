(() => {
  "use strict";
  const SITE = "https://grokbotshelf.com";
  const MOBILE = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
  const fold = (s) => String(s).toLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g, "");
  const slug = (s) => fold(s).replace(/&/g, " and ").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  const ckey = (b) => b.creator_handle ? b.creator_handle.replace(/^@/, "").toLowerCase() : "~" + slug(b.creator_name);
  const profilePath = (key) => "/@" + key;
  const deep = (u) => { const m = String(u || "").match(/^https:\/\/x\.ai\/bot\/([A-Za-z0-9_-]+)\/?$/); return m ? "grokbot://app/v1/bot-template?id=" + m[1] : ""; };
  const icon = (n, cls) => `<svg${cls ? ` class="${cls}"` : ""} viewBox="0 0 24 24" aria-hidden="true"><use href="#i-${n}"/></svg>`;
  const I = { share: icon("share"), copy: icon("copy"), code: icon("code"), up: icon("up"), down: icon("down"), app: icon("app"), bm: icon("bm"), x: icon("x", "fill") };
  const AGENCY = { acts: "Takes actions", drafts: "Drafts for you", reads: "Reads only" };
  const AGENCY_TIP = { acts: "Can take actions, usually after your OK", drafts: "Prepares things for you to send or approve", reads: "Looks things up and reports back" };

  // Same order as the static mock: bot names + pair template ids
  const LAYOUT = {
    "grid-local": [
      "Local AI Manager", "Apple Desk", "#pair-mac-mini", "Apple Mac Tools",
      "#pair-beelink", "Pulse · Gaming Laptop Tech", "#pair-t7", "Apple Inventory & Deal Bot",
    ],
    "grid-clip": [
      "Reel ➡️ 𝕏", "Clipper", "#pair-opus", "Stills & Clips Desk", "Podcast Clipper for X",
      "Streamer's Dream", "Creative Video Studio", "#pair-heygen", "Grok Bot Video Studio", "#pair-runway",
    ],
    "grid-voice": [
      "micDrop", "#pair-mv7", "Character Voice Desk", "#pair-synthesia",
    ],
  };

  let bots = [], byName = new Map();
  const toast = document.getElementById("toast");
  const say = (msg, ms = 2200) => {
    if (!toast) return;
    toast.textContent = msg;
    toast.classList.add("show");
    clearTimeout(toast._t);
    toast._t = setTimeout(() => toast.classList.remove("show"), ms);
  };
  const copy = (t) => navigator.clipboard.writeText(t).catch(() => {
    const a = document.createElement("textarea"); a.value = t; document.body.appendChild(a); a.select();
    try { document.execCommand("copy"); } finally { a.remove(); }
  });

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
  function openApp(deepLink, web) {
    const t = setTimeout(() => { if (document.visibilityState === "visible") window.location.href = web; }, 1500);
    document.addEventListener("visibilitychange", function h() {
      if (document.visibilityState === "hidden") { clearTimeout(t); document.removeEventListener("visibilitychange", h); }
    });
    window.location.href = deepLink;
  }

  function badgesHTML(b) {
    const m = b._meta; if (!m) return '<div class="badges"></div>';
    const out = (m.agency && AGENCY[m.agency] ? [`<span class="badge ag-${m.agency}" title="${esc(AGENCY_TIP[m.agency])}">${AGENCY[m.agency]}</span>`] : [])
      .concat((m.works_with || []).map((w) => `<span class="badge">${esc(w)}</span>`));
    return `<div class="badges"${out.length ? ` title="Set by the shelf from the bot's description"` : ""}>${out.join("")}</div>`;
  }

  /* ---------- Votes (same localStorage + /api/votes as the shelf) ---------- */
  const VKEY = "gbs_votes";
  const vote = { global: false, scores: {}, mine: {} };
  try { vote.mine = JSON.parse(localStorage.getItem(VKEY) || "{}") || {}; } catch {}
  const saveMine = () => { try { localStorage.setItem(VKEY, JSON.stringify(vote.mine)); } catch {} };
  function voteBits(slug) {
    const v = vote.mine[slug] || 0, s = vote.scores[slug];
    const n = vote.global && s ? s.score : 0;
    const title = !vote.global ? "Your vote is saved in this browser" : s && s.up + s.down ? `${s.up} up, ${s.down} down` : "No votes yet";
    return { v, n, title };
  }
  function voteHTML(b) {
    const { v, n, title } = voteBits(b._slug), nm = esc(b.name);
    return `<span class="vote" data-vote="${b._slug}" title="${esc(title)}"><button type="button" class="ib vb up" data-v="1" aria-pressed="${v === 1}" aria-label="Upvote ${nm}">${I.up}</button><span class="vn">${n}</span><button type="button" class="ib vb dn" data-v="-1" aria-pressed="${v === -1}" aria-label="Downvote ${nm}">${I.down}</button></span>`;
  }
  function paintVoteEl(el) {
    const bits = voteBits(el.dataset.vote);
    el.title = bits.title;
    el.querySelector(".up").setAttribute("aria-pressed", String(bits.v === 1));
    el.querySelector(".dn").setAttribute("aria-pressed", String(bits.v === -1));
    el.querySelector(".vn").textContent = bits.n;
  }
  function paintVote(slug) {
    document.querySelectorAll(`.vote[data-vote="${CSS.escape(slug)}"]`).forEach(paintVoteEl);
  }
  function bump(slug, from, to) {
    const s = vote.scores[slug] || (vote.scores[slug] = { up: 0, down: 0, score: 0 });
    if (from === 1) s.up--; if (from === -1) s.down--;
    if (to === 1) s.up++; if (to === -1) s.down++;
    s.score = s.up - s.down;
  }
  function sayVote(slug, to) {
    const b = bots.find((x) => x._slug === slug), name = b ? b.name : "this bot";
    say((to === 1 ? `Upvoted ${name}` : to === -1 ? `Downvoted ${name}` : `Vote removed from ${name}`) + (vote.global ? `, score ${voteBits(slug).n}` : ", saved in this browser"));
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
      if (r.status === 503) { vote.global = false; document.querySelectorAll(".vote").forEach(paintVoteEl); return sayVote(slug, to); }
      undo();
      say(r.status === 429 ? (d.error || "Too many votes, try again in a minute") : "Vote did not save, try again", r.status === 429 ? 6000 : 2200);
    } catch { undo(); say("Vote did not save, try again"); }
  }
  function loadVotes() {
    const mine = Object.keys(vote.mine).length > 0;
    return fetch("/api/votes" + (mine ? "?mine=1" : ""), { credentials: "same-origin" }).then((r) => r.ok ? r.json() : null).then((d) => {
      if (d && d.global) {
        vote.global = true; vote.scores = d.scores || {};
        if (d.mine) { vote.mine = d.mine; saveMine(); }
        document.querySelectorAll(".vote").forEach(paintVoteEl);
      }
    }).catch(() => {});
  }

  function card(b) {
    const id = b._slug;
    const nb = b._social && b._social.bookmarks, bw = nb === 1 ? "bookmark" : "bookmarks";
    const bk = nb ? `<span class="dot" aria-hidden="true">·</span><span class="bm" title="${nb} ${bw} on the original X post (not a rating)">${I.bm}${nb.toLocaleString("en-US")}<span class="sr"> ${bw} on X</span></span>` : "";
    const av = b.avatar_sm || b.creator_avatar;
    return `<article class="card" id="${id}" tabindex="-1" data-url="${esc(b.url)}" data-slug="${esc(b._slug)}" aria-labelledby="${id}-t">
<div class="head"><div class="icon" aria-hidden="true">${esc(b.emoji)}</div><div class="ttl">
<h3 id="${id}-t"><a href="${b._page}">${esc(b.name)}</a></h3>
<div class="sub"><span>${esc(b.category)}</span><span class="dot" aria-hidden="true">·</span>${av ? `<img src="${esc(av)}" alt="" width="16" height="16" loading="lazy" decoding="async">` : ""}${b.creator_handle ? `<a class="cn" href="${profilePath(ckey(b))}">${esc(b.creator_name)}</a>` : `<span class="cn">${esc(b.creator_name)}</span>`}${bk}</div>
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
</article>`;
  }

  function findBot(name) {
    if (byName.has(name)) return byName.get(name);
    const f = fold(name);
    return bots.find((b) => fold(b.name) === f) || null;
  }

  function render() {
    for (const [gridId, items] of Object.entries(LAYOUT)) {
      const grid = document.getElementById(gridId);
      if (!grid) continue;
      const parts = [];
      for (const item of items) {
        if (item.startsWith("#")) {
          const tpl = document.getElementById(item.slice(1));
          if (tpl) parts.push(tpl.innerHTML.trim());
          continue;
        }
        const b = findBot(item);
        if (b) parts.push(card(b));
        else parts.push(`<article class="card"><p class="desc">Missing bot: ${esc(item)}</p></article>`);
      }
      grid.innerHTML = parts.join("");
      grid.removeAttribute("aria-busy");
    }
  }

  function bind() {
    const main = document.getElementById("main");
    main.addEventListener("click", (e) => {
      const vb = e.target.closest(".vb");
      if (vb) { castVote(vb.closest(".vote").dataset.vote, Number(vb.dataset.v)); return; }
      const ap = e.target.closest("[data-app]");
      if (ap) { if (MOBILE) { const bot = bots.find((x) => x._slug === ap.dataset.app); if (bot) { e.preventDefault(); openApp(bot._app, bot.url); } } return; }
      const sx = e.target.closest("[data-sharex]");
      if (sx) { if (MOBILE) { const bot = bots.find((x) => x._slug === sx.dataset.sharex); if (bot) { e.preventDefault(); openShareX(shareX(bot)); } } return; }
      const cp = e.target.closest("[data-copy]");
      if (cp) { copy(cp.dataset.copy).then(() => say("Link copied")); return; }
      if (e.target.closest("a,button,input,select,textarea,label,summary,[role=button]")) return;
      const cardEl = e.target.closest(".card:not(.pair)");
      if (!cardEl) return;
      if (String(window.getSelection && window.getSelection())) return;
      const link = cardEl.querySelector("h3 a[href]"); if (!link) return;
      if (e.metaKey || e.ctrlKey) window.open(link.href, "_blank", "noopener"); else location.href = link.href;
    });
  }

  // Theme (same as other bot pages)
  const themeBtn = document.getElementById("theme");
  if (themeBtn) {
    const sync = () => {
      const t = document.documentElement.getAttribute("data-theme") === "light" ? "light" : "dark";
      themeBtn.setAttribute("aria-label", t === "light" ? "Light mode" : "Dark mode");
      themeBtn.setAttribute("aria-pressed", t === "dark" ? "true" : "false");
    };
    sync();
    themeBtn.addEventListener("click", () => {
      const next = document.documentElement.getAttribute("data-theme") === "light" ? "dark" : "light";
      document.documentElement.setAttribute("data-theme", next);
      try { localStorage.setItem("theme", next); } catch {}
      const m = document.querySelector('meta[name="theme-color"]');
      const c = document.querySelector('meta[name="color-scheme"]');
      if (m) m.content = next === "light" ? "#ffffff" : "#000000";
      if (c) c.content = next;
      sync();
    });
  }

  fetch("/shelf-data.json").then((r) => r.json()).then(({ bots: data }) => {
    bots = data.map((b, i) => ({
      ...b, _i: i, _slug: "bot-" + slug(b.name), _page: "/bot/" + slug(b.name),
      _app: deep(b.url), _meta: b.meta || null, _social: b.social || null,
    }));
    byName = new Map(bots.map((b) => [b.name, b]));
    render();
    bind();
    loadVotes();
  }).catch(() => {
    say("Could not load shelf data");
  });
})();
