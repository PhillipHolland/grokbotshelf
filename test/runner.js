// test/run.js itself: suite discovery, the browser/node split, and the command-line flags. No browser.
// Usage: node test/runner.js
const fs = require("fs"), path = require("path");
const { discover, parseArgs, select, HELPERS } = require("./run");
const ok = (c, m) => { console.log((c ? "PASS " : "FAIL ") + m); if (!c) process.exitCode = 1; };

const suites = discover(), byName = new Map(suites.map((s) => [s.name, s]));
ok(suites[0].name === "build", "build runs first");
{ const i = suites.findIndex((s) => s.browser); ok(i > 0 && suites.slice(i).every((s) => s.browser), "node suites run before browser suites"); }
ok([...HELPERS].every((h) => !byName.has(h)), `helpers are not suites (${[...HELPERS].join(", ")})`);
ok(["validate", "apisearch", "submitlinks", "search", "votes", "headers"].every((n) => byName.has(n) && !byName.get(n).browser), "API and data suites are node suites");
ok(["e2e", "pages", "a11y"].every((n) => byName.get(n) && byName.get(n).browser), "page suites are browser suites");

// Every suite reports PASS/FAIL lines, and every helper is required by some test (else it is a stray file).
const src = (f) => fs.readFileSync(path.join(__dirname, f), "utf8");
{ const silent = suites.filter((s) => !/["'`]PASS /.test(src(s.name + ".js"))).map((s) => s.name); ok(!silent.length, `every suite prints PASS lines${silent.length ? " (not: " + silent.join(", ") + ")" : ""}`); }
{
  const all = fs.readdirSync(__dirname).filter((f) => f.endsWith(".js")).map(src).join("\n");
  const unused = [...HELPERS].filter((h) => h !== "run" && !new RegExp(`require\\(\\s*["']\\./${h}["']\\s*\\)`).test(all));
  ok(!unused.length, `every helper is required by a test${unused.length ? " (unused: " + unused.join(", ") + ")" : ""}`);
}
// A node suite must not reach for a browser: the fast tier runs where Chrome is not installed.
{ const bad = suites.filter((s) => !s.browser && s.name !== "runner" && /google-chrome|launch\(\{/.test(src(s.name + ".js"))).map((s) => s.name); ok(!bad.length, `node suites do not launch Chrome${bad.length ? " (" + bad.join(", ") + ")" : ""}`); }

// Flags
ok(select(suites, parseArgs(["--fast"])).every((s) => !s.browser), "--fast picks node suites only");
ok(select(suites, parseArgs(["--browser"])).every((s) => s.browser), "--browser picks browser suites only");
ok(select(suites, parseArgs([])).length === suites.length, "no flag runs everything");
{ const p = select(suites, parseArgs(["--only", "validate,e2e.js"])); ok(p.map((s) => s.name).join() === "validate,e2e", "--only takes a comma list, .js optional"); }
{ const p = select(suites, parseArgs(["--only=search"])); ok(p.length === 1 && p[0].name === "search", "--only=name works too"); }
{ let e; try { select(suites, parseArgs(["--only", "nope"])); } catch (x) { e = x; } ok(e && /no suite named nope/.test(e.message), "an unknown suite name is an error, not a silent empty run"); }
{ let e; try { parseArgs(["--fsat"]); } catch (x) { e = x; } ok(e && /unknown argument "--fsat"/.test(e.message), "an unknown flag is an error"); }
ok(parseArgs(["https://preview.example/"]).base === "https://preview.example/", "a URL argument is the base for browser suites");
