// Renders a 1200x630 share image per bot into public/og/bot/<slug>.png, and per creator into
// public/og/creator/<handle, lowercase>.png, with headless Chrome, plus a 480x252 WebP of each bot card for the
// home page gallery view in public/og/thumb/<slug>.webp, and a 720x378 copy in public/og/thumb720/<slug>.webp that the
// gallery's srcset offers to 2x and 3x screens (the gallery shows "No share card yet" for a bot without a card).
// Only missing images are drawn unless you pass --all; a thumbnail is redrawn whenever its card is. Images of bots
// and creators that are gone are deleted. This is a manual step: the Vercel build (scripts/build.js) does not run it.
// Needs puppeteer-core outside the repo:
//   NODE_PATH=/workspace/bot-hub-test/node_modules node scripts/og.js [--all]
// Then run node scripts/build.js so the bot pages point at the new images.
const fs = require("fs"), path = require("path");
const puppeteer = require("puppeteer-core");
const { slugify } = require("./shelf");
const PUB = path.join(__dirname, "..", "public"), OUT = path.join(PUB, "og", "bot"), COUT = path.join(PUB, "og", "creator"), TOUT = path.join(PUB, "og", "thumb"), TOUT2 = path.join(PUB, "og", "thumb720");
const bots = JSON.parse(fs.readFileSync(path.join(PUB, "bots.json"), "utf8"));
const all = process.argv.includes("--all");
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const dataUri = (p) => { try { return "data:image/webp;base64," + fs.readFileSync(path.join(PUB, p)).toString("base64"); } catch { return ""; } };
const html = (b) => `<!doctype html><html><head><meta charset="utf-8"><style>
html,body{margin:0;width:1200px;height:630px;overflow:hidden;background:#000;font-family:Inter,"Noto Color Emoji",sans-serif;color:#e7e9ea}
.c{position:absolute;left:88px;right:88px;top:72px;bottom:64px;display:flex;flex-direction:column}
.e{width:120px;height:120px;border:2px solid #2f3336;border-radius:28px;display:grid;place-items:center;font-size:68px;line-height:1;margin-bottom:36px;font-family:"Noto Color Emoji"}
h1{font-size:${b.name.length > 26 ? 64 : 80}px;line-height:1.05;letter-spacing:-.035em;font-weight:800;margin:0 0 20px;max-height:180px;overflow:hidden}
p{font-size:32px;line-height:1.3;margin:0;color:#a8adb2;letter-spacing:-.01em;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}
.f{position:absolute;left:88px;right:88px;bottom:56px;display:flex;align-items:center;justify-content:space-between;font-size:28px;color:#71767b}
.by{display:flex;align-items:center;gap:14px}.by img{width:44px;height:44px;border-radius:50%}
.s{display:flex;align-items:center;gap:12px;font-weight:700;color:#e7e9ea}
.s svg{width:36px;height:36px}
.av{width:120px;height:120px;border-radius:50%;margin-bottom:36px;border:2px solid #2f3336}
</style></head><body><div class="c">${b.creator ? (dataUri(b.creator_avatar) ? `<img class="av" src="${dataUri(b.creator_avatar)}">` : "") : `<div class="e">${esc(b.emoji)}</div>`}<h1>${esc(b.name)}</h1><p>${esc(b.description)}</p></div>
<div class="f"><div class="by">${b.creator ? `<span>${esc(b.creator_handle)} on Grok Bot Shelf</span>` : `${dataUri(b.creator_avatar) ? `<img src="${dataUri(b.creator_avatar)}">` : ""}<span>${esc(b.creator_name)} ${esc(b.creator_handle)}</span>`}</div>
<div class="s"><svg viewBox="0 0 16 16" fill="#e7e9ea"><rect x="1" y="2" width="14" height="2.4" rx=".5"/><rect x="1" y="6.8" width="10" height="2.4" rx=".5"/><rect x="1" y="11.6" width="12" height="2.4" rx=".5"/></svg>grokbotshelf.com</div></div></body></html>`;
// One card per creator (first casing of the handle wins, as on the shelf), drawn with the same template.
const groups = new Map();
for (const b of bots) { const k = b.creator_handle.replace(/^@/, "").toLowerCase(); if (!k) continue; if (!groups.has(k)) groups.set(k, []); groups.get(k).push(b); }
const creators = [...groups].map(([k, g]) => ({ creator: true, file: path.join(COUT, k + ".png"), name: g[0].creator_name, creator_handle: g[0].creator_handle, creator_avatar: g[0].creator_avatar,
  description: `${g.length} ${g.length === 1 ? "bot" : "bots"}: ${g.slice(0, 4).map((b) => b.name).join(", ")}${g.length > 4 ? " and more" : ""}` }));
(async () => {
  fs.mkdirSync(OUT, { recursive: true }); fs.mkdirSync(COUT, { recursive: true }); fs.mkdirSync(TOUT, { recursive: true }); fs.mkdirSync(TOUT2, { recursive: true });
  const keep = new Set(bots.map((b) => slugify(b.name) + ".png")), ckeep = new Set(creators.map((c) => path.basename(c.file)));
  const tkeep = new Set(bots.map((b) => slugify(b.name) + ".webp"));
  for (const f of fs.readdirSync(TOUT)) if (!tkeep.has(f)) fs.rmSync(path.join(TOUT, f));
  for (const f of fs.readdirSync(TOUT2)) if (!tkeep.has(f)) fs.rmSync(path.join(TOUT2, f));
  for (const f of fs.readdirSync(OUT)) if (!keep.has(f)) fs.rmSync(path.join(OUT, f));
  for (const f of fs.readdirSync(COUT)) if (!ckeep.has(f)) fs.rmSync(path.join(COUT, f));
  const todo = bots.map((b) => ({ ...b, file: path.join(OUT, slugify(b.name) + ".png") })).concat(creators).filter((b) => all || !fs.existsSync(b.file));
  const drawn = new Set(todo.map((b) => b.file));
  const thumbs = bots.flatMap((b) => [[TOUT, 480, 252], [TOUT2, 720, 378]].map(([dir, w, h]) => ({ png: path.join(OUT, slugify(b.name) + ".png"), file: path.join(dir, slugify(b.name) + ".webp"), w, h })))
    .filter((t) => drawn.has(t.png) || !fs.existsSync(t.file));
  if (!todo.length && !thumbs.length) return console.log("og: nothing to draw");
  const br = await puppeteer.launch({ executablePath: "/usr/bin/google-chrome", headless: "new", args: ["--no-sandbox"] });
  const p = await br.newPage(); await p.setViewport({ width: 1200, height: 630 });
  for (const b of todo) {
    await p.setContent(html(b), { waitUntil: "load" });
    await p.evaluate(() => document.fonts.ready);
    await p.screenshot({ path: b.file });
  }
  // Thumbnails: the finished card scaled down by the browser, so a thumbnail always matches its card
  for (const t of thumbs) {
    await p.setViewport({ width: t.w, height: t.h });
    await p.setContent(`<!doctype html><style>html,body{margin:0;background:#000}img{display:block;width:${t.w}px;height:${t.h}px}</style><img src="data:image/png;base64,${fs.readFileSync(t.png).toString("base64")}">`, { waitUntil: "load" });
    await p.screenshot({ path: t.file, type: "webp", quality: 80 });
  }
  await br.close();
  console.log("og: drew", todo.length, "cards and", thumbs.length, "thumbnails");
})();
