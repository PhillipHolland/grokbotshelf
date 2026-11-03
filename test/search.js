// Search scorer regressions. Runs the block in public/app.js (the same one the homepage uses)
// against public/bots.json. No browser. Usage: node test/search.js
const fs = require("fs"), path = require("path");
const ok = (c, m) => { console.log((c ? "PASS " : "FAIL ") + m); if (!c) process.exitCode = 1; };
const src = fs.readFileSync(path.join(__dirname, "..", "public", "app.js"), "utf8");
const block = src.match(/\/\* gbs-search:start \*\/([\s\S]*?)\/\* gbs-search:end \*\//);
if (!block) { console.log("FAIL app.js is missing the gbs-search block"); process.exit(1); }
const api = new Function(block[1] + "\nreturn gbsSearch();")();
const bots = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "public", "bots.json"), "utf8"))
  .map((b, i) => ({ ...b, _i: i, _f: api.fields(b) }));
const ranked = (q) => api.rank(bots, q).sort((a, b) => b[1].score - a[1].score || a[0]._i - b[0]._i);
const names = (q) => ranked(q).map(([b]) => b.name);
const show = (q, n = 6) => names(q).slice(0, n).join(" | ") || "(empty)";
const topHas = (q, re, n = 5) => {
  const list = names(q);
  ok(list.length > 0 && list.slice(0, n).some((x) => re.test(x)), `"${q}" → ${show(q)}`);
};

topHas("meal planning", /meal plan/i);
topHas("budgeting", /budget/i);
{
  const list = names("parenting");
  ok(list.length >= 8 && /^Parent/.test(list[0]) && /^Parent/.test(list[1]),
    `"parenting" ${list.length} hits, parent-named bots first (${show("parenting")})`);
}
ok(names("cline bot")[0] === "cline", `"cline bot" first is ${names("cline bot")[0]}`);
ok(/^Fern/.test(names("fern bot")[0] || ""), `"fern bot" first is ${names("fern bot")[0]}`);
topHas("bot for my taxes", /tax/i, 3);
topHas("plan my week", /plan|week/i, 3);
ok(names("shelfr")[0] === "Shelfer", `"shelfr" first is ${names("shelfr")[0]} (${show("shelfr", 4)})`);
{
  const list = names("coach");
  ok(list[0] === "Coach" && list.indexOf("Coach Sam") > 0, `"coach" exact name first, Coach Sam later (${show("coach", 4)})`);
}
ok(names("secruity")[0] === "Security" && names("secruity").includes("Security Audit Bot"), `"secruity" closest name first (${show("secruity", 3)})`);
ok(names("zzzzqqq").length === 0, `nonsense stays empty (${names("zzzzqqq").length})`);
{
  const mail = names("mail");
  const named = bots.filter((b) => api.fold(b.name).includes("mail")).map((b) => b.name);
  const head = mail.slice(0, named.length);
  ok(named.length >= 2 && named.every((n) => head.includes(n)) && mail.length > named.length,
    `names containing "mail" (${named.length}) rank before description-only matches`);
}
{
  const list = names("@weeb3dev");
  ok(list.includes("cline"), `"@weeb3dev" includes cline (${show("@weeb3dev", 3)})`);
}
ok(/searching \? \(a, b\) => b\[1\]\.score - a\[1\]\.score/.test(src), "a non-empty query sorts by relevance before the selected sort");
{
  const read = (rel) => fs.readFileSync(path.join(__dirname, "..", "public", rel), "utf8");
  const header = (html) => (html.match(/<header class="wrap hero">[\s\S]*?<\/header>/) || [""])[0];
  for (const rel of ["bot/meal-planner/index.html", "@weeb3dev/index.html", "category/food/index.html", "collections/index.html", "stacks/index.html", "404.html", "add/index.html"]) {
    const h = header(read(rel));
    ok(h.includes('class="hero-find"') && h.includes('action="/"') && h.includes('name="q"') && h.includes('id="theme"'), `${rel} header searches the shelf`);
  }
  const home = header(read("index.html"));
  ok(!home.includes("hero-find") && read("index.html").includes('id="q"'), "homepage header leaves search to the dock");
}
{
  const build = fs.readFileSync(path.join(__dirname, "..", "scripts", "build.js"), "utf8");
  ok(build.includes('class="hero-find"') && build.includes('action="/"') && build.includes('name="q"') && build.includes("title ? \"\" : HERO_FIND"),
    "site header form submits the query to /?q=, and the homepage keeps the dock");
}
