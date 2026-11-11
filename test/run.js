// Runs the whole suite: the build smoke test, then every browser test against a fresh build of the site in a temp
// copy (test/tempsite.js, served by test/serve.js on a free port) or against a base URL you pass. A fresh build, so
// the suite checks what Vercel would deploy even when a bots.json commit skipped the generated output. Prints a summary; exit code 1 if anything failed.
// Needs puppeteer-core outside the repo, e.g.  NODE_PATH=/path/to/node_modules node test/run.js [base-url]
const { spawnSync } = require("child_process"), path = require("path");
const tempSite = require("./tempsite");
const SUITES = ["search", "submitdetails", "creators-refresh", "credit", "e2e", "more", "reset", "submit", "rail", "add", "chrome", "face", "font", "theme", "pages", "prefetch", "votes", "votecap", "totop", "targets", "reuse", "votepaint", "cards", "pagetargets", "a11y", "creatorlinks", "ondemand", "cover", "headers", "addpage", "retry", "cls", "round3", "round4", "votestyle", "votewords", "sharepill", "faith", "round4data", "collections", "roles", "gallery", "gallerydpr", "filterchunk", "railcls", "pagecss", "prerender"];
(async () => {
  let base = process.argv[2], site;
  if (!base) { site = await tempSite(null, { images: true }); base = site.base; }
  const results = [];
  const run = (name, args) => {
    console.log(`== ${name}`);
    const r = spawnSync(process.execPath, args, { encoding: "utf8", env: process.env, timeout: 300000 });
    process.stdout.write(r.stdout || ""); process.stderr.write(r.stderr || "");
    const out = r.stdout || "", pass = (out.match(/^PASS /gm) || []).length, fail = (out.match(/^FAIL /gm) || []).length;
    results.push({ name, pass, fail, code: r.status, crashed: r.status !== 0 && !fail });
  };
  run("build", [path.join(__dirname, "build.js")]);
  for (const s of SUITES) run(s, [path.join(__dirname, s + ".js"), base]);
  if (site) site.close();
  console.log("\n== summary (" + base + ")");
  let bad = false;
  for (const r of results) { console.log(`${r.name.padEnd(7)} ${r.pass} pass, ${r.fail} fail${r.crashed ? ", CRASHED (exit " + r.code + ")" : ""}`); if (r.fail || r.code !== 0) bad = true; }
  const t = results.reduce((a, r) => [a[0] + r.pass, a[1] + r.fail], [0, 0]);
  console.log(`total   ${t[0]} pass, ${t[1]} fail`);
  process.exit(bad ? 1 : 0);
})();
