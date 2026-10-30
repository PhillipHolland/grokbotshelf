// Runs the whole suite: the build smoke test, then every browser test against a local copy of the site
// (test/serve.js on a free port) or against a base URL you pass. Prints a summary; exit code 1 if anything failed.
// Needs puppeteer-core outside the repo, e.g.  NODE_PATH=/path/to/node_modules node test/run.js [base-url]
const { spawn, spawnSync } = require("child_process"), net = require("net"), path = require("path");
const SUITES = ["credit", "e2e", "more", "reset", "submit", "rail", "add", "chrome", "face", "theme", "pages", "prefetch", "votes", "votecap", "totop", "targets", "reuse", "votepaint", "cards", "pagetargets", "a11y", "creatorlinks", "ondemand", "cover", "headers", "addpage", "retry", "cls", "round3", "round4", "votestyle", "votewords", "sharepill"];
const freePort = () => new Promise((r) => { const s = net.createServer().listen(0, () => { const p = s.address().port; s.close(() => r(p)); }); });
(async () => {
  let base = process.argv[2], server;
  if (!base) {
    const port = await freePort();
    server = spawn(process.execPath, [path.join(__dirname, "serve.js"), String(port)], { stdio: ["ignore", "pipe", "inherit"] });
    await new Promise((r) => server.stdout.once("data", r));
    base = `http://localhost:${port}/`;
  }
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
  if (server) server.kill();
  console.log("\n== summary (" + base + ")");
  let bad = false;
  for (const r of results) { console.log(`${r.name.padEnd(7)} ${r.pass} pass, ${r.fail} fail${r.crashed ? ", CRASHED (exit " + r.code + ")" : ""}`); if (r.fail || r.code !== 0) bad = true; }
  const t = results.reduce((a, r) => [a[0] + r.pass, a[1] + r.fail], [0, 0]);
  console.log(`total   ${t[0]} pass, ${t[1]} fail`);
  process.exit(bad ? 1 : 0);
})();
