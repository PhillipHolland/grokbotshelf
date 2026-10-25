// Renders a 1200x630 share image per bot into public/og/bot/<slug>.png with headless Chrome.
// Only missing images are drawn unless you pass --all. Needs puppeteer-core outside the repo:
//   NODE_PATH=/workspace/bot-hub-test/node_modules node scripts/og.js [--all]
// Then run node scripts/build.js so the bot pages point at the new images.
const fs = require("fs"), path = require("path");
const puppeteer = require("puppeteer-core");
const { slugify } = require("./shelf");
const PUB = path.join(__dirname, "..", "public"), OUT = path.join(PUB, "og", "bot");
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
</style></head><body><div class="c"><div class="e">${esc(b.emoji)}</div><h1>${esc(b.name)}</h1><p>${esc(b.description)}</p></div>
<div class="f"><div class="by">${dataUri(b.creator_avatar) ? `<img src="${dataUri(b.creator_avatar)}">` : ""}<span>${esc(b.creator_name)} ${esc(b.creator_handle)}</span></div>
<div class="s"><svg viewBox="0 0 16 16" fill="#e7e9ea"><rect x="1" y="2" width="14" height="2.4" rx=".5"/><rect x="1" y="6.8" width="10" height="2.4" rx=".5"/><rect x="1" y="11.6" width="12" height="2.4" rx=".5"/></svg>grokbotshelf.com</div></div></body></html>`;
(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const keep = new Set(bots.map((b) => slugify(b.name) + ".png"));
  for (const f of fs.readdirSync(OUT)) if (!keep.has(f)) fs.rmSync(path.join(OUT, f));
  const todo = bots.filter((b) => all || !fs.existsSync(path.join(OUT, slugify(b.name) + ".png")));
  if (!todo.length) return console.log("og: nothing to draw");
  const br = await puppeteer.launch({ executablePath: "/usr/bin/google-chrome", headless: "new", args: ["--no-sandbox"] });
  const p = await br.newPage(); await p.setViewport({ width: 1200, height: 630 });
  for (const b of todo) {
    await p.setContent(html(b), { waitUntil: "load" });
    await p.evaluate(() => document.fonts.ready);
    await p.screenshot({ path: path.join(OUT, slugify(b.name) + ".png") });
  }
  await br.close();
  console.log("og: drew", todo.length);
})();
