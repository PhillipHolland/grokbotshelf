// Add your bot form: launch post and Shelfer links, Post on X, the "already on the shelf" check and the submit.
// Loaded on the home page (the #add section) and on /add.
(function () {
  var esc = function (s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); };
  // Launch post link lives in config.js. Plain text until it is set.
  var launch = (window.LAUNCH_POST_URL || "").trim(), l = document.getElementById("launch");
  if (l && /^https:\/\//.test(launch)) l.outerHTML = '<a href="' + esc(launch) + '" rel="noopener" target="_blank">launch post</a>';
  // Shelfer template link lives in config.js (Add your bot "Get Shelfer" pill and copy)
  var shelfer = (window.SHELFER_URL || "").trim();
  if (/^https:\/\/x\.ai\/bot\//.test(shelfer)) document.querySelectorAll(".get-shelfer,.shelfer-link").forEach(function (a) { a.href = shelfer; });
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

// Add your bot: "already on the shelf" check, matched by x.ai template id against shelf-data.json (no API calls)
const addCheck = (() => {
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
  // Template key: "bot:<id>" for x.ai/bot/<id> (ids are case-sensitive), "mkt:<slug>" for x.ai/marketplace/bots/<slug>.
  // Scheme optional; query, hash, trailing slash and www are ignored and the host is compared lowercase.
  const tkey = (u) => {
    u = String(u || "").trim(); if (!u) return "";
    if (!/^https?:\/\//i.test(u)) u = "https://" + u;
    let x; try { x = new URL(u); } catch { return ""; }
    if (x.hostname.toLowerCase().replace(/^www\./, "") !== "x.ai") return "";
    const path = x.pathname.replace(/\/+$/, "");
    let m = path.match(/^\/bot\/([A-Za-z0-9_-]{6,64})$/); if (m) return "bot:" + m[1];
    m = path.match(/^\/marketplace\/bots\/([a-z0-9-]{2,80})$/i); return m ? "mkt:" + m[1].toLowerCase() : "";
  };
  const urlish = (v) => /^(https?:\/\/|www\.|x\.ai\b)/i.test(v.trim());
  const nkey = (s) => String(s || "").trim().toLowerCase().replace(/\s+/g, " ");
  // Template links sent from this form are kept on this device (localStorage) only so the field can say
  // "you suggested this already" until it shows up on the shelf. The review queue is never read here.
  const SKEY = "shelf_suggested", MAX = 20;
  const mine = () => { try { const a = JSON.parse(localStorage.getItem(SKEY) || "[]"); return Array.isArray(a) ? a.filter((x) => x && tkey(x.u)) : []; } catch { return []; } };
  const remember = (u) => {
    const k = tkey(u); if (!k) return;
    const a = [{ u: k.startsWith("bot:") ? "https://x.ai/bot/" + k.slice(4) : "https://x.ai/marketplace/bots/" + k.slice(4), at: Date.now() }, ...mine().filter((x) => tkey(x.u) !== k)];
    try { localStorage.setItem(SKEY, JSON.stringify(a.slice(0, MAX))); } catch {}
  };
  // Shelf data: the home page already loads it (shelfData in app.js). On /add it is fetched on the first keystroke in
  // the field, from the hashed URL in <meta name="shelf-data">, so the page itself stays light.
  const slug = (s) => String(s).toLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g, "").replace(/&/g, " and ").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  const own = () => { const m = document.querySelector('meta[name="shelf-data"]'); return fetch(m ? m.content : "/shelf-data.json").then((r) => r.json()).then((d) => d.bots).catch(() => null); };
  let byT = null, byN = null, readyP = null;
  const ready = () => readyP || (readyP = (typeof shelfData !== "undefined" ? shelfData : own()).then((bots) => {
    if (!bots) { readyP = null; return; }
    byT = new Map(); byN = new Map();
    for (const b of bots) { const k = tkey(b.url), n = nkey(b.name); if (k && !byT.has(k)) byT.set(k, b); if (n && !byN.has(n)) byN.set(n, b); }
  }));
  const link = (b) => `<a href="${esc(b._page || "/bot/" + slug(b.name))}">${esc(b.name)}</a>`;

  const f = document.getElementById("sub-form"), out = document.getElementById("sub-dupe"), okIcon = document.getElementById("sub-ok");
  if (f && out) {
    let t = 0, last = null;
    const check = () => {
      const v = f.bot_url.value, k = urlish(v) ? tkey(v) : "", n = !urlish(v) ? nkey(v) : "";
      const hit = k && byT && byT.get(k), sent = !hit && k && byT && mine().some((x) => tkey(x.u) === k);
      const hint = !hit && !sent && n && byN && byN.get(n);
      const html = hit ? `Already on the shelf: ${link(hit)}`
        : sent ? "You suggested this already. It's not on the shelf yet. Recent approvals can take a few minutes to appear."
        : hint ? `A bot named ${link(hint)} is already on the shelf.` : "";
      // A valid template link that is new to the shelf and this device: just a green check in the field
      const fresh = !html && k && byT ? '<span class="sr">Not on the shelf yet</span>' : "";
      if (okIcon) okIcon.classList.toggle("on", !!fresh);
      if (html + fresh === last) return; last = html + fresh;
      out.innerHTML = html || fresh; out.className = "sub-dupe" + (hit ? " dupe-hit" : sent ? " dupe-sent" : hint ? " dupe-hint" : fresh ? " dupe-new" : "");
    };
    const soon = () => { clearTimeout(t); t = setTimeout(check, 120); };
    f.bot_url.addEventListener("input", () => { soon(); if (!byT) ready().then(() => { if (f.bot_url.value.trim()) check(); }); });
    f.addEventListener("reset", () => setTimeout(check, 0));
    // Messages appear only in response to typing or pasting. If the shelf data arrives after the person
    // has already typed, check once then; an empty field never renders anything on load.
    if (typeof shelfData !== "undefined") ready().then(() => { if (f.bot_url.value.trim()) check(); });
  }
  return { remember };
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
          addCheck.remember(bot);
          if (d.status !== "already_listed") f.reset();
          if (window.va) window.va("event", { name: "submit_bot" });
        } else show(d.error || "That did not go through. Try again in a minute.", "err");
      })
      .catch(function () { show("That did not go through. Try again in a minute.", "err"); })
      .then(function () { go.disabled = false; });
  });
})();
