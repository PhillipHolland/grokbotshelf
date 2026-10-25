// Per-bot pages: "Add to Bot app" opens grokbot://; on phones, fall back to the x.ai page if the app does not open.
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
