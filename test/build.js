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
  const handles = [...new Set(bots.map((b) => b.creator_handle.replace(/^@/, "").toLowerCase()))].filter(Boolean); // no handle: no creator page
  const out = execFileSync(process.execPath, [path.join(TMP, "scripts", "build.js")], { encoding: "utf8", env: { ...process.env, GA_MEASUREMENT_ID: "", GSC_VERIFICATION: "" } });
  ok(out.includes(`built ${bots.length} bot pages, ${handles.length} creator pages`), "build output: " + out.trim());
  const slugs = bots.map((b) => slugify(b.name));
  ok(new Set(slugs).size === bots.length, `${bots.length} unique bot slugs`);
  const botDirs = fs.readdirSync(pub("bot"));
  ok(botDirs.length === bots.length && slugs.every((s) => fs.existsSync(pub("bot", s, "index.html"))), `one page per bot (${botDirs.length} of ${bots.length})`);
  const cDirs = fs.readdirSync(pub()).filter((f) => f.startsWith("@") && fs.statSync(pub(f)).isDirectory());
  ok(cDirs.length === handles.length && handles.every((h) => fs.existsSync(pub("@" + h, "index.html"))), `one page per creator handle, lowercase (${cDirs.length} of ${handles.length})`);
  ok(cDirs.every((d) => d === d.toLowerCase()), "no extra folders for other casings");
  // The creator's display casing (/@Phil_Holland) is the same page as a file, @Phil_Holland.html (cleanUrls serves it with 200):
  // canonical is the lowercase URL, replaceState swaps the address bar, at most one per creator, never a lowercase name
  // (that would shadow the folder) and no two names that differ only by case (they would collide on a case-insensitive disk).
  const cFiles = fs.readdirSync(pub()).filter((f) => f.startsWith("@") && f.endsWith(".html"));
  const keys = cFiles.map((f) => f.slice(1, -5).toLowerCase());
  ok(cFiles.length > 0 && cFiles.every((f) => f.slice(1, -5) !== f.slice(1, -5).toLowerCase() && handles.includes(f.slice(1, -5).toLowerCase())) && new Set(keys).size === keys.length,
    `display-casing creator pages: ${cFiles.length}, all mixed case, one per creator, each for a real creator`);
  const badCase = cFiles.filter((f) => { const k = f.slice(1, -5).toLowerCase(), h = fs.readFileSync(pub(f), "utf8"), canon = fs.readFileSync(pub("@" + k, "index.html"), "utf8");
    return !h.includes(`<link rel="canonical" href="https://grokbotshelf.com/@${k}">`) || !h.includes(`history.replaceState(history.state,"","/@${k}"+location.search+location.hash)`)
      || h.replace(/<script>try\{history\.replaceState[^\n]*<\/script>\n/, "") !== canon; });
  ok(!badCase.length, `each display-casing page is the lowercase page plus the address-bar swap (bad: ${badCase.join(", ") || "none"})`);
  const sm = fs.readFileSync(pub("sitemap.xml"), "utf8"), locs = [...sm.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
  const jobFile = JSON.parse(fs.readFileSync(pub("collections.json"), "utf8"));
  const jobN = Array.isArray(jobFile.collections) ? jobFile.collections.length : 0;
  const catN = new Set(bots.map((b) => slugify(b.category))).size;
  ok(locs.length === 4 + catN + (jobN ? 1 + jobN : 0) + bots.length + handles.length && locs.includes("https://grokbotshelf.com/add") && locs.includes("https://grokbotshelf.com/stacks") && locs.includes("https://grokbotshelf.com/category") && [...new Set(bots.map((b) => slugify(b.category)))].every((s) => locs.includes("https://grokbotshelf.com/category/" + s)) && (!jobN || locs.includes("https://grokbotshelf.com/collections") && jobFile.collections.every((c) => locs.includes("https://grokbotshelf.com/collection/" + c.slug))) && new Set(locs).size === locs.length, `sitemap has home + /add + /stacks + /category + jobs + bots + creators, no duplicates (${locs.length})`);
  if (jobN) {
    const hub = fs.readFileSync(pub("collection", jobFile.collections[0].slug, "index.html"), "utf8");
    const index = fs.readFileSync(pub("collections", "index.html"), "utf8");
    ok(index.includes("Find a bot by the job") && index.includes("job-card") && hub.includes("Start here") && hub.includes("More like this") && /by <a href="\/@/.test(hub), `job pages: index plus ${jobFile.collections[0].slug} with picks, alternates and creator credit`);
    const stacksHtml = fs.readFileSync(pub("stacks", "index.html"), "utf8");
    const homeNow = fs.readFileSync(pub("index.html"), "utf8");
    ok(index.includes('class="li"') && !/>💪</.test(index) && stacksHtml.includes("Shelf stacks") && stacksHtml.includes("/bot/child-safety-coach") && stacksHtml.includes("/bot/local-ai-manager") && !stacksHtml.includes("botshelf-20") && homeNow.includes('class="growth"') && /<b>[\d,]+<\/b> bots/.test(homeNow) && homeNow.includes("Shelved "), "Lucide on job hubs, public stacks page, homepage growth strip");
    const plan = homeNow.slice(homeNow.indexOf("<!-- plan:start -->"), homeNow.indexOf("<!-- plan:end -->"));
    const planBot = fs.readFileSync(pub("bot", "coach", "index.html"), "utf8");
    const plan404 = fs.readFileSync(pub("404.html"), "utf8");
    ok(plan.includes('id="cover-note-h"') && plan.includes("Helps pay for Grok Bot") && plan.includes("Affiliate Fees will show here once they start.") && plan.includes('class="cover-chip gift-top"') && plan.includes("with pairs") && !/\$\d/.test(plan) && !plan.includes("botshelf-20") && !plan.includes("amazon.com") && !planBot.includes("cover-note") && !plan404.includes("cover-note"), "homepage plan note is a zero-fee story and stays off bot pages");
    const sd = JSON.parse(fs.readFileSync(path.join(TMP, "public", "shelf-data.json"), "utf8"));
    const relay = sd.bots.find((b) => b.name === "iMessage Relay");
    const audit = sd.bots.find((b) => b.name === "Security Audit Bot");
    const reel = sd.bots.find((b) => b.name.includes("Reel"));
    const fit = fs.readFileSync(path.join(TMP, "public", "collection", "fitness", "index.html"), "utf8");
    const fitBot = fs.readFileSync(path.join(TMP, "public", "bot", "fitness-coach", "index.html"), "utf8");
    const { botMark } = require(path.join(TMP, "scripts", "icons"));
    ok(relay.mark === "message-circle" && audit.mark === "lock" && reel.emoji === "🎬" && reel.mark === "clapperboard" && reel.name.includes("➡️") && botMark("🦄") === "bot", "card marks map emoji to Lucide and keep emoji inside the name");
    ok(fit.includes('class="li"') && !fit.includes(">💪<") && fitBot.includes('class="icon big"') && fitBot.includes('class="li"') && !fitBot.includes(">💪<") && stacksHtml.includes('class="mk"'), "list cards and the bot header draw a Lucide mark, not the emoji glyph");
    const lab = fs.readFileSync(pub("lab", "desk", "index.html"), "utf8");
    const labChrome = lab.replace(/Reel ➡️ 𝕏/g, "");
    ok(!/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u.test(labChrome) && lab.includes('id="i-share"') && lab.includes("m16 6-4-4-4 4") && homeNow.includes('class="empty-i"') && homeNow.includes("m21 21-4.34-4.34") && fitBot.includes("m5 12 7-7 7 7"), "lab chrome, the empty state, and vote arrows use Lucide paths; a bot name can still carry emoji");
    const desk = fs.readFileSync(pub("lab", "desk.js"), "utf8");
    ok(desk.includes("function botIcon") && desk.includes("${botIcon(b.emoji)}") && !desk.includes("${esc(b.emoji)}") && desk.includes("M12 8V4H8") && desk.includes('"🎬"'), "lab cards redraw with the Lucide mark table, not the emoji glyph");
    ok(stacksHtml.includes('class="stack-meta"') && !stacksHtml.includes('class="sub"'), "stack count line is its own row, not the bot-page subtitle");
    const cssNow = fs.readFileSync(path.join(TMP, "public", "styles.css"), "utf8");
    ok(stacksHtml.includes('class="botpage stackspage"') && cssNow.includes("body.stackspage .rail") && cssNow.includes("background:var(--field);color:var(--text);font:350 13px"), "stacks page hides any A-Z rail and pair chips stay flat");
    const { rankJobMembers } = require(path.join(TMP, "scripts", "collections"));
    const demo = ["a", "b", "c", "d"].map((s) => ({ slug: s, url: "https://x.ai/bot/" + s }));
    const ed = rankJobMembers(demo, ["b", "a"], null);
    const us = rankJobMembers(demo, ["b"], { c: 5, a: 5 });
    ok(ed.by === "editors" && ed.start.map((b) => b.slug).join() === "b,a" && ed.rest.map((b) => b.slug).join() === "c,d", "with no usage map, editors' picks stay Start here");
    ok(us.by === "usage" && us.start.map((b) => b.slug).join() === "a,c,b" && us.rest.map((b) => b.slug).join() === "d", "a usage map sorts Start here by count, and a tie keeps editor order");
  }
  ok(locs.filter((u) => u.includes("/@")).every((u) => u === u.toLowerCase()), "sitemap creator URLs are lowercase");
  const feed = fs.readFileSync(pub("feed.xml"), "utf8");
  ok((feed.match(/<item>/g) || []).length === Math.min(50, bots.length), "feed has the newest 50");
  ok(fs.readFileSync(pub("llms.txt"), "utf8").includes(`${bots.length} bots right now`), "llms.txt count matches");
  ok(["cap_network", "cap_daily", "Retry-After", "at most 3 voters per shelf bot from one network"].every((k) => fs.readFileSync(pub("llms.txt"), "utf8").includes(k)) && !fs.readFileSync(pub("llms.txt"), "utf8").includes("cap_bot_voter"), "llms.txt documents the vote-cap 429 codes and Retry-After");
  const missBot = slugs.filter((s) => !fs.existsSync(pub("og", "bot", s + ".png"))), missC = handles.filter((h) => !fs.existsSync(pub("og", "creator", h + ".png")));
  ok(!missBot.length, `every bot has a share image (missing: ${missBot.join(", ") || "none"})`);
  ok(!missC.length, `every creator has a share image (missing: ${missC.join(", ") || "none"})`);
  const home0 = fs.readFileSync(pub("index.html"), "utf8");
  const generic = [...botDirs.map((s) => pub("bot", s, "index.html")), ...cDirs.map((d) => pub(d, "index.html"))].filter((f) => fs.readFileSync(f, "utf8").includes("/og.png?v=2"));
  ok(!generic.length, `no page falls back to the generic og.png (${generic.length})`);
  // A stray } silently eats the next rule, and an eaten @font-face leaves every page on the fallback font with no error.
  const cssBare = fs.readFileSync(pub("styles.css"), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
  let depth = 0, unbalanced = false;
  for (const c of cssBare) { if (c === "{") depth++; else if (c === "}" && --depth < 0) unbalanced = true; }
  ok(!unbalanced && depth === 0, "styles.css braces balance");
  const fontUrl = (cssBare.match(/@font-face\{[^}]*url\("(\/fonts\/[^"]+\.woff2)"\)/) || [])[1];
  ok(fontUrl && fs.existsSync(pub(fontUrl)), `styles.css names a font file that exists (${fontUrl})`);
  const preload = `<link rel="preload" href="${fontUrl}" as="font" type="font/woff2" crossorigin>`;
  const pagesToPreload = [...botDirs.map((s) => pub("bot", s, "index.html")), ...cDirs.map((d) => pub(d, "index.html")), ...["index.html", "404.html", "add/index.html", "stacks/index.html", "lab/desk/index.html"].map((f) => pub(f))];
  const noPreload = pagesToPreload.filter((f) => !fs.readFileSync(f, "utf8").includes(preload));
  ok(!noPreload.length, `every page preloads the font (${noPreload.length} of ${pagesToPreload.length} do not)`);
  const arch = bots.find((b) => b.name === "Archivist");
  if (arch) {
    const h = fs.readFileSync(pub("bot", "archivist", "index.html"), "utf8"), ch = arch.creator_handle.replace(/^@/, "").toLowerCase();
    ok(h.includes('<link rel="canonical" href="https://grokbotshelf.com/bot/archivist">') && h.includes(`href="${arch.url}"`) && h.includes(`href="/@${ch}"`), "archivist page: canonical, template link, lowercase creator link");
    ok(h.includes("<title>Archivist by Phillip Holland · Grok Bot Shelf</title>") && !/<title>[^<]*[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u.test(h) && h.includes(`href="/category/${slugify(arch.category)}"`) && h.includes("<h1>Archivist</h1>"), "archivist title has no emoji and the category links to its hub");
  }
  { // round 8: a bot page title is the name first, then the longest of "Grok Bot template by Creator", "by Creator",
    // "Grok Bot template" that keeps it within 60 characters; only a name that is long on its own goes over
    const unesc = (s) => s.replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'");
    const plainOf = (s) => s.replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE00}-\u{FE0F}\u{200D}\u{20E3}]/gu, "").replace(/\s+/g, " ").trim();
    const want = (b) => {
      const name = plainOf(b.name), who = plainOf(b.creator_name), by = name.toLowerCase().endsWith(` by ${who}`.toLowerCase()) ? "" : ` by ${who}`;
      return [`${name}: Grok Bot template${by}`, `${name}${by}`, `${name}: Grok Bot template`].map((t) => t + " · Grok Bot Shelf").find((t) => t.length <= 60) || `${name} · Grok Bot Shelf`;
    };
    const titles = bots.map((b) => [b, unesc((fs.readFileSync(pub("bot", slugify(b.name), "index.html"), "utf8").match(/<title>([^<]*)<\/title>/) || [])[1] || "")]);
    const wrong = titles.filter(([b, t]) => t !== want(b));
    const over = titles.filter(([, t]) => t.length > 60).length, kw = titles.filter(([, t]) => t.includes("Grok Bot template")).length;
    ok(!wrong.length && over < bots.length / 20 && kw > bots.length / 4, `bot titles: name first, the longest form within 60 characters (${wrong.length} wrong, ${over} over 60 on the name alone, ${kw} keep "Grok Bot template")`);
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
    ok(app.applicationCategory === arch.category && app.operatingSystem === "Grok Bot" && app.offers && app.offers["@type"] === "Offer" && app.offers.price === "0" && app.offers.priceCurrency === "USD" && !app.aggregateRating, `bot JSON-LD: operatingSystem Grok Bot, free USD offer, no rating (${app.operatingSystem})`);
    { // round 2 #8: homepage description and share title carry the live counts, twitter:site set; robots keeps crawlers off /api/
      const home = fs.readFileSync(pub("index.html"), "utf8"), nc = new Set(bots.map((b) => (b.creator_handle || "").replace(/^@/, "").toLowerCase()).filter(Boolean)).size;
      const desc = `${bots.length} shared Grok Bot templates from ${nc} creators. Search by category, app and what the bot does. Import in one tap.`;
      const m = (sel) => (home.match(new RegExp(`<meta ${sel} content="([^"]*)">`)) || [])[1];
      ok(m('name="description"') === desc && m('property="og:description"') === desc && m('name="twitter:description"') === desc, `homepage description: ${m('name="description"')}`);
      ok(m('property="og:title"') === `Grok Bot Shelf: ${bots.length} shared Grok Bot templates` && m('name="twitter:title"') === m('property="og:title"') && m('name="twitter:site"') === "@Phil_Holland", `homepage share title and twitter:site (${m('property="og:title"')})`);
      ok(/^Disallow: \/api\/$/m.test(fs.readFileSync(pub("robots.txt"), "utf8")), "robots.txt disallows /api/");
    }
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
  // Prefetch script: inline on home, bot and creator pages; Speculation Rules prefetch only, moderate, scoped
  const pf = allLd.map(([f]) => fs.readFileSync(f, "utf8")).filter((h) => h.includes('r.type="speculationrules"'));
  ok(pf.length === allLd.length, `prefetch script is on every home, bot and creator page (${pf.length} of ${allLd.length})`);
  ok(!/prerender/.test(home0) && home0.includes('\\"eagerness\\":\\"moderate\\"') && home0.includes('\\"href_matches\\":\\"/bot/*\\"') && home0.includes('\\"href_matches\\":\\"/@*\\"'), "prefetch rules: prefetch only, moderate, /bot/* and /@*");
  // shelf-data.json: the one file the home page loads, built from bots.json + bot-meta.json + social.json
  const data = JSON.parse(fs.readFileSync(pub("shelf-data.json"), "utf8")).bots;
  ok(data.length === bots.length && data.every((d, i) => d.name === bots[i].name && d.url === bots[i].url && d.creator_handle === bots[i].creator_handle), `shelf-data.json has every bot in bots.json order (${data.length} of ${bots.length})`);
  const withMeta = data.filter((d) => d.meta), withSocial = data.filter((d) => d.social), only = (o, keys) => Object.keys(o).every((k) => keys.includes(k));
  ok(withMeta.length > 0 && withSocial.length > 0 && withMeta.every((d) => only(d.meta, ["agency", "works_with", "one_job"])) && withSocial.every((d) => only(d.social, ["bookmarks", "likes"])),
    `shelf-data.json carries only the meta (${withMeta.length}) and social (${withSocial.length}) fields the cards use`);
  const crypto = require("crypto"), raw = fs.readFileSync(pub("shelf-data.json")), v = crypto.createHash("sha256").update(raw).digest("hex").slice(0, 10);
  ok(fs.readFileSync(pub("index.html"), "utf8").includes(`<link rel="preload" href="/shelf-data.json?v=${v}" as="fetch" crossorigin="anonymous" fetchpriority="high">`), "index.html preloads shelf-data.json at its content hash " + v);
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
  ok(!notSmall.length && data.every((d) => (!d.creator_avatar && !d.avatar_sm) || (/\?v=[0-9a-f]{10}$/.test(d.avatar_sm) && /\?v=[0-9a-f]{10}$/.test(d.creator_avatar))), `every bot with a current small copy uses it, all avatar URLs versioned (not: ${notSmall.length})`);
  if (arch) ok(fs.readFileSync(pub("bot", "archivist", "index.html"), "utf8").includes(`src="${data.find((d) => d.name === "Archivist").avatar_sm}"`), "bot page byline uses the small avatar");
  // Amazon "Pairs with": curated public/pairs.json (score >= 4) plus overrides. No category matching.
  const { pairsFor, productUrl, matchTier, resolvePairs, proposePairs, listPairSlice, generatePairs, BANNED_KEYWORDS } = require(path.join(TMP, "scripts", "pairs"));
  const catalog = JSON.parse(fs.readFileSync(pub("products.json"), "utf8"));
  const curated = JSON.parse(fs.readFileSync(pub("pairs.json"), "utf8"));
  const overrides = JSON.parse(fs.readFileSync(pub("pairs-overrides.json"), "utf8"));
  const idsOf = (name) => pairsFor(bots.find((b) => b.name === name), catalog).map((h) => h.product.id).join(",");
  const hasId = (name, id) => pairsFor(bots.find((b) => b.name === name), catalog).some((h) => h.product.id === id);
  ok(catalog.tag === "botshelf-20" && catalog.products.length >= 60 && catalog.products.length <= 80 && new Set(catalog.products.map((p) => p.asin)).size === catalog.products.length && catalog.products.every((p) => productUrl(p, catalog.tag) === `https://www.amazon.com/dp/${p.asin}?tag=botshelf-20`), `products.json: ${catalog.products.length} unique Amazon ASINs, tag botshelf-20`);
  ok(catalog.products.find((p) => p.id === "airpods").asin === "B0DGJ7HYG1" && catalog.products.find((p) => p.id === "wacom-intuos").asin === "B079NWPZTG", "AirPods 4 ANC and current Wacom Intuos Medium replace the stale ASINs");
  ok(catalog.products.find((p) => p.id === "beelink-ser9").asin === "B0HG9JYSV9" && productUrl(catalog.products.find((p) => p.id === "beelink-ser9"), catalog.tag) === "https://www.amazon.com/dp/B0HG9JYSV9?tag=botshelf-20", "Beelink SER9 ASIN is the Ryzen AI mini PC, not AirPods Pro 2");
  ok(/265\/265S|bundle/i.test(catalog.products.find((p) => p.id === "garmin-265").flag || ""), "Garmin Forerunner listing is flagged (265/265S parent, not a dock bundle)");
  const bannedKw = catalog.products.flatMap((p) => (p.match && p.match.keywords) || []).filter((k) => BANNED_KEYWORDS.has(String(k).trim().toLowerCase()));
  const withCats = catalog.products.filter((p) => p.match && Array.isArray(p.match.categories) && p.match.categories.length);
  ok(!bannedKw.length && !withCats.length, `no category match rules and no ambiguous keywords (bad: ${bannedKw.concat(withCats.map((p) => p.id)).join(", ") || "none"})`);
  ok(matchTier({ name: "Sample", description: "Helps with everyday tasks.", category: "Developer" }, { match: { categories: ["Developer"], keywords: [] } }) === null, "category field does not match a product");
  ok(matchTier(bots.find((b) => b.name === "Twain"), catalog.products.find((p) => p.id === "shure-mv7")) === null, "Twain's literary voice does not keyword-match a mic");
  ok(matchTier(bots.find((b) => b.name === "Ops Bot"), catalog.products.find((p) => p.id === "dewalt-drill")) === null, "Ops Bot's software tools do not keyword-match a drill");
  const localIds = idsOf("Local AI Manager").split(",");
  ok(localIds.includes("beelink-mini-s12") && localIds.includes("beelink-ser9") && localIds.includes("samsung-990-pro-2tb"), `Local AI Manager keeps mini PCs and an SSD: ${localIds.join(",")}`);
  ok(hasId("micDrop", "shure-mv7") && hasId("micDrop", "at2020usb") && !hasId("micDrop", "dewalt-drill"), `micDrop keeps mics: ${idsOf("micDrop")}`);
  ok(!hasId("Ops Bot", "dewalt-drill") && idsOf("Ops Bot") === "", `Ops Bot has no drill: ${idsOf("Ops Bot") || "none"}`);
  ok(!hasId("Twain", "shure-mv7") && !hasId("Twain", "blue-yeti") && !hasId("Twain", "at2020usb") && idsOf("Twain") === "", "Twain has no mic");
  ok(!hasId("Sushi & Ramen", "instant-pot-duo") && idsOf("Sushi & Ramen") === "", "Sushi & Ramen has no Instant Pot");
  ok(!hasId("Christian Devotional Bot", "moleskine-classic") && !hasId("Christian Devotional Bot", "kjv-study-bible") && idsOf("Christian Devotional Bot") === "", "Christian Devotional Bot is not a notebook or a KJV");
  ok(!hasId("Apple Inventory & Deal Bot", "mac-mini-m4") && !hasId("Apple Inventory & Deal Bot", "airpods") && !hasId("Apple Inventory & Deal Bot", "airtag-4pack") && idsOf("Apple Inventory & Deal Bot") === "", "Apple Inventory & Deal Bot does not advertise those SKUs");
  ok(!hasId("App Store Connect", "mac-mini-m4") && idsOf("App Store Connect") === "", "App Store Connect is not a Mac mini");
  ok(hasId("iBot Player", "airpods") && hasId("Coach", "garmin-265"), "iBot Player keeps AirPods and Coach keeps the Forerunner");
  const devo = bots.find((b) => b.name === "Christian Devotional Bot");
  const devoRows = proposePairs(devo, catalog);
  ok(!devoRows.some((r) => r.id === "moleskine-classic" || r.id === "kjv-study-bible" || /^Named match/.test(r.reason || "")), "devotional copy does not named-match a notebook or a translation-specific Bible");
  const mole = catalog.products.find((p) => p.id === "moleskine-classic");
  const sprayedCatalog = { ...catalog, products: catalog.products.map((p) => p.id === "moleskine-classic" ? { ...p, match: { ...(p.match || {}), bot_names: [...new Set([...(p.match && p.match.bot_names || []), devo.name])], exclude_names: [] } } : p) };
  ok(!proposePairs(devo, sprayedCatalog).some((r) => r.id === "moleskine-classic"), "bot_names alone is not a named match when the bot name does not contain the product");
  ok(mole && mole.id === "moleskine-classic", "moleskine still in the catalog");
  ok(idsOf("Apple Desk") === "mac-mini-m4,beelink-mac-dock,anker-565-hub", `Apple Desk pairs: ${idsOf("Apple Desk")}`);
  ok(idsOf("Streamer's Dream") === "logitech-c922x,stream-deck-mk2,key-light-air-mk2", `Streamer's Dream pairs: ${idsOf("Streamer's Dream")}`);
  ok(idsOf("Archivist") === "" && idsOf("Reel ➡️ 𝕏") === "" && idsOf("Clipper") === "", "Archivist, Reel, and Clipper have no pairs");
  ok(pairsFor({ name: "Nope Dev", description: "Writes code.", category: "Developer" }, catalog).length === 0, "a Developer bot with no curated row gets nothing");
  const covered = ["Lifestyle", "Home", "Food", "Health & Fitness", "Travel", "Security", "Design", "Money", "Faith", "Shopping", "Developer", "Bot Tools", "Productivity", "Creator & Media", "Business & Marketing"];
  const sprayed = covered.filter((c) => pairsFor({ name: "Sample", description: "Helps with everyday tasks.", category: c }, catalog).length);
  ok(!sprayed.length, `category-only bots get no pairs (hit: ${sprayed.join(", ") || "none"})`);
  const echoBots = bots.filter((b) => hasId(b.name, "echo-dot")).map((b) => b.name);
  ok(!echoBots.length, `Echo Dot is not paired (only a clear smart-home bot would qualify; got ${echoBots.join(", ") || "none"})`);
  const counts = [0, 0, 0, 0];
  for (const b of bots) counts[pairsFor(b, catalog).length]++;
  const paired = counts[1] + counts[2] + counts[3];
  ok(counts.reduce((s, n) => s + n, 0) === bots.length && paired > 85 && counts[0] > 0, `pair coverage 0/1/2/3 = ${counts.join("/")} (${paired} with products)`);
  const toolHits = bots.filter((b) => b.category === "Bot Tools" && pairsFor(b, catalog).length);
  ok(!toolHits.length, `Bot Tools stays empty unless a bot opts in (hit: ${toolHits.slice(0, 3).map((b) => b.name).join(", ") || "none"})`);
  const drill = catalog.products.find((p) => p.id === "dewalt-drill");
  ok(resolvePairs({ name: "Ops Bot", slug: "ops-bot", category: "Bot Tools" }, catalog, { pairs: { "ops-bot": [{ id: "dewalt-drill", score: 5, reason: "no" }] } }, overrides).length === 0, "Bot Tools default and ops-bot none beat a curated drill");
  ok(resolvePairs({ name: "Twain", slug: "twain", category: "Lifestyle" }, catalog, { pairs: { twain: [{ id: "shure-mv7", score: 5, reason: "no" }] } }, overrides).length === 0, "twain mic block wins");
  ok(resolvePairs({ name: "Sushi & Ramen", slug: "sushi-and-ramen", category: "Food" }, catalog, { pairs: { "sushi-and-ramen": [{ id: "instant-pot-duo", score: 5, reason: "no" }] } }, overrides).length === 0, "sushi instant-pot block wins");
  ok(resolvePairs({ name: "Pin", slug: "pin-me", category: "Home" }, catalog, { pairs: { "pin-me": [{ id: "dewalt-drill", score: 5, reason: "a" }, { id: "shure-mv7", score: 3, reason: "low" }] } }, { bots: { "pin-me": { block: ["dewalt-drill"], pin: ["mac-mini-m4"] } } }).map((h) => h.product.id).join(",") === "mac-mini-m4", "pin and block win; score below 4 is dropped");
  ok(resolvePairs({ name: "Gear", slug: "gear-bot", category: "Bot Tools" }, catalog, { pairs: { "gear-bot": [{ id: "samsung-t7", score: 5, reason: "disk" }] } }, { defaults: { category: { "Bot Tools": "none" } }, bots: { "gear-bot": { none: false } } }).map((h) => h.product.id).join(",") === "samsung-t7", "Bot Tools can opt in when the gear is clearly relevant");
  const softRows = { pairs: { "soft-bot": [{ id: "mac-mini-m4", score: 5, reason: "desk" }, { id: "dewalt-drill", score: 4, reason: "new", probation: true, auto: true }, { id: "shure-mv7", score: 4, reason: "new", probation: true, auto: true }] } };
  const softHits = resolvePairs({ name: "Soft", slug: "soft-bot", category: "Home" }, catalog, softRows, { bots: {} });
  const softSlice = listPairSlice(softHits);
  ok(softHits.filter((h) => h.soft).map((h) => h.product.id).join(",") === "dewalt-drill,shure-mv7" && softSlice.shown.length === 2 && softSlice.shown.filter((h) => h.soft).length === 1 && softSlice.extra === 1, "probation stays on the bot page, and a list card shows at most one muted chip");
  ok(!resolvePairs({ name: "Soft", slug: "soft-bot", category: "Home" }, catalog, softRows, { bots: { "soft-bot": { promote: ["dewalt-drill"] } } }).find((h) => h.product.id === "dewalt-drill").soft, "promote in pairs-overrides lifts that product");
  ok(!resolvePairs({ name: "Soft", slug: "soft-bot", category: "Home" }, catalog, softRows, { bots: {} }, { min: 3, clicks: { "soft-bot": { "shure-mv7": 3 } } }).find((h) => h.product.id === "shure-mv7").soft, "three pair_click signals lift probation");
  const curatedSlug = Object.entries(curated.pairs).find(([, rows]) => Array.isArray(rows) && rows.length && rows.some((r) => !r || r.auto !== true));
  if (curatedSlug) {
    const next = generatePairs({ bots: bots.map((b) => ({ ...b, slug: slugify(b.name) })), catalog, curated, overrides, mode: "backfill" });
    ok(JSON.stringify(next[curatedSlug[0]]) === JSON.stringify(curated.pairs[curatedSlug[0]]), `curated row ${curatedSlug[0]} is not rewritten by backfill`);
  } else ok(false, "expected at least one curated pairs row");
  ok(curated.pairs && Object.keys(curated.pairs).length === bots.length, "pairs.json has a row for every bot slug");
  const expectPairs = new Set(["local-ai-manager", "apple-desk", "micdrop", "streamer-s-dream"]);
  const badPair = [];
  for (const s of botDirs) {
    const html = fs.readFileSync(pub("bot", s, "index.html"), "utf8");
    const links = [...html.matchAll(/<a class="pair" href="(https:\/\/www\.amazon\.com\/dp\/[A-Z0-9]{10}\?tag=botshelf-20)" rel="noopener sponsored" target="_blank" data-product="([^"]+)" data-position="([123])" data-bot="[^"]+" data-surface="bot"(?: data-soft="")?>/g)];
    const shown = html.includes('class="bp-pairs"');
    if (shown !== links.length > 0 || (html.match(/amazon\.com/g) || []).length !== links.length) badPair.push(s + " section/links");
    if (shown && (html.split(catalog.disclosure).length - 1) !== 1) badPair.push(s + " disclosure once");
    if (shown && html.includes('class="assoc"')) badPair.push(s + " footer dup");
    if (!shown && html.includes("botshelf-20")) badPair.push(s + " stray");
    if (/heygen|opus\.pro|runwayml|synthesia/i.test(html)) badPair.push(s + " non-amazon");
    if (expectPairs.has(s) && !shown) badPair.push(s + " missing");
    if (s === "local-ai-manager" && (!html.includes("/dp/B0HG9JYSV9?tag=botshelf-20") || html.includes("B0D1XD1ZV3") || !html.includes("Beelink SER9"))) badPair.push("local-ai-manager ser9 asin");
    if (s === "ops-bot" && /B00ET5VMTU/.test(html)) badPair.push("ops-bot drill");
    if (s === "twain" && /B091CD47BZ|B08GYKNCCP|B07YNLBS7R/.test(html)) badPair.push("twain mic");
    if (s === "sushi-and-ramen" && /B00FLYWNYQ/.test(html)) badPair.push("sushi instant pot");
    if (s === "christian-devotional-bot" && /moleskine-classic|kjv-study-bible/.test(html)) badPair.push("christian stretch");
    if (s === "apple-inventory-and-deal-bot" && /mac-mini-m4|data-product="airpods"|airtag-4pack/.test(html)) badPair.push("apple inventory ads");
    if (s === "app-store-connect" && /mac-mini-m4/.test(html)) badPair.push("app store mac mini");
    if (s === "ibot-player" && !html.includes('data-product="airpods"')) badPair.push("ibot airpods");
    if (s === "coach" && !html.includes('data-product="garmin-265"')) badPair.push("coach garmin");
  }
  ok(!badPair.length, `bot pages: one disclosure, sponsored Amazon links only on curated pairs (bad: ${badPair.slice(0, 4).join("; ") || "none"})`);
  const shelfUp = fs.readFileSync(pub("shelf-up.js"), "utf8");
  ok(shelfUp.includes('gtag("event", "pair_click"') && shelfUp.includes("product_id") && shelfUp.includes("position") && shelfUp.includes("bot_slug") && shelfUp.includes("surface") && pageJs.includes('gtag("event", "get_bot"') && !pageJs.includes("pair_click"), "pair_click lives in shelf-up.js with bot_slug, product_id, position, surface; get_bot still fires");
  ok(appJs.includes('data-surface="home"') && appJs.includes('data-surface="builders"') && appJs.includes('data-surface="search"') && appJs.includes("card-pairs") && appJs.includes("tag=botshelf-20") && appJs.includes("pairsHTML"), "homepage cards render compact pairs from shelf-data, with home, search, and builders surfaces");
  // round 8: the first screen is drawn into #results at build time, so its builder cards may carry Pairs with chips; the
  // disclosure is then shown from the first paint instead of hidden until app.js. Outside the strip the static home stays free of them.
  const homePairs = fs.readFileSync(pub("index.html"), "utf8");
  const stripHtml = (homePairs.match(/<!-- strip:start -->[\s\S]*?<!-- strip:end -->/) || [""])[0], outside = homePairs.replace(stripHtml, "");
  const stripPairs = /amazon\.com\/dp\//.test(stripHtml), noteHidden = /<p id="pairs-note" class="assoc pairs-note" hidden>/.test(homePairs);
  ok(!/amazon\.com\/dp\//.test(outside) && !homePairs.includes("bp-pairs") && homePairs.includes('id="pairs-note"') && homePairs.split(catalog.disclosure).length === 2 && noteHidden === !stripPairs,
    `homepage static HTML: product links only inside the pre-drawn strip (${stripPairs ? "some" : "none"}), one disclosure, ${noteHidden ? "hidden" : "shown"} to match`);
  const creatorHtml = fs.readFileSync(pub("@" + handles[0], "index.html"), "utf8");
  const creatorShown = creatorHtml.includes("card-pairs");
  ok(!creatorHtml.includes('class="bp-pairs"') && (!creatorShown || (creatorHtml.split(catalog.disclosure).length - 1) === 1 && creatorHtml.includes('data-surface="creator"') && creatorHtml.includes("</a><p class=\"card-pairs\"")), "creator pages use chips under the bot link, not a Pairs section");
  const css = fs.readFileSync(pub("styles.css"), "utf8");
  ok(/\.bp-more li\{display:flex;flex-direction:column/.test(css) && /\.card>\.card-pairs\{flex:none/.test(css) && !/html\.mobile \.job-bot \.card-pairs\{margin-left:0\}/.test(css), "pair chips stack under the card on creator, home, and job lists");
  const collPages = ["collections/index.html", ...fs.readdirSync(pub("collection")).map((c) => `collection/${c}/index.html`)];
  const collBad = [];
  for (const f of collPages) {
    const html = fs.readFileSync(pub(...f.split("/")), "utf8");
    if (html.includes('class="bp-pairs"')) collBad.push(f + " section");
    const shown = html.includes("card-pairs");
    const discs = html.split(catalog.disclosure).length - 1;
    if (f === "collections/index.html") { if (shown || html.includes("botshelf-20") || discs) collBad.push(f + " index"); continue; }
    if (shown && (discs !== 1 || !html.includes('data-surface="collection"') || !html.includes("</a>"))) collBad.push(f + " disclosure");
    if (!shown && (html.includes("botshelf-20") || discs)) collBad.push(f + " stray");
  }
  ok(collPages.length > 1 && !collBad.length, `job hubs show chips and one disclosure only when a member has pairs (bad: ${collBad.slice(0, 3).join(", ") || "none"})`);
  const fit = fs.readFileSync(pub("collection", "fitness", "index.html"), "utf8");
  const homeSeo = fs.readFileSync(pub("index.html"), "utf8");
  ok(fit.includes('aria-label="Breadcrumb"') && fit.includes('class="job-more"') && fit.includes("<h3>") && fit.includes('name="twitter:image:alt"') && fit.includes('property="og:locale" content="en_US"') && !homeSeo.replace(/<!-- strip:start -->[\s\S]*?<!-- strip:end -->/, "").includes("botshelf-20"), "collection hubs: breadcrumbs, sibling jobs, bot headings, share alt; the home outside its pre-drawn strip stays free of product links");
  ok(/<title>Grok Bot Shelf: \d+ shared Grok Bot templates<\/title>/.test(homeSeo) && homeSeo.includes('name="twitter:image:alt"') && homeSeo.includes('name="robots" content="max-image-preview:large, max-snippet:-1, max-video-preview:-1"'), "homepage title matches the share title and asks for large image previews");
  ok(fs.readFileSync(pub("bot", "coach", "index.html"), "utf8").includes('"installUrl":"https://x.ai/bot/') && fs.readFileSync(pub("@" + handles[0], "index.html"), "utf8").includes('property="og:type" content="profile"') && fs.readFileSync(pub("@" + handles[0], "index.html"), "utf8").includes('class="cp-av"') && /alt="[^"]+"/.test(fs.readFileSync(pub("@" + handles[0], "index.html"), "utf8")), "bot pages name an install URL; creator pages are profiles with a named avatar");
  {
    const catHtml = fs.readFileSync(pub("category", "bot-tools", "index.html"), "utf8");
    const catLd = JSON.parse((catHtml.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/) || [])[1] || "null");
    const list = catLd && catLd["@graph"] && catLd["@graph"].find((x) => x.mainEntity && x.mainEntity["@type"] === "ItemList").mainEntity;
    const fitGuide = fs.readFileSync(pub("collection", "fitness", "index.html"), "utf8");
    const fitLd = JSON.parse((fitGuide.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/) || [])[1]);
    const words = (fitGuide.match(/<div class="hub-guide">([\s\S]*?)<\/div>/) || ["", ""])[1].replace(/<[^>]+>/g, " ").trim().split(/\s+/).filter(Boolean).length;
    const { GUIDE_MIN, GUIDE_MAX } = require(path.join(TMP, "scripts", "hub-copy"));
    ok(catHtml.includes("<h1>Bot Tools</h1>") && catHtml.includes('aria-label="Breadcrumb"') && /\/og\/category\/bot-tools\.png/.test(catHtml) && list.numberOfItems > 0 && list.category === "Bot Tools" && list.itemListElement.length === list.numberOfItems, `category hub lists Bot Tools (${list && list.numberOfItems})`);
    ok(fitGuide.includes('"@type":"FAQPage"') && fitLd["@graph"].some((x) => x["@type"] === "FAQPage" && x.mainEntity.length === 3) && words >= GUIDE_MIN && words <= GUIDE_MAX && fitGuide.includes('href="/category/'), `job hub guide is ${words} words (${GUIDE_MIN}–${GUIDE_MAX}), with FAQPage and a category link`);
    // Picks before prose: the Start here list comes before the guide, and the guide before More like this (round 9, B1).
    const at = (s) => fitGuide.indexOf(s);
    ok(at('id="start-h"') > 0 && at('id="start-h"') < at('class="hub-guide"') && at('class="hub-guide"') < at('id="more-h"'), "job hub: Start here, then the guide, then More like this");
    const fitJson = jobFile.collections.find((c) => c.slug === "fitness");
    ok(fitJson && fitJson.guide && !fitGuide.includes("not a pile of lookalikes") && fitGuide.includes(fitJson.guide.split(". ")[0]), "job hub guide is the hand-written copy from collections.json, not the old template");
    const stacksHtml = fs.readFileSync(pub("stacks", "index.html"), "utf8");
    const firstStack = stacksHtml.indexOf('class="stack-steps"'), firstGuide = stacksHtml.indexOf('class="hub-guide"');
    ok(firstStack > 0 && firstStack < firstGuide && stacksHtml.indexOf('class="stack-index"') < firstGuide, "stacks: each stack's steps come before its guide, and the index guide sits under the list");
    ok(fs.readFileSync(path.join(ROOT, "vercel.json"), "utf8").includes('"trailingSlash": false'), "trailingSlash false sends /bot/slug/ to /bot/slug");
    // round 8: a category meta description is whole sentences within 155 characters (they used to clip mid-sentence with "...")
    const catMetas = fs.readdirSync(pub("category")).filter((d) => fs.existsSync(pub("category", d, "index.html")) && d !== "index.html")
      .map((d) => (fs.readFileSync(pub("category", d, "index.html"), "utf8").match(/<meta name="description" content="([^"]*)"/) || [])[1] || "");
    const clipped = catMetas.filter((m) => !m || m.length > 155 || !/[.!?]$/.test(m) || m.endsWith("..."));
    ok(catMetas.length > 0 && !clipped.length, `category meta descriptions end on a full sentence within 155 characters (${clipped.length} of ${catMetas.length} do not)`);
  }
  {
    const { assertPairKeys, resetPairCache } = require(path.join(TMP, "scripts", "pairs"));
    const file = pub("pairs.json");
    const saved = fs.readFileSync(file, "utf8");
    const doc = JSON.parse(saved);
    const victim = "local-ai-manager";
    delete doc.pairs[victim];
    let threw = false;
    try { assertPairKeys(bots.map((b) => ({ ...b, slug: slugify(b.name) })), doc); } catch (e) { threw = /missing/.test(e.message) && /pairs-gen/.test(e.message); }
    ok(threw, "build check throws when a bot slug is missing from pairs.json");
    fs.writeFileSync(file, JSON.stringify(doc, null, 1) + "\n");
    resetPairCache();
    execFileSync(process.execPath, [path.join(TMP, "scripts", "pairs-gen.js")], { encoding: "utf8" });
    const filled = JSON.parse(fs.readFileSync(file, "utf8")).pairs[victim];
    ok(Array.isArray(filled) && filled.length > 0 && filled.every((r) => r.auto === true), `pairs-gen fills a missing slug and marks it auto (${victim}: ${(filled || []).map((r) => r.id).join(",")})`);
    fs.writeFileSync(file, saved);
    resetPairCache();
  }
  // A missing or outdated small copy falls back to the original
  const victim = data.find((d) => /\/avatars\/48\//.test(d.avatar_sm)), vf = /^\/avatars\/([^/?]+)/.exec(victim.creator_avatar)[1];
  fs.rmSync(pub("avatars", "48", vf.replace(/\.\w+$/, ".webp")));
  execFileSync(process.execPath, [path.join(TMP, "scripts", "build.js")], { encoding: "utf8", env: { ...process.env, GA_MEASUREMENT_ID: "", GSC_VERIFICATION: "" } });
  const after = JSON.parse(fs.readFileSync(pub("shelf-data.json"), "utf8")).bots.find((d) => d.name === victim.name);
  ok(after.avatar_sm === after.creator_avatar && after.avatar_sm.startsWith(`/avatars/${vf}?v=`), `missing small copy falls back to the original (${after.avatar_sm})`);
  // The mark and the title are one link to / on every page that renders the shelf header.
  const walk = (dir, out = []) => { for (const name of fs.readdirSync(dir)) { const p = path.join(dir, name), st = fs.statSync(p); if (st.isDirectory()) walk(p, out); else if (name.endsWith(".html")) out.push(p); } return out; };
  const brandRe = /<a class="home(?: gbs-brand)?" href="\/"><svg class="mark"[\s\S]*?<\/svg>Grok Bot Shelf<\/a>/;
  const badBrand = [];
  let headers = 0, homeOk = false;
  for (const f of walk(pub())) {
    const html = fs.readFileSync(f, "utf8");
    const header = html.match(/<header class="wrap hero">[\s\S]*?<\/header>/);
    if (!header) continue;
    headers++;
    const rel = path.relative(pub(), f);
    const lab = /\blab-desk\b/.test(html);
    if (!brandRe.test(header[0])) badBrand.push(rel);
    if (rel === "index.html") homeOk = /<h1 class="shelf-h1">[\d,]+ Grok Bot templates you can import<\/h1>/.test(header[0]) && /<a class="home gbs-brand" href="\/">/.test(header[0]) && !/<h1><a class="home gbs-brand"/.test(header[0]) && header[0].includes('href="/collections">Find by job</a>');
    if (!lab && !/<a class="btn add-top" href="\/add"/.test(header[0])) badBrand.push(rel + " missing add");
    if (!lab && !header[0].includes('class="btn gift-top"')) badBrand.push(rel + " missing gift");
    if (!header[0].includes('id="theme"')) badBrand.push(rel + " missing theme");
    if (rel !== "index.html" && header[0].includes("gbs-brand")) badBrand.push(rel + " homepage brand class");
  }
  ok(headers > 100 && !badBrand.length && homeOk, `header logo links home on ${headers} pages (bad: ${badBrand.slice(0, 4).join(", ") || "none"})`);
} finally {
  fs.rmSync(TMP, { recursive: true, force: true });
}
