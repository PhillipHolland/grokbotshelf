// scripts/add-bot.js: fills a new listing's optional fields from the shelf, refuses anything scripts/validate.js
// rejects, and writes bots.json and pairs.json together. The write test runs on a temporary copy (the working tree is
// left alone) with --no-build. No browser. Usage: node test/addbot.js
const fs = require("fs"), os = require("os"), path = require("path"), { spawnSync } = require("child_process");
const { complete, plan } = require("../scripts/add-bot");
const ok = (c, m) => { console.log((c ? "PASS " : "FAIL ") + m); if (!c) process.exitCode = 1; };

const ROOT = path.join(__dirname, ".."), PUB = path.join(ROOT, "public");
const shelf = JSON.parse(fs.readFileSync(path.join(PUB, "bots.json"), "utf8"));
const opts = { pub: PUB, today: "2026-11-26" };
const known = shelf.find((b) => b.creator_handle && b.creator_avatar && b.creator_name);
const fresh = { name: "Zz Test Listing", emoji: "🧪", description: "Checks the add-bot script.", category: shelf[0].category, url: "https://x.ai/bot/ZzTestListing01" };

// complete(): defaults
{
  const [b] = complete([{ ...fresh, creator_handle: known.creator_handle.slice(1) }], shelf, opts);
  ok(b.creator_handle === known.creator_handle, `a handle without @ gets one (${b.creator_handle})`);
  ok(b.creator_url === "https://x.com/" + known.creator_handle.slice(1), "creator_url comes from the handle");
  ok(b.creator_name && shelf.some((x) => x.creator_handle.toLowerCase() === known.creator_handle.toLowerCase() && x.creator_name === b.creator_name), `creator_name comes from the shelf (${b.creator_name})`);
  ok(b.creator_avatar && fs.existsSync(path.join(PUB, b.creator_avatar)), `creator_avatar is an existing file (${b.creator_avatar})`);
  ok(b.added === "2026-11-26" && b.source_post === "", "added defaults to today and source_post to empty");
  ok(Object.keys(b).slice(0, 5).join() === "name,emoji,description,category,url", "keys are in the file's usual order");
}
{
  const [b] = complete([{ ...fresh, creator_handle: "@Brand_New_Maker", creator_name: " Maker ", added: "2026-11-01" }], shelf, opts);
  ok(b.creator_name === "Maker" && b.added === "2026-11-01" && b.creator_avatar === "", "given values win, strings are trimmed, an unknown handle gets no avatar");
}
{ const [b] = complete([{ ...fresh }], shelf, opts); ok(b.creator_handle === "" && b.creator_url === "" && b.creator_name === "", "no handle leaves the creator fields empty"); }

// plan(): validation, nothing written
{
  const r = plan({ ...fresh, creator_handle: known.creator_handle }, shelf, opts);
  ok(!r.errors.length && r.bots.length === shelf.length + 1 && r.bots[shelf.length].name === fresh.name, "a good bot is appended at the end");
  ok(!r.warnings.length, `a complete listing has no warnings${r.warnings.length ? ": " + r.warnings.join(" | ") : ""}`);
}
{ const r = plan({ ...fresh, name: shelf[0].name }, shelf, opts); ok(r.errors.some((e) => /same page slug/.test(e)), "a name already on the shelf is refused"); }
{ const r = plan({ ...fresh, url: shelf[0].url }, shelf, opts); ok(r.errors.some((e) => /same template link/.test(e)), "a template already on the shelf is refused"); }
{ const r = plan({ ...fresh, description: "" }, shelf, opts); ok(r.errors.some((e) => /"description" is required/.test(e)), "a missing description is refused"); }
{ const r = plan([], shelf, opts); ok(r.errors.length === 1, "an empty list is refused"); }
{
  const r = plan({ ...fresh, category: "Productivty" }, shelf, opts);
  ok(r.warnings.some((w) => /"Productivty" is used by this bot only \(did you mean "Productivity"\?\)/.test(w)), "a mistyped category is a warning with a suggestion");
}
{ const r = plan({ ...fresh, creator_handle: "@Brand_New_Maker", creator_name: "Maker" }, shelf, opts); ok(r.warnings.some((w) => /no avatar for @Brand_New_Maker/.test(w)), "a new creator with no avatar file is a warning that says where to put it"); }
{ const r = plan({ ...fresh }, shelf, opts); ok(r.warnings.length === 1 && /no creator credit/.test(r.warnings[0]), "only the new bot's warnings are shown, not the shelf's"); }
{
  const two = plan([fresh, { ...fresh, name: "Zz Second", url: "https://x.ai/bot/ZzTestListing02" }], shelf, opts);
  ok(!two.errors.length && two.added.length === 2, "an array adds several bots at once");
  const dup = plan([fresh, { ...fresh, name: "Zz Second" }], shelf, opts);
  ok(dup.errors.some((e) => /same template link/.test(e)), "two new bots with the same link are refused");
}

// The command, on a temporary copy
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), "shelf-addbot-"));
try {
  fs.cpSync(path.join(ROOT, "scripts"), path.join(TMP, "scripts"), { recursive: true });
  fs.mkdirSync(path.join(TMP, "public"));
  for (const f of ["bots.json", "pairs.json", "products.json", "pairs-overrides.json", "pair-signals.json"]) if (fs.existsSync(path.join(PUB, f))) fs.copyFileSync(path.join(PUB, f), path.join(TMP, "public", f));
  const run = (...args) => spawnSync(process.execPath, [path.join(TMP, "scripts", "add-bot.js"), ...args], { encoding: "utf8" });
  const botsFile = path.join(TMP, "public", "bots.json"), before = fs.readFileSync(botsFile, "utf8");

  const bad = run("--json", JSON.stringify({ ...fresh, url: "https://x.ai/bot/" }));
  ok(bad.status === 1 && /not added: 1 error/.test(bad.stdout) && fs.readFileSync(botsFile, "utf8") === before, "a bad bot exits 1 and leaves bots.json untouched");
  const dry = run("--dry-run", "--json", JSON.stringify(fresh));
  ok(dry.status === 0 && /dry run: 1 bot would be added/.test(dry.stdout) && fs.readFileSync(botsFile, "utf8") === before, "--dry-run writes nothing");
  const usage = run();
  ok(usage.status === 2 && /usage:/.test(usage.stderr), "no input prints usage and exits 2");

  const input = path.join(TMP, "new.json"); fs.writeFileSync(input, JSON.stringify({ ...fresh, creator_handle: known.creator_handle }));
  const good = run(input, "--no-build");
  const after = JSON.parse(fs.readFileSync(botsFile, "utf8")), pairs = JSON.parse(fs.readFileSync(path.join(TMP, "public", "pairs.json"), "utf8"));
  ok(good.status === 0 && after.length === shelf.length + 1 && after[after.length - 1].name === fresh.name, `a good bot is written (exit ${good.status}${good.status ? ": " + (good.stderr || good.stdout).slice(-300) : ""})`);
  ok(Object.prototype.hasOwnProperty.call(pairs.pairs || {}, "zz-test-listing"), "pairs.json gets a row for the new slug (the build requires one)");
  ok(fs.readFileSync(botsFile, "utf8") === JSON.stringify(after, null, 2) + "\n" && fs.readFileSync(botsFile, "utf8").startsWith(before.slice(0, -3)), "bots.json keeps its formatting; only the new entry is added at the end");
} finally { fs.rmSync(TMP, { recursive: true, force: true }); }
