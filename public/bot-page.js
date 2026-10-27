// Per-bot pages: "Add to Bot app" opens grokbot://; on phones, fall back to the x.ai page if the app does not open.
// Badge snippets: Copy buttons copy the text of the <pre> named in data-copy.
// get_bot: same conversion as the homepage cards. Mark it as a key event in GA4 Admin →
// Data display → Events → get_bot → Mark as key event. No-op unless the production GA snippet defined gtag.
(function () {
  document.addEventListener("click", function (e) {
    var a = e.target.closest && e.target.closest(".bp-actions a.get, .bp-actions a.app");
    if (!a || typeof gtag !== "function") return;
    var card = a.closest("article");
    var raw = card ? (card.getAttribute("data-slug") || "") : "";
    gtag("event", "get_bot", {
      bot_slug: raw.replace(/^bot-/, ""),
      destination: a.classList.contains("app") ? "app" : "x.ai",
      transport_type: "beacon"
    });
  });
})();
(function () {
  var mobile = document.documentElement.classList.contains("mobile");
  document.addEventListener("click", function (e) {
    var a = e.target.closest && e.target.closest("a.app[data-web]");
    if (!a || !mobile) return;
    e.preventDefault();
    var web = a.getAttribute("data-web");
    var t = setTimeout(function () { if (document.visibilityState === "visible") window.location.href = web; }, 1500);
    document.addEventListener("visibilitychange", function h() {
      if (document.visibilityState === "hidden") { clearTimeout(t); document.removeEventListener("visibilitychange", h); }
    });
    window.location.href = a.getAttribute("href");
  });
})();
(function () {
  document.addEventListener("click", function (e) {
    var b = e.target.closest && e.target.closest("button[data-copy]");
    if (!b) return;
    var t = document.getElementById(b.getAttribute("data-copy")).textContent;
    var done = function () { b.textContent = "Copied"; setTimeout(function () { b.textContent = "Copy"; }, 1500); };
    if (navigator.clipboard && window.isSecureContext) navigator.clipboard.writeText(t).then(done, fallback); else fallback();
    function fallback() {
      var ta = document.createElement("textarea"); ta.value = t; ta.setAttribute("readonly", ""); ta.style.position = "fixed"; ta.style.opacity = "0";
      document.body.appendChild(ta); ta.select();
      try { if (document.execCommand("copy")) done(); } catch (err) {}
      document.body.removeChild(ta);
    }
  });
})();
// Up/down vote on the bot page: same /api/votes, same gbs_vid cookie and gbs_votes localStorage as the homepage cards.
(function () {
  var el = document.querySelector(".bp-vote[data-vote]");
  if (!el) return;
  var slug = el.getAttribute("data-vote"), KEY = "gbs_votes", mine = {}, s = { up: 0, down: 0, score: 0 }, global = false, busy = false;
  var toast = document.createElement("div"), tt; toast.className = "toast"; toast.setAttribute("role", "status"); toast.setAttribute("aria-live", "polite"); document.body.appendChild(toast);
  var say = function (msg, ms) { toast.textContent = msg; toast.classList.add("show"); clearTimeout(tt); tt = setTimeout(function () { toast.classList.remove("show"); }, ms || 1800); };
  try { mine = JSON.parse(localStorage.getItem(KEY) || "{}") || {}; } catch (e) {}
  var save = function () { try { localStorage.setItem(KEY, JSON.stringify(mine)); } catch (e) {} };
  function paint() {
    var v = mine[slug] || 0;
    el.querySelector(".up").setAttribute("aria-pressed", String(v === 1));
    el.querySelector(".dn").setAttribute("aria-pressed", String(v === -1));
    el.querySelector(".vn").textContent = String(global ? s.score : 0); // always a number, like the cards: the shared tally, 0 until someone votes or while it is offline
    el.title = !global ? "Your vote is saved in this browser" : s.up + s.down ? s.up + " up, " + s.down + " down" : "No votes yet. Be the first";
  }
  paint();
  // One announcement per vote through the (hidden) status toast; the count itself is not a live region
  var name = (el.querySelector(".up").getAttribute("aria-label") || "").replace(/^Upvote /, "") || "this bot";
  var sayVote = function (to) { toast.textContent = (to === 1 ? "Upvoted " + name : to === -1 ? "Downvoted " + name : "Vote removed from " + name) + (global ? ", score " + s.score : ", saved in this browser"); };
  var hasMine = Object.keys(mine).length > 0;
  fetch("/api/votes?slug=" + encodeURIComponent(slug) + (hasMine ? "&mine=1" : ""), { credentials: "same-origin" })
    .then(function (r) { return r.ok ? r.json() : null; })
    .then(function (d) {
      if (!d || !d.global) return;
      global = true; s = (d.scores && d.scores[slug]) || s;
      if (d.mine) { mine = d.mine; save(); }
      paint();
    }).catch(function () {});
  el.addEventListener("click", function (e) {
    var b = e.target.closest(".vb"); if (!b || busy) return;
    var dir = Number(b.getAttribute("data-v")), from = mine[slug] || 0, to = from === dir ? 0 : dir, prev = { up: s.up, down: s.down, score: s.score };
    if (to) mine[slug] = to; else delete mine[slug];
    s = { up: s.up - (from === 1) + (to === 1), down: s.down - (from === -1) + (to === -1) }; s.score = s.up - s.down;
    save(); paint();
    if (!global) return sayVote(to);
    busy = true;
    var undo = function () { if (from) mine[slug] = from; else delete mine[slug]; s = prev; save(); paint(); };
    fetch("/api/votes", { method: "POST", headers: { "Content-Type": "application/json" }, credentials: "same-origin", body: JSON.stringify({ slug: slug, value: to }) })
      .then(function (r) { return r.json().catch(function () { return {}; }).then(function (d) { return { r: r, d: d }; }); })
      .then(function (x) {
        if (x.r.ok && x.d.global) { s = { up: x.d.up, down: x.d.down, score: x.d.score }; paint(); sayVote(to); }
        else if (x.r.status === 503) { global = false; paint(); sayVote(to); }
        else {
          undo();
          var cap = x.r.status === 429 && /^cap_/.test(x.d.code || "") && x.d.error; // vote caps carry a sentence for people
          el.title = cap || (x.r.status === 429 ? "Too many votes, try again in a minute" : "Vote did not save, try again");
          say(el.title, cap ? 6000 : 1800);
        }
      }, undo)
      .then(function () { busy = false; });
  });
})();
