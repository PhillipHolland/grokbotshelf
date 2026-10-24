(() => {
  const $ = (s) => document.querySelector(s);
  const state = { q: "", creator: "all", cat: "all" };
  let bots = [];

  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const norm = (s) => String(s).toLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g, "");
  const arrow = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 17 17 7M9 7h8v8"/></svg>';
  const code = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m8 7-5 5 5 5M16 7l5 5-5 5"/></svg>';
  const post = '<svg viewBox="0 0 24 24" aria-hidden="true" style="fill:currentColor;stroke:none"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/></svg>';

  // Launch post link: set in config.js. Plain text until it's set.
  const launch = (window.LAUNCH_POST_URL || "").trim();
  if (launch) {
    $("#add-text").innerHTML = 'Reply to the <a href="' + esc(launch) + '" rel="noopener">launch post on X</a> with your x.ai/bot link and a one-line description, and it gets reviewed and added.';
  }

  const creators = () => {
    const m = new Map();
    for (const b of bots) if (!m.has(b.creator_url)) m.set(b.creator_url, { name: b.creator_name, handle: b.creator_handle, url: b.creator_url, n: 0 });
    for (const b of bots) m.get(b.creator_url).n++;
    return [...m.values()];
  };
  const label = (c) => (c.name === "Phillip Holland" ? c.name : c.name + " (" + c.handle + ")");

  function chips() {
    const cs = creators();
    $("#creators").innerHTML =
      chip("creator", "all", "All creators", bots.length) + cs.map((c) => chip("creator", c.url, label(c), c.n)).join("");
    const cats = [...new Set(bots.map((b) => b.category))].sort();
    $("#cats").innerHTML = chip("cat", "all", "All categories") + cats.map((c) => chip("cat", c, c, bots.filter((b) => b.category === c).length)).join("");
  }
  function chip(kind, val, text, n) {
    const on = state[kind] === val;
    return `<button class="chip" type="button" data-kind="${kind}" data-val="${esc(val)}" aria-pressed="${on}">${esc(text)}${n != null ? ` <small>${n}</small>` : ""}</button>`;
  }

  function card(b, i) {
    return `<article class="card" style="animation-delay:${Math.min(i, 12) * 30}ms" data-name="${esc(b.name)}">
  <div class="top"><div class="emoji" aria-hidden="true">${esc(b.emoji)}</div>
    <div><h3>${esc(b.name)}</h3><span class="tag">${esc(b.category)}</span></div></div>
  <p class="desc">${esc(b.description)}</p>
  <div class="meta">
    <span class="by">by <a href="${esc(b.creator_url)}" rel="noopener">${esc(b.creator_name)}</a></span>
    <span class="actions">
      ${b.code_url ? `<a class="ghost" href="${esc(b.code_url)}" rel="noopener" title="Source code" aria-label="${esc(b.name)} source code">${code}</a>` : ""}
      ${b.source_post ? `<a class="ghost" href="${esc(b.source_post)}" rel="noopener" title="Original post on X" aria-label="${esc(b.name)} original post on X">${post}</a>` : ""}
      <a class="get" href="${esc(b.url)}" rel="noopener" aria-label="Get ${esc(b.name)}">Get this bot ${arrow}</a>
    </span>
  </div>
</article>`;
  }

  function render() {
    const q = norm(state.q.trim());
    const hit = bots.filter((b) =>
      (state.creator === "all" || b.creator_url === state.creator) &&
      (state.cat === "all" || b.category === state.cat) &&
      (!q || norm([b.name, b.description, b.category, b.creator_name, b.creator_handle].join(" ")).includes(q)));
    let i = 0;
    $("#shelf").innerHTML = creators().map((c) => {
      const list = hit.filter((b) => b.creator_url === c.url);
      if (!list.length) return "";
      const initial = c.name.trim()[0].toUpperCase();
      return `<section class="group" aria-label="${esc(label(c))}">
  <div class="ghead"><div class="avatar${c.name === "Phillip Holland" ? "" : " alt"}" aria-hidden="true">${esc(initial)}</div>
    <div><h2>${esc(label(c))}</h2><p><a href="${esc(c.url)}" rel="noopener">${esc(c.handle)} on X</a> · ${list.length} bot${list.length === 1 ? "" : "s"}</p></div></div>
  <div class="grid">${list.map((b) => card(b, i++)).join("")}</div></section>`;
    }).join("");
    $("#empty").hidden = hit.length > 0;
    $("#count").textContent = hit.length === bots.length ? `${bots.length} bots on the shelf` : `Showing ${hit.length} of ${bots.length} bots`;
    chips();
  }

  document.addEventListener("click", (e) => {
    const c = e.target.closest(".chip");
    if (!c) return;
    state[c.dataset.kind] = c.dataset.val;
    render();
  });
  $("#q").addEventListener("input", (e) => { state.q = e.target.value; render(); });
  document.addEventListener("keydown", (e) => {
    if (e.key === "/" && document.activeElement !== $("#q")) { e.preventDefault(); $("#q").focus(); }
    if (e.key === "Escape" && document.activeElement === $("#q")) { $("#q").value = ""; state.q = ""; render(); }
  });
  const tb = $(".toolbar");
  new IntersectionObserver(([en]) => tb.classList.toggle("stuck", en.intersectionRatio < 1), { threshold: [1], rootMargin: "-1px 0px 0px 0px" }).observe(tb);

  fetch("/bots.json", { cache: "no-cache" })
    .then((r) => r.json())
    .then((data) => { bots = data; render(); })
    .catch(() => { $("#shelf").innerHTML = '<p class="empty">Couldn\'t load the shelf. Refresh to try again.</p>'; });
})();
