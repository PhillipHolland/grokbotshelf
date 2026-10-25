// Smoke test for scripts/build.js. Runs the build on a temporary copy of the repo (the working tree is left alone)
// and checks the output against bots.json: one page per bot, one page per creator handle, sitemap, feed, share images.
// Usage: node test/build.js
const fs = require("fs"), os = require("os"), path = require("path"), { execFileSync } = require("child_process");
const ok = (c, m) => { console.log((c ? "PASS " : "FAIL ") + m); if (!c) process.exitCode = 1; };
const ROOT = path.join(__dirname, ".."), TMP = fs.mkdtempSync(path.join(os.tmpdir(), "shelf-build-"));
try {
  fs.cpSync(path.join(ROOT, "scripts"), path.join(TMP, "scripts"), { recursive: true });
  fs.cpSync(path.join(ROOT, "public"), path.join(TMP, "public"), { recursive: true });
  const { slugify } = require(path.join(TMP, "scripts", "shelf"));
  const pub = (...p) => path.join(TMP, "public", ...p);
  const bots = JSON.parse(fs.readFileSync(pub("bots.json"), "utf8"));
  const handles = [...new Set(bots.map((b) => b.creator_handle.replace(/^@/, "").toLowerCase()))];
  const out = execFileSync(process.execPath, [path.join(TMP, "scripts", "build.js")], { encoding: "utf8", env: { ...process.env, GA_MEASUREMENT_ID: "", GSC_VERIFICATION: "" } });
  ok(out.includes(`built ${bots.length} bot pages, ${handles.length} creator pages`), "build output: " + out.trim());
  const slugs = bots.map((b) => slugify(b.name));
  ok(new Set(slugs).size === bots.length, `${bots.length} unique bot slugs`);
  const botDirs = fs.readdirSync(pub("bot"));
  ok(botDirs.length === bots.length && slugs.every((s) => fs.existsSync(pub("bot", s, "index.html"))), `one page per bot (${botDirs.length} of ${bots.length})`);
  const cDirs = fs.readdirSync(pub()).filter((f) => f.startsWith("@"));
  ok(cDirs.length === handles.length && handles.every((h) => fs.existsSync(pub("@" + h, "index.html"))), `one page per creator handle, lowercase (${cDirs.length} of ${handles.length})`);
  ok(cDirs.every((d) => d === d.toLowerCase()), "no extra pages for other casings");
  const sm = fs.readFileSync(pub("sitemap.xml"), "utf8"), locs = [...sm.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
  ok(locs.length === 1 + bots.length + handles.length && new Set(locs).size === locs.length, `sitemap has home + bots + creators, no duplicates (${locs.length})`);
  ok(locs.filter((u) => u.includes("/@")).every((u) => u === u.toLowerCase()), "sitemap creator URLs are lowercase");
  const feed = fs.readFileSync(pub("feed.xml"), "utf8");
  ok((feed.match(/<item>/g) || []).length === Math.min(50, bots.length), "feed has the newest 50");
  ok(fs.readFileSync(pub("llms.txt"), "utf8").includes(`${bots.length} bots right now`), "llms.txt count matches");
  const missBot = slugs.filter((s) => !fs.existsSync(pub("og", "bot", s + ".png"))), missC = handles.filter((h) => !fs.existsSync(pub("og", "creator", h + ".png")));
  ok(!missBot.length, `every bot has a share image (missing: ${missBot.join(", ") || "none"})`);
  ok(!missC.length, `every creator has a share image (missing: ${missC.join(", ") || "none"})`);
  const generic = [...botDirs.map((s) => pub("bot", s, "index.html")), ...cDirs.map((d) => pub(d, "index.html"))].filter((f) => fs.readFileSync(f, "utf8").includes("/og.png?v=2"));
  ok(!generic.length, `no page falls back to the generic og.png (${generic.length})`);
  const arch = bots.find((b) => b.name === "Archivist");
  if (arch) {
    const h = fs.readFileSync(pub("bot", "archivist", "index.html"), "utf8"), ch = arch.creator_handle.replace(/^@/, "").toLowerCase();
    ok(h.includes('<link rel="canonical" href="https://grokbotshelf.com/bot/archivist">') && h.includes(`href="${arch.url}"`) && h.includes(`href="/@${ch}"`), "archivist page: canonical, template link, lowercase creator link");
  }
} finally {
  fs.rmSync(TMP, { recursive: true, force: true });
}
