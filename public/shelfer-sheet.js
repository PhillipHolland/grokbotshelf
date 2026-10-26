// First-visit promo sheet for Shelfer (Liquid Glass). Shown once per browser on the home page, then never again.
// Seen state: localStorage "shelfer-sheet" plus a 1-year "shelfer_sheet" cookie (either one suppresses it).
// Skipped on deep links (#hash), for automation (navigator.webdriver), and when either flag is set.
// Preview on demand: /?sheet=shelfer (ignores the seen flag).
(function () {
  "use strict";
  var KEY = "shelfer-sheet", CK = "shelfer_sheet", FALLBACK = "https://x.ai/bot/PkJM_w44LhHGmBnqCG_gi";
  var force = /[?&]sheet=shelfer\b/.test(location.search);

  function seen() {
    try { if (localStorage.getItem(KEY)) return true; } catch (e) {}
    return document.cookie.split("; ").some(function (c) { return c.indexOf(CK + "=") === 0; });
  }
  function remember(how) {
    try { localStorage.setItem(KEY, JSON.stringify({ v: 1, how: how, at: new Date().toISOString() })); } catch (e) {}
    try { document.cookie = CK + "=1; max-age=31536000; path=/; SameSite=Lax" + (location.protocol === "https:" ? "; Secure" : ""); } catch (e) {}
  }

  if (!force) {
    if (seen()) return;
    if (location.pathname !== "/" || location.hash) return;
    if (navigator.webdriver) return;
  }

  var url = String(window.SHELFER_URL || "").trim();
  if (!/^https:\/\/x\.ai\/bot\//.test(url)) url = FALLBACK;

  var reduce = matchMedia("(prefers-reduced-motion: reduce)");
  var mark = '<svg viewBox="0 0 16 16" aria-hidden="true" focusable="false"><rect x="1" y="2" width="14" height="2.4" rx=".6"/><rect x="1" y="6.8" width="10" height="2.4" rx=".6"/><rect x="1" y="11.6" width="12" height="2.4" rx=".6"/></svg>';
  var ic = function (d) { return '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">' + d + "</svg>"; };
  var html =
    '<div class="ss-scrim" data-ss-close="scrim"></div>' +
    '<div class="ss-aura" aria-hidden="true"><i></i><i></i><i></i></div>' +
    '<div class="ss-sheet" role="dialog" aria-modal="true" aria-labelledby="ss-h" aria-describedby="ss-d" tabindex="-1">' +
      '<div class="ss-grab" aria-hidden="true"></div>' +
      '<button type="button" class="ss-x" data-ss-close="x" aria-label="Close">' + ic('<path d="M6 6l12 12M18 6 6 18"/>') + "</button>" +
      '<div class="ss-top">' +
        '<div class="ss-tile">' + mark + "</div>" +
        '<p class="ss-eye"><span class="ss-dot" aria-hidden="true"></span>New on the shelf</p>' +
      "</div>" +
      '<h2 id="ss-h">Shelf your bot<br><span>in one paste.</span></h2>' +
      '<p id="ss-d" class="ss-lede">Shelfer is a Grok Bot template that submits bots to this shelf for you. Hand it an x.ai/bot link and it takes care of the rest.</p>' +
      '<ol class="ss-steps">' +
        "<li>" + ic('<path d="M12 4v11"/><path d="m7 10 5 5 5-5"/><path d="M5 20h14"/>') + "<div><b>Import Shelfer</b><span>One tap from its template page</span></div></li>" +
        "<li>" + ic('<path d="M10 14a4 4 0 0 0 5.66 0l3-3a4 4 0 0 0-5.66-5.66l-1 1"/><path d="M14 10a4 4 0 0 0-5.66 0l-3 3a4 4 0 0 0 5.66 5.66l1-1"/>') + "<div><b>Paste your template link</b><span>Add your X post too, if you have one</span></div></li>" +
        "<li>" + ic('<path d="M9 12.5l2 2 4-4.5"/><path d="M12 3l7 3v5c0 4.5-3 8.2-7 10-4-1.8-7-5.5-7-10V6z"/>') + "<div><b>Checked and queued</b><span>Dedup and link check, then a human review</span></div></li>" +
      "</ol>" +
      '<div class="ss-actions">' +
        '<a class="ss-cta" href="' + url.replace(/"/g, "&quot;") + '" rel="noopener" target="_blank" data-ss-close="cta">Get Shelfer' + ic('<path d="M7 17 17 7"/><path d="M8 7h9v9"/>') + "</a>" +
        '<button type="button" class="ss-later" data-ss-close="later">Not now</button>' +
      "</div>" +
      '<p class="ss-fine">Free template by <a href="https://x.com/Phil_Holland" rel="noopener" target="_blank">@Phil_Holland</a> · Not affiliated with SpaceXSI.</p>' +
    "</div>";

  var root, sheet, lastFocus, inerted = [], open = false, tries = 0;

  function focusables() {
    return Array.prototype.filter.call(sheet.querySelectorAll("a[href],button:not([disabled])"), function (el) { return el.offsetParent !== null; });
  }
  function onKey(e) {
    if (!open) return;
    if (e.key === "Escape") { e.preventDefault(); e.stopImmediatePropagation(); close("esc"); return; }
    if (e.key === "Tab") {
      var f = focusables(); if (!f.length) return;
      var first = f[0], last = f[f.length - 1], a = document.activeElement;
      if (e.shiftKey && (a === first || a === sheet || !sheet.contains(a))) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && (a === last || !sheet.contains(a))) { e.preventDefault(); first.focus(); }
      return;
    }
    // Keep the page's shortcuts (⌘K, /, arrows) from acting behind the sheet
    if ((e.key === "k" && (e.metaKey || e.ctrlKey)) || e.key === "/" || /^Arrow/.test(e.key)) e.stopImmediatePropagation();
  }

  function show() {
    if (open || (!force && seen())) return;
    var a = document.activeElement;
    // Never pop over someone already typing or picking a filter; try again shortly, give up after a few tries
    if (a && /INPUT|SELECT|TEXTAREA/.test(a.tagName) && a.closest && !a.closest(".ss")) {
      if (++tries < 6) setTimeout(show, 2500);
      return;
    }
    root = document.createElement("div");
    root.className = "ss";
    root.innerHTML = html;
    document.body.appendChild(root);
    sheet = root.querySelector(".ss-sheet");
    lastFocus = document.activeElement;
    Array.prototype.forEach.call(document.body.children, function (el) {
      if (el !== root && el.tagName !== "SCRIPT" && !el.classList.contains("toast") && !el.inert) { el.inert = true; el.setAttribute("aria-hidden", "true"); inerted.push(el); }
    });
    document.documentElement.classList.add("ss-lock");
    open = true;
    remember("shown");
    document.addEventListener("keydown", onKey, true);
    root.addEventListener("click", function (e) {
      var t = e.target.closest && e.target.closest("[data-ss-close]");
      if (t) {
        var how = t.getAttribute("data-ss-close");
        if (how === "cta") { try { window.va && window.va("event", { name: "shelfer_sheet_cta" }); } catch (x) {} }
        close(how);
      }
    });
    drag();
    if (sheet.scrollHeight <= sheet.clientHeight + 1) sheet.style.touchAction = "none";
    requestAnimationFrame(function () { requestAnimationFrame(function () {
      root.classList.add("in");
      sheet.focus({ preventScroll: true }); // the dialog itself; Tab moves to Close, Get Shelfer, Not now
    }); });
  }

  function close(how) {
    if (!open) return;
    open = false;
    remember(how || "dismiss");
    document.removeEventListener("keydown", onKey, true);
    inerted.forEach(function (el) { el.inert = false; el.removeAttribute("aria-hidden"); });
    inerted = [];
    document.documentElement.classList.remove("ss-lock");
    sheet.style.transform = "";
    root.classList.remove("in");
    root.classList.add("out");
    var r = root, done = function () { if (r.parentNode) r.parentNode.removeChild(r); };
    if (reduce.matches) setTimeout(done, 180); else { sheet.addEventListener("transitionend", done, { once: true }); setTimeout(done, 700); }
    if (lastFocus && lastFocus.focus && document.contains(lastFocus) && lastFocus !== document.body) { try { lastFocus.focus({ preventScroll: true }); } catch (x) {} }
  }

  // Swipe the sheet down to dismiss (touch, bottom-sheet layout). Starts only on the grabber or top band, never on buttons.
  function drag() {
    var y0 = null, dy = 0, t0 = 0;
    sheet.addEventListener("pointerdown", function (e) {
      if (e.pointerType !== "touch" || e.target.closest("a,button")) return;
      if (e.clientY - sheet.getBoundingClientRect().top > 96 || sheet.scrollTop > 0) return;
      if (!matchMedia("(max-width:639px)").matches) return;
      y0 = e.clientY; dy = 0; t0 = Date.now(); sheet.classList.add("drag");
    });
    sheet.addEventListener("pointermove", function (e) {
      if (y0 === null) return;
      dy = Math.max(0, e.clientY - y0);
      sheet.style.transform = "translateY(" + dy + "px)";
    });
    var end = function () {
      if (y0 === null) return;
      y0 = null; sheet.classList.remove("drag");
      var fast = dy / Math.max(1, Date.now() - t0) > 0.6;
      if (dy > 110 || (fast && dy > 40)) close("swipe"); else sheet.style.transform = "";
    };
    sheet.addEventListener("pointerup", end);
    sheet.addEventListener("pointercancel", end);
  }

  function arm() { setTimeout(show, force ? 300 : 1100); }
  if (document.readyState === "complete") arm(); else window.addEventListener("load", arm, { once: true });
})();
