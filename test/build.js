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
  // shelf-data.json: the one file the home page loads, built from bots.json + bot-meta.json + social.json
  const data = JSON.parse(fs.readFileSync(pub("shelf-data.json"), "utf8")).bots;
  ok(data.length === bots.length && data.every((d, i) => d.name === bots[i].name && d.url === bots[i].url && d.creator_handle === bots[i].creator_handle), `shelf-data.json has every bot in bots.json order (${data.length} of ${bots.length})`);
  const withMeta = data.filter((d) => d.meta), withSocial = data.filter((d) => d.social), only = (o, keys) => Object.keys(o).every((k) => keys.includes(k));
  ok(withMeta.length > 0 && withSocial.length > 0 && withMeta.every((d) => only(d.meta, ["agency", "works_with", "one_job"])) && withSocial.every((d) => only(d.social, ["bookmarks", "likes"])),
    `shelf-data.json carries only the meta (${withMeta.length}) and social (${withSocial.length}) fields the cards use`);
  const crypto = require("crypto"), raw = fs.readFileSync(pub("shelf-data.json")), v = crypto.createHash("sha256").update(raw).digest("hex").slice(0, 10);
  ok(fs.readFileSync(pub("index.html"), "utf8").includes(`<link rel="preload" href="/shelf-data.json?v=${v}" as="fetch" crossorigin="anonymous">`), "index.html preloads shelf-data.json at its content hash " + v);
  // 48px avatar copies: every one is 48x48, made from the current original, and used for cards and the bot page byline
  const webpSize = (b) => { const t = b.toString("ascii", 12, 16); return t === "VP8 " ? [b.readUInt16LE(26) & 0x3fff, b.readUInt16LE(28) & 0x3fff] : t === "VP8L" ? [1 + ((b[22] << 8 | b[21]) & 0x3fff), 1 + ((b[24] << 10 | b[23] << 2 | b[22] >> 6) & 0x3fff)] : t === "VP8X" ? [1 + b.readUIntLE(24, 3), 1 + b.readUIntLE(27, 3)] : [0, 0]; };
  const man = JSON.parse(fs.readFileSync(pub("avatars", "48", "manifest.json"), "utf8")), smalls = fs.readdirSync(pub("avatars", "48")).filter((f) => f.endsWith(".webp"));
  const bad = smalls.filter((f) => webpSize(fs.readFileSync(pub("avatars", "48", f))).join("x") !== "48x48");
  ok(smalls.length === Object.keys(man).length && !bad.length, `${smalls.length} small avatars, all 48x48 (wrong: ${bad.join(", ") || "none"})`);
  const fresh = (d) => { const m = /^\/avatars\/([^/?]+)/.exec(d.creator_avatar); return m && man[m[1]] === crypto.createHash("sha256").update(fs.readFileSync(pub("avatars", m[1]))).digest("hex").slice(0, 10); };
  const notSmall = data.filter((d) => fresh(d) && !/^\/avatars\/48\/[^?]+\.webp\?v=[0-9a-f]{10}$/.test(d.avatar_sm));
  ok(!notSmall.length && data.every((d) => /\?v=[0-9a-f]{10}$/.test(d.avatar_sm) && /\?v=[0-9a-f]{10}$/.test(d.creator_avatar)), `every bot with a current small copy uses it, all avatar URLs versioned (not: ${notSmall.length})`);
  if (arch) ok(fs.readFileSync(pub("bot", "archivist", "index.html"), "utf8").includes(`src="${data.find((d) => d.name === "Archivist").avatar_sm}"`), "bot page byline uses the small avatar");
  // A missing or outdated small copy falls back to the original
  const victim = data.find((d) => /\/avatars\/48\//.test(d.avatar_sm)), vf = /^\/avatars\/([^/?]+)/.exec(victim.creator_avatar)[1];
  fs.rmSync(pub("avatars", "48", vf.replace(/\.\w+$/, ".webp")));
  execFileSync(process.execPath, [path.join(TMP, "scripts", "build.js")], { encoding: "utf8", env: { ...process.env, GA_MEASUREMENT_ID: "", GSC_VERIFICATION: "" } });
  const after = JSON.parse(fs.readFileSync(pub("shelf-data.json"), "utf8")).bots.find((d) => d.name === victim.name);
  ok(after.avatar_sm === after.creator_avatar && after.avatar_sm.startsWith(`/avatars/${vf}?v=`), `missing small copy falls back to the original (${after.avatar_sm})`);
} finally {
  fs.rmSync(TMP, { recursive: true, force: true });
}
