// Back to top: a small floating button, bottom-right. It appears once the page has scrolled past ~500px (so short pages
// never show it), hides again near the top, and scrolls smoothly to the top (instantly with prefers-reduced-motion).
// Keyboard activation moves focus to the page's h1 so focus isn't left on a button that just hid itself.
(function () {
  var SHOW = 500, HIDE = 300;
  var b = document.createElement("button");
  b.type = "button"; b.className = "to-top"; b.setAttribute("aria-label", "Back to top"); b.title = "Back to top";
  b.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 19V5"/><path d="m6 11 6-6 6 6"/></svg>';
  b.hidden = true; b.tabIndex = -1;
  document.body.append(b);
  var on = false, raf = 0, still = matchMedia("(prefers-reduced-motion: reduce)");
  function sync() {
    raf = 0;
    var y = window.scrollY || document.documentElement.scrollTop;
    var next = on ? y > HIDE : y > SHOW;
    if (next === on) return;
    on = next; b.hidden = false; b.tabIndex = on ? 0 : -1;
    b.classList.toggle("show", on);
  }
  window.addEventListener("scroll", function () { if (!raf) raf = requestAnimationFrame(sync); }, { passive: true });
  b.addEventListener("click", function (e) {
    window.scrollTo({ top: 0, behavior: still.matches ? "auto" : "smooth" });
    if (e.detail === 0) {
      var h = document.querySelector("main h1, h1");
      if (h) { if (!h.hasAttribute("tabindex")) h.setAttribute("tabindex", "-1"); h.focus({ preventScroll: true }); }
    }
  });
  sync();
})();
