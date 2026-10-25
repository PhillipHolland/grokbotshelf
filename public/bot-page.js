// Per-bot pages: "Add to Bot app" opens grokbot://; on phones, fall back to the x.ai page if the app does not open.
// Badge snippets: Copy buttons copy the text of the <pre> named in data-copy.
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
