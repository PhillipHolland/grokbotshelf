// Round 4 build checks on temporary copies of the repo (the working tree is left alone): data-driven controls
// appear only when the data has them. Usage: node test/round4data.js
const fs = require("fs"), os = require("os"), path = require("path"), { execFileSync } = require("child_process");
const ok = (c, m) => { console.log((c ? "PASS " : "FAIL ") + m); if (!c) process.exitCode = 1; };
const ROOT = path.join(__dirname, "..");
// A copy without the share images and avatars (the build only checks those exist), built after edit(pub) runs
function build(edit) {
  const TMP = fs.mkdtempSync(path.join(os.tmpdir(), "shelf-r4data-"));
  fs.cpSync(path.join(ROOT, "scripts"), path.join(TMP, "scripts"), { recursive: true });
  fs.cpSync(path.join(ROOT, "public"), path.join(TMP, "public"), { recursive: true, filter: (s) => !/[\\/]public[\\/](og|avatars|bot|@[^\\/]*)([\\/]|$)/.test(s) });
  const pub = (...p) => path.join(TMP, "public", ...p), J = (f) => JSON.parse(fs.readFileSync(pub(f), "utf8"));
  if (edit) edit({ pub, J, W: (f, o) => fs.writeFileSync(pub(f), JSON.stringify(o, null, 2) + "\n") });
  execFileSync(process.execPath, [path.join(TMP, "scripts", "build.js")], { encoding: "utf8", env: { ...process.env, GA_MEASUREMENT_ID: "", GSC_VERIFICATION: "" } });
  const r = { data: J("shelf-data.json").bots, index: fs.readFileSync(pub("index.html"), "utf8"), page: (s) => fs.readFileSync(pub("bot", s, "index.html"), "utf8"), bots: J("bots.json") };
  TMPS.push(TMP);
  return r;
}
const { slugify, templateId } = require(path.join(ROOT, "scripts", "shelf"));
const SECTIONS = [], TMPS = [];
process.on("exit", () => TMPS.forEach((t) => fs.rmSync(t, { recursive: true, force: true })));

// #3 Faith: categories come from the data, so Faith shows only when a bot has it, and every bot keeps its category
SECTIONS.push(() => {
  const none = build(({ J, W }) => { const b = J("bots.json"); b.forEach((x) => { if (x.category === "Faith") x.category = "Lifestyle"; }); W("bots.json", b); });
  ok(!none.data.some((b) => b.category === "Faith") && !/\?cat=faith"/.test(none.page(slugify(none.bots[0].name))), "#3 no Faith bots: no Faith category anywhere in the build");
  const some = build(({ J, W }) => { const b = J("bots.json"); b.forEach((x) => { if (x.category === "Faith") x.category = "Lifestyle"; }); b.slice(0, 2).forEach((x) => { x.category = "Faith"; }); W("bots.json", b); });
  const s0 = slugify(some.bots[0].name);
  ok(some.data.filter((b) => b.category === "Faith").length === 2 && some.page(s0).includes('href="/?cat=faith">Faith</a>'), "#3 two Faith bots: in shelf-data and linked from their pages as /?cat=faith");
  ok(some.data.length === some.bots.length, `#3 bot count unchanged (${some.data.length})`);
});

(async () => { for (const s of SECTIONS) await s(); })().catch((e) => { console.error(e); process.exit(1); });
