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
        var base = Math.max(120, (hidden + MARGIN));
        b.style.bottom = "calc(" + base + "px + env(safe-area-inset-bottom))";
        b.style.right = de.classList.contains("has-rail") ? "calc(max(0px, env(safe-area-inset-right)) + 44px)" : "";
      } else {
        b.style.bottom = hidden ? (hidden + MARGIN) + "px" : "";
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
