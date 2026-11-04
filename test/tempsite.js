// Test helper: a built copy of the site in a temp folder (share images and avatars left out), served by test/serve.js
// on a free port. edit({ J, W, pub }) changes the source data before the build. Returns { base, pub, close }.
const fs = require("fs"), os = require("os"), path = require("path"), net = require("net"), { execFileSync, spawn } = require("child_process");
const ROOT = path.join(__dirname, "..");
const freePort = () => new Promise((r) => { const s = net.createServer().listen(0, () => { const p = s.address().port; s.close(() => r(p)); }); });
module.exports = async function tempSite(edit, { images = false } = {}) {
  const TMP = fs.mkdtempSync(path.join(os.tmpdir(), "shelf-site-"));
  for (const d of ["scripts", "test"]) fs.cpSync(path.join(ROOT, d), path.join(TMP, d), { recursive: true });
  fs.copyFileSync(path.join(ROOT, "vercel.json"), path.join(TMP, "vercel.json"));
  fs.cpSync(path.join(ROOT, "public"), path.join(TMP, "public"), { recursive: true, filter: (s) => images || !/[\\/]public[\\/](og|avatars)([\\/]|$)/.test(s) });
  const pub = (...p) => path.join(TMP, "public", ...p), J = (f) => JSON.parse(fs.readFileSync(pub(f), "utf8"));
  if (edit) edit({ pub, J, W: (f, o) => fs.writeFileSync(pub(f), JSON.stringify(o, null, 2) + "\n") });
  // A test that shrinks bots.json would fail the build: collections.json and stacks.json name bots that are gone (the
  // build refuses an unknown slug, fewer than 5 stacks, or a stack under 2 bots). Trim both to the bots that are left,
  // and pad a short stack or an empty hub with other kept bots: real bots, a fixture-only grouping.
  const { slugify } = require(path.join(TMP, "scripts", "shelf"));
  const keptBots = J("bots.json"), kept = new Set(keptBots.map((b) => slugify(b.name)));
  const all = JSON.parse(fs.readFileSync(path.join(ROOT, "public", "bots.json"), "utf8")).length;
  if (kept.size < all) {
    const byUrl = new Map(keptBots.map((b) => [b.url, slugify(b.name)]));
    const slugOf = (ref) => kept.has(ref) ? ref : byUrl.get(ref) || null;
    const fill = [...kept];
    let next = 0;
    const pad = (list, n) => { const out = list.slice(); for (let i = 0; out.length < n && i < fill.length; i++) { const s = fill[(next + i) % fill.length]; if (!out.includes(s)) out.push(s); } next = (next + n) % fill.length; return out; };
    const W2 = (f, o) => fs.writeFileSync(pub(f), JSON.stringify(o, null, 1) + "\n");
    if (fs.existsSync(pub("collections.json"))) {
      const c = J("collections.json");
      c.collections = (c.collections || []).map((col) => {
        let bots = (col.bots || []).map(slugOf).filter(Boolean);
        const picks = (col.picks || col.rank || []).map(slugOf).filter((s) => s && bots.includes(s)).slice(0, 3);
        if (!picks.length) { bots = pad(bots, 1); picks.push(bots[0]); }
        bots = pad(bots, picks.length + 1); // the build wants a bot besides the picks, for "More like this"
        const out = { ...col, bots, picks }; delete out.rank; return out;
      });
      W2("collections.json", c);
    }
    if (fs.existsSync(pub("stacks.json"))) {
      const s = J("stacks.json");
      s.stacks = (s.stacks || []).map((st) => ({ ...st, bots: pad((st.bots || []).map(slugOf).filter(Boolean), 2).slice(0, 6) }));
      W2("stacks.json", s);
    }
  }
  execFileSync(process.execPath, [path.join(TMP, "scripts", "build.js")], { encoding: "utf8", env: { ...process.env, GA_MEASUREMENT_ID: "", GSC_VERIFICATION: "" } });
  const port = await freePort();
  const srv = spawn(process.execPath, [path.join(TMP, "test", "serve.js"), String(port)], { stdio: ["ignore", "pipe", "inherit"] });
  await new Promise((r) => srv.stdout.once("data", r));
  return { base: `http://localhost:${port}/`, pub, J, close: () => { srv.kill(); fs.rmSync(TMP, { recursive: true, force: true }); } };
};
