// Draws 48x48 WebP copies of the creator avatars (public/avatars/<file>) into public/avatars/48/<name>.webp, for the 16px card
// avatars and 40px group headers. The originals stay as they are. Vercel's build has no image tools, so run this locally
// and commit the output; build.js only uses a small copy when manifest.json says it was made from the current original,
// and falls back to the original otherwise (a new or changed avatar works before anyone runs this).
// Only missing or outdated copies are drawn. Needs puppeteer-core outside the repo:
//   NODE_PATH=/path/to/node_modules node scripts/avatars.js
const fs = require("fs"), path = require("path"), crypto = require("crypto");
const puppeteer = require("puppeteer-core");
const SRC = path.join(__dirname, "..", "public", "avatars"), OUT = path.join(SRC, "48"), MAN = path.join(OUT, "manifest.json");
const SIZE = 48;
const small = (f) => f.replace(/\.\w+$/, ".webp"); // the copy is always WebP
const hash = (buf) => crypto.createHash("sha256").update(buf).digest("hex").slice(0, 10);
(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  let man = {}; try { man = JSON.parse(fs.readFileSync(MAN, "utf8")); } catch {}
  const files = fs.readdirSync(SRC).filter((f) => /\.(webp|png|jpe?g)$/i.test(f));
  for (const f of Object.keys(man)) if (!files.includes(f)) { delete man[f]; fs.rmSync(path.join(OUT, small(f)), { force: true }); }
  const todo = files.filter((f) => man[f] !== hash(fs.readFileSync(path.join(SRC, f))) || !fs.existsSync(path.join(OUT, small(f))));
  if (!todo.length) return console.log("avatars: nothing to draw");
  const br = await puppeteer.launch({ executablePath: "/usr/bin/google-chrome", headless: "new", args: ["--no-sandbox"] });
  const p = await br.newPage();
  for (const f of todo) {
    const buf = fs.readFileSync(path.join(SRC, f)), type = f.endsWith(".png") ? "image/png" : /jpe?g$/i.test(f) ? "image/jpeg" : "image/webp";
    // Down-scale in steps of at most 2x for a smooth result, then encode as WebP
    const out = await p.evaluate(async (src, size) => {
      const img = new Image(); img.src = src; await img.decode();
      let c = document.createElement("canvas"), w = img.naturalWidth, h = img.naturalHeight, from = img;
      while (w / 2 >= size) { const n = document.createElement("canvas"); n.width = w = Math.round(w / 2); n.height = h = Math.round(h / 2); const x = n.getContext("2d"); x.imageSmoothingQuality = "high"; x.drawImage(from, 0, 0, w, h); from = n; }
      c.width = size; c.height = size; const x = c.getContext("2d"); x.imageSmoothingQuality = "high";
      const s = Math.min(w, h); x.drawImage(from, (w - s) / 2, (h - s) / 2, s, s, 0, 0, size, size);
      return c.toDataURL("image/webp", 0.86);
    }, `data:${type};base64,${buf.toString("base64")}`, SIZE);
    fs.writeFileSync(path.join(OUT, small(f)), Buffer.from(out.split(",")[1], "base64"));
    man[f] = hash(buf);
  }
  await br.close();
  fs.writeFileSync(MAN, JSON.stringify(Object.fromEntries(Object.entries(man).sort()), null, 1) + "\n");
  console.log("avatars: drew", todo.length);
})();
