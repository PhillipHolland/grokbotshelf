// Jump-to-top: a small floating button, bottom-right (left of the A-Z rail on phones). It appears once the page has
// scrolled about half a viewport (on touch phones only once you scroll back up, round 3 #4) (clamped 300-600px; recomputed on resize), hides again near the top, and scrolls smoothly to the top
// (instantly with prefers-reduced-motion). Keyboard activation moves focus to the page's h1.
//
// Names are deliberately neutral: Fanboy's Annoyance list (EasyList Annoyances, shipped in AdGuard, 1Blocker, Wipr and
// other iOS Safari content blockers) has generic rules like ##[aria-label="Back to top"], ##.back-to-top and
// ##.to-top on many sites, which silently hid the old .to-top / "Back to top" button on real iPhones while headless
// Chrome (no blocker) passed. So: class .gbs-up, aria-label "Jump to top", file shelf-up.js.
//
// Placement: on iOS Safari position:fixed;bottom is measured from the layout viewport, which the floating URL bar /
// toolbar can cover. place() reads window.visualViewport and sets an inline bottom of (layout height - visible bottom
// edge) + margin, so the button always sits just above whatever chrome covers the bottom. CSS bottom is the fallback.
(function () {
  try {
    var MARGIN = 16;
    // Show after ~half a viewport (clamped 300-600px), hide at 60% of that; recomputed each sync so resize stays honest.
    function show() { var h = window.innerHeight || de.clientHeight || 800; return Math.min(600, Math.max(300, Math.round(h * 0.5))); }
    var de = document.documentElement;
    var b = document.createElement("button");
    b.type = "button"; b.className = "gbs-up"; b.setAttribute("aria-label", "Jump to top");
    b.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 19V5"/><path d="m6 11 6-6 6 6"/></svg>';
    b.tabIndex = -1; b.setAttribute("aria-hidden", "true");
    (document.body || de).appendChild(b);
    var on = false, raf = 0, mq = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)");
    var narrow = window.matchMedia && window.matchMedia("(max-width:1199px)");
    function y() { return window.pageYOffset || window.scrollY || de.scrollTop || (document.body && document.body.scrollTop) || 0; }
    // Inline bottom/right so iOS chrome over the layout viewport can't hide it; CSS keeps the look and the fallback.
    function place() {
      var vv = window.visualViewport;
      var lh = window.innerHeight || de.clientHeight || 0;
      // How much of the layout viewport's bottom is outside the visible (visual) viewport: toolbar, URL bar, keyboard.
      var hidden = vv ? Math.max(0, lh - (vv.height + vv.offsetTop)) : 0;
      if (narrow && narrow.matches) {
        // Phones: at least the CSS fallback lift (clears an expanded floating URL bar even if vv under-reports it)
        // The floating Tokens button (below) takes the 68-112px slot; this one sits a step above it
        var base = Math.max(120, (hidden + MARGIN + (de.classList.contains("has-cup") ? 52 : 0)));
        b.style.bottom = "calc(" + base + "px + env(safe-area-inset-bottom))";
        b.style.right = de.classList.contains("has-rail") ? "calc(max(0px, env(safe-area-inset-right)) + 44px)" : "";
      } else {
        b.style.bottom = hidden ? (hidden + MARGIN + (de.classList.contains("has-cup") ? 48 : 0)) + "px" : "";
        b.style.right = "";
      }
    }
    function paint() {
      // Inline opacity/visibility too, so a stale or overridden stylesheet can't leave a shown button invisible.
      b.style.opacity = on ? "1" : "0";
      b.style.visibility = on ? "visible" : "hidden";
      b.style.pointerEvents = on ? "auto" : "none";
      if (on) de.setAttribute("data-totop", "1"); else de.removeAttribute("data-totop");
    }
    // Touch phones: only after a scroll up (like Safari's own bar), hidden again on the next scroll down, so it never
    // sits on a card's "Get this bot" while you read down the shelf. Mouse and keyboard keep the plain threshold.
    var coarse = window.matchMedia && window.matchMedia("(hover: none) and (pointer: coarse)");
    var lastY = y(), upBy = 0, UP = 24, DOWN = 6;
    function sync() {
      raf = 0;
      var S = show(), top = y(), next = on ? top > Math.round(S * 0.6) : top > S, d = top - lastY;
      lastY = top;
      if (de.classList.contains("mobile") || (coarse && coarse.matches)) {
        if (d < 0) upBy -= d; else if (d > DOWN) upBy = 0;
        var held = document.activeElement === b;
        if (next && !held) next = on ? !(d > DOWN) : upBy >= UP;
        if (!next) upBy = d < 0 ? upBy : 0;
      }
      if (next !== on) {
        on = next; b.tabIndex = on ? 0 : -1;
        if (on) b.removeAttribute("aria-hidden"); else b.setAttribute("aria-hidden", "true");
        b.classList.toggle("show", on);
        paint();
      }
      if (on) place();
    }
    function queue() { if (!raf) raf = window.requestAnimationFrame ? window.requestAnimationFrame(sync) : setTimeout(sync, 16); }
    window.addEventListener("scroll", queue, { passive: true });
    document.addEventListener("scroll", queue, { passive: true });
    window.addEventListener("resize", queue);
    window.addEventListener("orientationchange", queue);
    window.addEventListener("pageshow", queue);
    if (window.visualViewport) { window.visualViewport.addEventListener("scroll", queue); window.visualViewport.addEventListener("resize", queue); }
    b.addEventListener("click", function (e) {
      var smooth = !(mq && mq.matches);
      try { window.scrollTo({ top: 0, behavior: smooth ? "smooth" : "auto" }); } catch (_) { window.scrollTo(0, 0); }
      if (e.detail === 0) {
        var h = document.querySelector("main h1, h1");
        if (h) { if (!h.hasAttribute("tabindex")) h.setAttribute("tabindex", "-1"); try { h.focus({ preventScroll: true }); } catch (_) { h.focus(); } }
      }
    });
    paint(); place(); sync();
  } catch (err) { if (window.console) console.error("shelf-up:", err); }
})();
// Bot, creator and 404 pages: the same light/dark toggle as the home page (the home page wires its own in app.js).
// The inline head script already applied the saved theme; this keeps the button, theme-color and storage in step.
(function () {
  try {
    var b = document.getElementById("theme"), root = document.documentElement;
    if (!b || !document.body || !document.body.classList.contains("botpage")) return;
    function apply(t) {
      root.setAttribute("data-theme", t);
      var tc = document.querySelector('meta[name="theme-color"]'), cs = document.querySelector('meta[name="color-scheme"]');
      if (tc) tc.content = t === "light" ? "#ffffff" : "#000000";
      if (cs) cs.content = t;
      b.setAttribute("aria-pressed", String(t === "dark"));
    }
    apply(root.getAttribute("data-theme") === "light" ? "light" : "dark");
    b.addEventListener("click", function () {
      var next = root.getAttribute("data-theme") === "light" ? "dark" : "light";
      root.classList.add("theme-switching"); apply(next); getComputedStyle(root).color;
      requestAnimationFrame(function () { root.classList.remove("theme-switching"); });
      try { localStorage.setItem("theme", next); } catch (e) {}
    });
  } catch (e) {}
})();
// Tip card + floating Tokens button (scripts/tip.js builds the card into every footer as #tip).
// Chips only copy a dollar amount: the X Money pay link opens a transfer to @Phil_Holland but cannot preset the amount,
// so the visitor types it in X. The pay link is the https URL everywhere (a Universal Link / App Link, so phones with
// the X app open it there); on phones it opens in the same tab so that hand-off happens, on desktop in a new tab.
// The button sits bottom-right and opens the same card in a small panel (over a scrim on phones and tablets). It stays
// put while you scroll (Oct 31: it used to hide on scroll down; Phil wants it always there) and only steps away while
// the footer card itself is on screen, so the ask never shows twice. On phones with the A-Z rail it sits in the rail's
// column at the bottom (the rail ends above it), which is right of every card's "Get this bot", so it never covers one.
(function () {
  try {
    var card = document.getElementById("tip"), de = document.documentElement;
    if (!card || !document.body) return;
    var mobile = de.classList.contains("mobile");
    function track(name, params) { try { if (window.gtag) window.gtag("event", name, params || {}); } catch (e) {} }
    function copyText(t) {
      if (navigator.clipboard && window.isSecureContext) return navigator.clipboard.writeText(t);
      return new Promise(function (ok, no) {
        var a = document.createElement("textarea"); a.value = t; a.setAttribute("readonly", ""); a.style.position = "fixed"; a.style.opacity = "0";
        document.body.appendChild(a); a.select(); var r = false; try { r = document.execCommand("copy"); } catch (e) {} a.remove(); r ? ok() : no();
      });
    }
    var HINT = "Tap an amount to copy it. You\u2019ll type this in X: the pay link can\u2019t fill in an amount.";
    function wire(root, where) {
      var hint = root.querySelector(".tc-hint");
      root.querySelectorAll(".tc-go").forEach(function (a) {
        if (mobile) a.removeAttribute("target");
        a.addEventListener("click", function () { track("tip_click", { method: "x_money", placement: where }); });
      });
      root.querySelectorAll(".tc-amt").forEach(function (btn) {
        btn.addEventListener("click", function () {
          var n = btn.getAttribute("data-amt");
          root.querySelectorAll(".tc-amt").forEach(function (o) { o.setAttribute("aria-pressed", String(o === btn)); });
          var say = function (msg) { if (hint) hint.textContent = msg; };
          copyText(n).then(function () { say("Copied $" + n + ". You\u2019ll type this in X when it asks for the amount."); },
            function () { say("$" + n + " it is. You\u2019ll type this in X when it asks for the amount."); });
          track("tip_amount", { value: Number(n), currency: "USD", placement: where });
        });
      });
      if (hint) hint.textContent = HINT;
    }
    wire(card, "footer");

    var ICON = card.querySelector(".tc-cup");
    var b = document.createElement("button");
    b.type = "button"; b.className = "gbs-cup";
    b.setAttribute("aria-label", "Buy us some Tokens (tip with X Money)");
    b.setAttribute("aria-expanded", "false"); b.setAttribute("aria-controls", "gbs-cup-pop");
    b.innerHTML = (ICON ? ICON.outerHTML : "") + '<span class="lbl"><span class="lbl-l">Buy us some </span>Tokens</span>';
    var pop = document.createElement("div");
    pop.className = "gbs-cup-pop"; pop.id = "gbs-cup-pop"; pop.hidden = true;
    pop.setAttribute("role", "dialog"); pop.setAttribute("aria-label", "Buy us some Tokens");
    var clone = card.cloneNode(true);
    clone.removeAttribute("id"); clone.removeAttribute("aria-labelledby");
    var h = clone.querySelector("h2"); if (h) { h.removeAttribute("id"); h.setAttribute("tabindex", "-1"); }
    clone.querySelectorAll("img[loading]").forEach(function (i) { i.removeAttribute("loading"); });
    pop.innerHTML = '<button type="button" class="gbs-cup-x" aria-label="Close"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18"/></svg></button>';
    pop.appendChild(clone);
    var scrim = document.createElement("div");
    scrim.className = "gbs-cup-scrim"; scrim.hidden = true; scrim.setAttribute("aria-hidden", "true");
    document.body.appendChild(scrim); document.body.appendChild(pop); document.body.appendChild(b);
    de.classList.add("has-cup");
    wire(clone, "float");

    var open = false;
    function setOpen(v, focusBack) {
      open = v; pop.hidden = !v; scrim.hidden = !v; b.setAttribute("aria-expanded", String(v));
      if (v) { track("tip_open", { placement: "float" }); var t = clone.querySelector("h2"); if (t) try { t.focus({ preventScroll: true }); } catch (e) { t.focus(); } sync(); }
      else { sync(); if (focusBack && !b.classList.contains("away")) b.focus(); }
    }
    b.addEventListener("click", function () { setOpen(!open, false); });
    pop.querySelector(".gbs-cup-x").addEventListener("click", function () { setOpen(false, true); });
    document.addEventListener("keydown", function (e) { if (open && e.key === "Escape") setOpen(false, true); });
    // Outside tap: on phones it lands on the scrim (closes on click, so the tap never reaches a card behind it);
    // on desktop, where there is no scrim, any pointerdown outside closes
    scrim.addEventListener("click", function () { setOpen(false, false); });
    document.addEventListener("pointerdown", function (e) { if (open && e.target !== scrim && !pop.contains(e.target) && !b.contains(e.target)) setOpen(false, false); }, true);

    // Visibility: always shown, except while the footer card is on screen (no hide on scroll)
    var cardSeen = false, raf = 0;
    var narrow = window.matchMedia && window.matchMedia("(max-width:1199px)");
    var phone = window.matchMedia && window.matchMedia("(max-width:640px)");
    function place() {
      // Phones: like .gbs-up, sit above whatever browser chrome covers the bottom of the layout viewport
      if (!(narrow && narrow.matches)) { b.style.bottom = ""; pop.style.bottom = ""; pop.style.maxHeight = ""; de.style.removeProperty("--cup-clear"); return; }
      var vv = window.visualViewport, lh = window.innerHeight || de.clientHeight || 0;
      var hidden = vv ? Math.max(0, lh - (vv.height + vv.offsetTop)) : 0, base = Math.max(68, hidden + 16);
      b.style.bottom = "calc(" + base + "px + env(safe-area-inset-bottom))";
      pop.style.bottom = "calc(" + (base + 56) + "px + env(safe-area-inset-bottom))";
      // Phones with the rail: the rail stops 8px above the button (styles.css reads --cup-clear)
      if (phone && phone.matches && de.classList.contains("has-rail")) de.style.setProperty("--cup-clear", (base + 48) + "px");
      else de.style.removeProperty("--cup-clear");
      // The panel is a sheet over a scrim: it may rise over the sticky dock (z 45 > 20) up to 12px under the top of the
      // visible screen, so the whole card, CTA included, fits on a 390px phone; only very short screens scroll inside
      if (open) {
        var visTop = vv ? vv.offsetTop : 0, visBottom = vv ? vv.height + vv.offsetTop : lh;
        var pb = pop.getBoundingClientRect().bottom || (visBottom - base - 56);
        pop.style.maxHeight = "calc(" + Math.max(240, Math.round(pb - visTop - 12)) + "px - env(safe-area-inset-top))";
      }
    }
    function sync() {
      raf = 0;
      var away = !open && cardSeen;
      b.classList.toggle("away", away);
      b.tabIndex = away ? -1 : 0;
      if (away) b.setAttribute("aria-hidden", "true"); else b.removeAttribute("aria-hidden");
      place();
    }
    function queue() { if (!raf) raf = window.requestAnimationFrame ? window.requestAnimationFrame(sync) : setTimeout(sync, 16); }
    if (window.IntersectionObserver) new IntersectionObserver(function (es) { cardSeen = es[0].isIntersecting && es[0].intersectionRatio > 0; queue(); }, { threshold: [0, 0.01] }).observe(card);
    window.addEventListener("scroll", queue, { passive: true });
    window.addEventListener("resize", queue);
    if (window.visualViewport) { window.visualViewport.addEventListener("resize", queue); window.visualViewport.addEventListener("scroll", queue); }
    sync();
  } catch (err) { if (window.console) console.error("shelf-up tip:", err); }
})();
// Gift Grok Bot (header .gift-top): the shelf has two hosts, so the referral code alternates by calendar day,
// Phil on even days and Nick (@thecsguy) on odd days (days since 1970-01-01 in the viewer's local time). Every page
// shows the same code all day, and the static HTML (Phil's code) stays the no-JS fallback. Re-picked on click so
// a tab left open past midnight still follows the rotation.
(function () {
  try {
    var CODES = ["K9VPNSANC263", "XFD9MZ5RKTT6"]; // Phil, Nick
    function url() {
      var now = new Date(), day = Math.floor((now.getTime() - now.getTimezoneOffset() * 60000) / 864e5);
      return "https://grok.com/refer/bot?code=" + CODES[((day % 2) + 2) % 2];
    }
    function set() { var as = document.querySelectorAll("a.gift-top"); for (var i = 0; i < as.length; i++) as[i].href = url(); }
    set();
    document.addEventListener("click", function (e) {
      var a = e.target && e.target.closest && e.target.closest("a.gift-top");
      if (a) a.href = url();
    }, true);
  } catch (err) { if (window.console) console.error("shelf-up gift:", err); }
})();
// pair_click: Amazon "Pairs with" on homepage cards, creator lists, job hubs, and bot pages.
// One listener so a page that loads this file does not double-count. surface is home, creator,
// collection, or bot. No-op unless the production GA snippet defined gtag.
(function () {
  document.addEventListener("click", function (e) {
    var a = e.target && e.target.closest && e.target.closest("a.pair");
    if (!a || typeof gtag !== "function") return;
    var pos = Number(a.getAttribute("data-position"));
    gtag("event", "pair_click", {
      bot_slug: a.getAttribute("data-bot") || "",
      product_id: a.getAttribute("data-product") || "",
      position: pos > 0 ? pos : undefined,
      surface: a.getAttribute("data-surface") || "",
      transport_type: "beacon"
    });
  });
})();
