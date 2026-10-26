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
  // JSON-LD: bot page = WebPage + SoftwareApplication + BreadcrumbList, creator page = ProfilePage + Person + ItemList,
  // home = WebSite + SearchAction. Only real fields: no ratings, vote counts or publisher, and "<" is always escaped.
  const lds = (f) => [...fs.readFileSync(f, "utf8").matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map((m) => m[1]);
  const graph = (f) => { const l = lds(f); return l.length === 1 ? JSON.parse(l[0]) : null; };
  const allLd = [...botDirs.map((d) => pub("bot", d, "index.html")), ...cDirs.map((d) => pub(d, "index.html")), pub("index.html")].map((f) => [f, lds(f)]);
  ok(allLd.every(([, l]) => l.length === 1 && !l[0].includes("<") && JSON.parse(l[0])), `every bot, creator and home page has exactly one JSON-LD block, valid JSON, no raw "<" (${allLd.length})`);
  const banned = allLd.filter(([, l]) => /AggregateRating|aggregateRating|ratingValue|ratingCount|interactionStatistic|"publisher"|"brand"|"provider"|"manufacturer"|"Organization"|"connectors"|"permissions"|"datePublished"/.test(l[0])).map(([f]) => path.relative(TMP, f));
  ok(!banned.length, `no ratings, vote counts, publisher/brand or invented fields in JSON-LD (bad: ${banned.slice(0, 3).join(", ") || "none"})`);
  if (arch) {
    const g = graph(pub("bot", "archivist", "index.html"))["@graph"], wp = g.find((x) => x["@type"] === "WebPage"), bc = g.find((x) => x["@type"] === "BreadcrumbList"), app = wp && wp.mainEntity;
    const ch = arch.creator_handle.replace(/^@/, "");
    ok(wp && wp.url === "https://grokbotshelf.com/bot/archivist" && app["@type"] === "SoftwareApplication" && app.name === "Archivist" && app.description === arch.description && app.url === wp.url
      && /^https:\/\/grokbotshelf\.com\/og\/bot\/archivist\.png\?v=[0-9a-f]{10}$/.test(app.image) && app.sameAs === arch.url, "bot JSON-LD: WebPage with mainEntity SoftwareApplication (name, description, url, share image)");
    ok(app.author["@type"] === "Person" && app.author.name === arch.creator_name && app.author.sameAs === "https://x.com/" + ch, "bot JSON-LD: author Person with sameAs x.com/" + ch);
    ok(bc && wp.breadcrumb["@id"] === bc["@id"] && bc.itemListElement.map((i) => i.item).join(" ") === `https://grokbotshelf.com/ https://grokbotshelf.com/@${ch.toLowerCase()} https://grokbotshelf.com/bot/archivist`
      && bc.itemListElement.every((i, n) => i.position === n + 1 && i.name), "bot JSON-LD: BreadcrumbList home > creator > bot");
    const cg = graph(pub("@" + ch.toLowerCase(), "index.html"))["@graph"], pp = cg.find((x) => x["@type"] === "ProfilePage"), il = cg.find((x) => x["@type"] === "ItemList");
    const mine = bots.filter((b) => b.creator_handle.replace(/^@/, "").toLowerCase() === ch.toLowerCase());
    ok(pp && pp.mainEntity["@type"] === "Person" && pp.mainEntity.alternateName.toLowerCase() === "@" + ch.toLowerCase() && pp.mainEntity.sameAs.toLowerCase() === "https://x.com/" + ch.toLowerCase() && pp.mainEntity.name, "creator JSON-LD: ProfilePage with mainEntity Person (name, @handle, x.com)");
    ok(il && il.numberOfItems === mine.length && il.itemListElement.length === mine.length && il.itemListElement.every((i, n) => i.position === n + 1 && /^https:\/\/grokbotshelf\.com\/bot\/[a-z0-9-]+$/.test(i.url) && i.name),
      `creator JSON-LD: ItemList of their ${mine.length} bots (url, name)`);
  }
  const anon = bots.find((b) => !b.creator_handle);
  if (anon) {
    const app = graph(pub("bot", slugify(anon.name), "index.html"))["@graph"].find((x) => x["@type"] === "WebPage").mainEntity;
    const bc = graph(pub("bot", slugify(anon.name), "index.html"))["@graph"].find((x) => x["@type"] === "BreadcrumbList");
    ok(!("sameAs" in app.author) && !("url" in app.author) && bc.itemListElement.length === 2, `bot with no handle (${anon.name}): author has no sameAs, breadcrumb skips the creator`);
  }
  const site = graph(pub("index.html"));
  ok(site["@type"] === "WebSite" && site.url === "https://grokbotshelf.com/" && site.potentialAction.target.urlTemplate === "https://grokbotshelf.com/?q={search_term_string}", "home JSON-LD: WebSite with SearchAction on /?q=");
  const { ldScript } = require(path.join(TMP, "scripts", "shelf"));
  const evil = ldScript({ name: "</script><script>alert(1)</script><!--" });
  ok(evil.indexOf("</script>") === evil.length - 9 && !evil.slice(0, -9).includes("<", 1 + evil.indexOf(">")) && JSON.parse(evil.slice(evil.indexOf(">") + 1, -9)).name === "</script><script>alert(1)</script><!--", "JSON-LD escapes every < so a value cannot close the script");
  // shelf-data.json: the one file the home page loads, built from bots.json + bot-meta.json + social.json
  const data = JSON.parse(fs.readFileSync(pub("shelf-data.json"), "utf8")).bots;
  ok(data.length === bots.length && data.every((d, i) => d.name === bots[i].name && d.url === bots[i].url && d.creator_handle === bots[i].creator_handle), `shelf-data.json has every bot in bots.json order (${data.length} of ${bots.length})`);
  const withMeta = data.filter((d) => d.meta), withSocial = data.filter((d) => d.social), only = (o, keys) => Object.keys(o).every((k) => keys.includes(k));
  ok(withMeta.length > 0 && withSocial.length > 0 && withMeta.every((d) => only(d.meta, ["agency", "works_with", "one_job"])) && withSocial.every((d) => only(d.social, ["bookmarks", "likes"])),
    `shelf-data.json carries only the meta (${withMeta.length}) and social (${withSocial.length}) fields the cards use`);
  const crypto = require("crypto"), raw = fs.readFileSync(pub("shelf-data.json")), v = crypto.createHash("sha256").update(raw).digest("hex").slice(0, 10);
  ok(fs.readFileSync(pub("index.html"), "utf8").includes(`<link rel="preload" href="/shelf-data.json?v=${v}" as="fetch" crossorigin="anonymous">`), "index.html preloads shelf-data.json at its content hash " + v);
  const home = fs.readFileSync(pub("index.html"), "utf8");
  const botHrefs = new Set([...home.matchAll(/href="(\/bot\/[^"]+)"/g)].map((m) => m[1]));
  const creatorHrefs = new Set([...home.matchAll(/href="(\/@[^"]+)"/g)].map((m) => m[1]));
  const missBots = slugs.filter((s) => !botHrefs.has("/bot/" + s));
  const missCreators = handles.filter((h) => h && !creatorHrefs.has("/@" + h));
  ok(!missBots.length, `homepage HTML links every bot page (${botHrefs.size}; missing ${missBots.slice(0, 3).join(", ") || "none"})`);
  ok(!missCreators.length, `homepage HTML links every creator page (${creatorHrefs.size}; missing ${missCreators.slice(0, 3).join(", ") || "none"})`);
  ok(home.includes('id="all"') && !home.includes("<script async src=\"https://www.googletagmanager.com/gtag/js"), "crawl list is in the homepage, and GA is not a static script when unset");
  const appJs = fs.readFileSync(pub("app.js"), "utf8"), pageJs = fs.readFileSync(pub("bot-page.js"), "utf8");
  ok(appJs.includes('gtag("event", "get_bot"') && appJs.includes('destination: el.classList.contains("app") ? "app" : "x.ai"') && pageJs.includes('gtag("event", "get_bot"') && pageJs.includes('destination: a.classList.contains("app") ? "app" : "x.ai"'), "get_bot fires from shelf cards and bot-page CTAs");
  execFileSync(process.execPath, [path.join(TMP, "scripts", "build.js")], { encoding: "utf8", env: { ...process.env, GA_MEASUREMENT_ID: "G-GQXCQR2WSE", GSC_VERIFICATION: "" } });
  const gatedHome = fs.readFileSync(pub("index.html"), "utf8");
  const gatedBot = fs.readFileSync(pub("bot", "archivist", "index.html"), "utf8");
  const gate = 'if(h!=="grokbotshelf.com"&&h!=="www.grokbotshelf.com")return;';
  ok(gatedHome.includes(gate) && gatedBot.includes(gate) && gatedHome.includes("G-GQXCQR2WSE") && gatedBot.includes("G-GQXCQR2WSE"), "GA snippet is gated to the production hostname on home and bot pages");
  ok(!gatedHome.includes("<script async src=\"https://www.googletagmanager.com/gtag/js") && !gatedBot.includes("<script async src=\"https://www.googletagmanager.com/gtag/js"), "GA is not injected as a parser-loaded script tag");
  ok(!fs.readFileSync(path.join(ROOT, "api", "votes.js"), "utf8").includes("grokbotshelf-votes") && !fs.readFileSync(path.join(ROOT, "api", "submit.js"), "utf8").includes("grokbotshelf-votes"), "no public default VOTE_SALT");
  const saltEnv = { ...process.env, VOTE_SALT: "   " };
  delete saltEnv.DATABASE_URL; delete saltEnv.NEON_DATABASE_URL; delete saltEnv.POSTGRES_URL;
  const saltOut = execFileSync(process.execPath, ["-e", `
    const path = require("path");
    const root = ${JSON.stringify(ROOT)};
    function call(handler, method) {
      return new Promise((resolve) => {
        const r = { statusCode: 0, setHeader() {}, end(b) { this.body = b; resolve(this); } };
        Promise.resolve(handler({ method, url: "/api/x", headers: {}, socket: {} }, r)).catch((e) => resolve({ statusCode: 0, body: String(e) }));
      });
    }
    (async () => {
      for (const f of ["votes.js", "submit.js"]) {
        const handler = require(path.join(root, "api", f));
        for (const method of ["GET", "POST"]) {
          const res = await call(handler, method);
          let body = {}; try { body = JSON.parse(res.body); } catch {}
          const pass = res.statusCode === 500 && body.error === "VOTE_SALT is not configured";
          console.log((pass ? "PASS " : "FAIL ") + f + " " + method + " fails closed without VOTE_SALT" + (pass ? "" : " (" + res.statusCode + " " + res.body + ")"));
          if (!pass) process.exitCode = 1;
        }
      }
    })();
  `], { encoding: "utf8", env: saltEnv });
  process.stdout.write(saltOut);
  ok(!/^FAIL /m.test(saltOut), "vote and submit APIs fail closed without VOTE_SALT");
  const openEnv = { ...process.env, VOTE_SALT: "test-salt-not-a-default" };
  delete openEnv.DATABASE_URL; delete openEnv.NEON_DATABASE_URL; delete openEnv.POSTGRES_URL;
  const openOut = execFileSync(process.execPath, ["-e", `
    const path = require("path");
    const handler = require(path.join(${JSON.stringify(ROOT)}, "api", "votes.js"));
    const submit = require(path.join(${JSON.stringify(ROOT)}, "api", "submit.js"));
    function call(h, method) {
      return new Promise((resolve) => {
        const r = { statusCode: 0, setHeader() {}, end(b) { this.body = b; resolve(this); } };
        Promise.resolve(h({ method, url: "/api/x", headers: {}, socket: {} }, r)).catch((e) => resolve({ statusCode: 0, body: String(e) }));
      });
    }
    (async () => {
      const votes = await call(handler, "GET");
      const usage = await call(submit, "GET");
      let v = {}, s = {}; try { v = JSON.parse(votes.body); s = JSON.parse(usage.body); } catch {}
      const pass = votes.statusCode === 200 && v.global === false && usage.statusCode === 200 && s.ok === true;
      console.log((pass ? "PASS " : "FAIL ") + "with VOTE_SALT set, votes and submit stay up when the database is unset" + (pass ? "" : " (" + votes.statusCode + " " + votes.body + " / " + usage.statusCode + " " + usage.body + ")"));
      if (!pass) process.exitCode = 1;
    })();
  `], { encoding: "utf8", env: openEnv });
  process.stdout.write(openOut);
  ok(!/^FAIL /m.test(openOut), "with VOTE_SALT set, votes and submit stay up when the database is unset");
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
