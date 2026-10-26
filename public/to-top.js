// Back to top: a small floating button, bottom-right (left of the A-Z rail on phones). It appears once the page has
// scrolled past ~400px (so short pages never show it), hides again near the top, and scrolls smoothly to the top
// (instantly with prefers-reduced-motion). Keyboard activation moves focus to the page's h1 so focus isn't left on a
// button that just hid itself. Visibility is only the .show class: no hidden attribute / display:none, which iOS Safari
// can fail to paint back in when it flips in the same frame as the opacity transition.
(function () {
  try {
    var SHOW = 400, HIDE = 250;
    var b = document.createElement("button");
    b.type = "button"; b.className = "to-top"; b.setAttribute("aria-label", "Back to top"); b.title = "Back to top";
    b.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 19V5"/><path d="m6 11 6-6 6 6"/></svg>';
    b.tabIndex = -1; b.setAttribute("aria-hidden", "true");
    (document.body || document.documentElement).appendChild(b);
    var on = false, raf = 0, mq = window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)");
    var de = document.documentElement;
    function y() { return window.pageYOffset || window.scrollY || de.scrollTop || (document.body && document.body.scrollTop) || 0; }
    function sync() {
      raf = 0;
      var top = y(), next = on ? top > HIDE : top > SHOW;
      if (next === on) return;
      on = next; b.tabIndex = on ? 0 : -1;
      if (on) b.removeAttribute("aria-hidden"); else b.setAttribute("aria-hidden", "true");
      b.classList.toggle("show", on);
    }
    function queue() { if (!raf) raf = (window.requestAnimationFrame || setTimeout)(sync); }
    window.addEventListener("scroll", queue, { passive: true });
    document.addEventListener("scroll", queue, { passive: true });
    window.addEventListener("resize", queue);
    window.addEventListener("pageshow", queue);
    if (window.visualViewport) { visualViewport.addEventListener("scroll", queue); visualViewport.addEventListener("resize", queue); }
    b.addEventListener("click", function (e) {
      var smooth = !(mq && mq.matches);
      try { window.scrollTo({ top: 0, behavior: smooth ? "smooth" : "auto" }); } catch (_) { window.scrollTo(0, 0); }
      if (e.detail === 0) {
        var h = document.querySelector("main h1, h1");
        if (h) { if (!h.hasAttribute("tabindex")) h.setAttribute("tabindex", "-1"); try { h.focus({ preventScroll: true }); } catch (_) { h.focus(); } }
      }
    });
    sync();
  } catch (err) { if (window.console) console.error("to-top:", err); }
})();
