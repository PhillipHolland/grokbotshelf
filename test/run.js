// Runs the test suites and prints one summary. Exit code 1 if anything failed.
//
//   node test/run.js                     # everything: node suites, then browser suites against a fresh local build
//   node test/run.js --fast              # node suites only (no Chrome, no server): seconds, run before every commit
//   node test/run.js --browser           # browser suites only
//   node test/run.js --only search,e2e   # just these suites (names are file names without .js)
//   node test/run.js https://preview/    # browser suites against a deployment instead of a local build
//   node test/run.js --list              # print the suites and their kind, run nothing
//
// Suites are discovered, not listed: every test/*.js that is not a helper (HELPERS below) is a suite, so a new test
// file runs without editing this one. A suite that requires puppeteer-core is a browser suite and gets the base URL as
// its first argument; anything else is a node suite and must not need a browser or the network. A suite reports with
// lines that start "PASS " or "FAIL " and exits non-zero on failure (test/validate.js is a short example).
//
// Browser suites need puppeteer-core (npm ci) and Chrome at /usr/bin/google-chrome or wherever CHROME points.
// Each suite gets SUITE_TIMEOUT seconds (default 600; pagecss alone takes 4 to 5 minutes) and is reported as TIMED OUT,
// not as a crash, when it runs out.
const fs = require("fs"), path = require("path"), { spawnSync } = require("child_process");

// Shared code that other tests require. They print no PASS lines and are never run directly.
const HELPERS = new Set(["run", "serve", "tempsite", "scroll-all"]);
// build.js runs first: when the build is broken, everything after it fails for the same reason.
const FIRST = ["build"];
const TIMEOUT_S = Math.max(1, Number(process.env.SUITE_TIMEOUT) || 600);

function discover(dir = __dirname) {
  return fs.readdirSync(dir).filter((f) => f.endsWith(".js") && !HELPERS.has(f.slice(0, -3))).map((f) => {
    const name = f.slice(0, -3), src = fs.readFileSync(path.join(dir, f), "utf8");
    return { name, file: path.join(dir, f), browser: /require\(\s*['"]puppeteer-core['"]\s*\)/.test(src) };
  }).sort((a, b) => (FIRST.includes(b.name) - FIRST.includes(a.name)) || (a.browser - b.browser) || a.name.localeCompare(b.name));
}

function parseArgs(argv) {
  const o = { fast: false, browser: false, list: false, only: null, base: null };
  const names = (s) => String(s || "").split(",").map((x) => x.trim().replace(/\.js$/, "")).filter(Boolean);
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--fast") o.fast = true;
    else if (a === "--browser") o.browser = true;
    else if (a === "--list") o.list = true;
    else if (a === "--only") o.only = names(argv[++i]);
    else if (a.startsWith("--only=")) o.only = names(a.slice(7));
    else if (/^https?:\/\//.test(a)) o.base = a;
    else throw new Error(`unknown argument ${JSON.stringify(a)} (see the top of test/run.js)`);
  }
  return o;
}

function select(suites, o) {
  if (o.only) {
    const known = new Set(suites.map((s) => s.name)), missing = o.only.filter((n) => !known.has(n));
    if (missing.length) throw new Error(`no suite named ${missing.join(", ")} (node test/run.js --list)`);
    return suites.filter((s) => o.only.includes(s.name));
  }
  if (o.fast) return suites.filter((s) => !s.browser);
  if (o.browser) return suites.filter((s) => s.browser);
  return suites;
}

module.exports = { discover, parseArgs, select, HELPERS };

if (require.main === module) (async () => {
  let o, picked;
  try { o = parseArgs(process.argv.slice(2)); picked = select(discover(), o); }
  catch (e) { console.error(e.message); process.exit(2); }
  if (o.list) { for (const s of picked) console.log(`${s.browser ? "browser" : "node   "} ${s.name}`); return; }

  let site, base = o.base;
  if (!base && picked.some((s) => s.browser)) { site = await require("./tempsite")(null, { images: true }); base = site.base; }
  const results = [];
  for (const s of picked) {
    console.log(`== ${s.name}`);
    const t0 = Date.now();
    const r = spawnSync(process.execPath, s.browser ? [s.file, base] : [s.file], { encoding: "utf8", env: process.env, timeout: TIMEOUT_S * 1000, maxBuffer: 64 * 1024 * 1024 });
    process.stdout.write(r.stdout || ""); process.stderr.write(r.stderr || "");
    const out = r.stdout || "", pass = (out.match(/^PASS /gm) || []).length, fail = (out.match(/^FAIL /gm) || []).length;
    // No PASS line at all counts as a failure too: a suite that silently checks nothing is broken.
    const timedOut = !!(r.error && r.error.code === "ETIMEDOUT");
    if (timedOut) console.log(`FAIL ${s.name} did not finish in ${TIMEOUT_S}s (SUITE_TIMEOUT)`);
    results.push({ name: s.name, pass, fail: fail + (timedOut ? 1 : 0), code: r.status, ms: Date.now() - t0, timedOut, crashed: !timedOut && r.status !== 0 && !fail, empty: !timedOut && !pass && !fail });
  }
  if (site) site.close();

  console.log(`\n== summary${base ? " (" + base + ")" : ""}`);
  const width = Math.max(7, ...results.map((r) => r.name.length));
  for (const r of results) console.log(`${r.name.padEnd(width)} ${r.pass} pass, ${r.fail} fail, ${(r.ms / 1000).toFixed(1)}s${r.timedOut ? ", TIMED OUT" : ""}${r.crashed ? `, CRASHED (exit ${r.code})` : ""}${r.empty ? ", NO CHECKS RAN" : ""}`);
  const t = results.reduce((a, r) => [a[0] + r.pass, a[1] + r.fail], [0, 0]);
  console.log(`${"total".padEnd(width)} ${t[0]} pass, ${t[1]} fail`);
  const bad = results.filter((r) => r.fail || r.code !== 0 || r.empty).map((r) => r.name);
  if (bad.length) console.log(`\nfailed: ${bad.join(", ")}\nre-run just those: node test/run.js --only ${bad.join(",")}`);
  process.exit(bad.length ? 1 : 0);
})();
