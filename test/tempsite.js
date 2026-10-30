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
  execFileSync(process.execPath, [path.join(TMP, "scripts", "build.js")], { encoding: "utf8", env: { ...process.env, GA_MEASUREMENT_ID: "", GSC_VERIFICATION: "" } });
  const port = await freePort();
  const srv = spawn(process.execPath, [path.join(TMP, "test", "serve.js"), String(port)], { stdio: ["ignore", "pipe", "inherit"] });
  await new Promise((r) => srv.stdout.once("data", r));
  return { base: `http://localhost:${port}/`, pub, J, close: () => { srv.kill(); fs.rmSync(TMP, { recursive: true, force: true }); } };
};
