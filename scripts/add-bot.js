// Adds approved bots to public/bots.json in one checked step, so a listing never reaches the build half-done.
//
//   node scripts/add-bot.js new-bot.json            # a file holding one bot object or an array of them
//   node scripts/add-bot.js --json '{"name": ...}'  # the same, inline
//   node scripts/add-bot.js new-bot.json --dry-run  # show what would be added, write nothing
//   node scripts/add-bot.js new-bot.json --no-build # write bots.json and pairs.json, skip scripts/build.js
//
// Each bot needs name, emoji, description, category and url (README, "Add a bot"). The rest is filled in when missing:
//   added           today (UTC)
//   creator_handle  "@" is added if it was left off
//   creator_url     https://x.com/<handle>
//   creator_name    the name this handle already has on the shelf
//   creator_avatar  /avatars/<handle, lowercase>.webp when that file exists, else the avatar this handle already uses
//   source_post     ""
// Then the whole catalog is checked with scripts/validate.js. On any error nothing is written. On success the bots are
// appended, pairs.json gets their rows (scripts/pairs-gen.js), and the site is rebuilt (scripts/build.js).
// Still by hand afterwards: a new creator's 128px avatar in public/avatars/, share images (scripts/og.js), and the
// 48px avatar copies (scripts/avatars.js). Both need headless Chrome.
const fs = require("fs"), path = require("path"), { execFileSync } = require("child_process");
const { validateBots } = require("./validate");

const ROOT = path.join(__dirname, ".."), PUB = path.join(ROOT, "public");
const ORDER = ["name", "emoji", "description", "category", "url", "code_url", "creator_name", "creator_handle", "creator_url", "creator_avatar", "source_post", "added"];

// Fill the optional fields from the rest of the shelf. Pure: returns new objects, reads only the avatars folder.
function complete(input, shelf, { pub = PUB, today = new Date().toISOString().slice(0, 10) } = {}) {
  return input.map((raw) => {
    const b = {};
    for (const [k, v] of Object.entries(raw || {})) b[k] = typeof v === "string" ? v.trim() : v;
    let h = String(b.creator_handle || "").replace(/^@?/, "@");
    if (h === "@") h = "";
    b.creator_handle = h;
    const same = h ? shelf.filter((x) => String(x.creator_handle || "").toLowerCase() === h.toLowerCase()) : [];
    if (!b.creator_name) b.creator_name = same.length ? same[same.length - 1].creator_name : "";
    if (!b.creator_url) b.creator_url = h ? "https://x.com/" + h.slice(1) : "";
    if (b.creator_avatar === undefined || b.creator_avatar === null) {
      const own = h && "/avatars/" + h.slice(1).toLowerCase() + ".webp";
      const known = same.map((x) => x.creator_avatar).filter(Boolean).pop();
      b.creator_avatar = own && fs.existsSync(path.join(pub, own)) ? own : known || "";
    }
    if (b.source_post === undefined) b.source_post = "";
    if (!b.added) b.added = today;
    // Same key order as the rest of the file, extra fields after.
    const out = {};
    for (const k of ORDER) if (b[k] !== undefined) out[k] = b[k];
    for (const k of Object.keys(b)) if (!(k in out)) out[k] = b[k];
    return out;
  });
}

// Returns { bots, added, errors, warnings } without writing anything.
function plan(input, shelf, opts) {
  const list = Array.isArray(input) ? input : [input];
  if (!list.length) return { errors: ["nothing to add"], warnings: [], added: [], bots: shelf };
  const added = complete(list, shelf, opts), bots = [...shelf, ...added];
  const { errors, warnings } = validateBots(bots, opts);
  // Only the new bots' warnings: the shelf's existing ones are not this change's business.
  const fresh = new Set(added.map((_, i) => `bots.json[${shelf.length + i}]`));
  const mine = (m) => [...fresh].some((p) => m.startsWith(p + " "));
  const newHandles = new Set(added.map((b) => b.creator_handle.toLowerCase()).filter(Boolean));
  const extra = added.flatMap((b, i) => b.creator_handle && !b.creator_avatar ? [`bots.json[${shelf.length + i}] ${JSON.stringify(b.name)}: no avatar for ${b.creator_handle}; save their X photo as public/avatars/${b.creator_handle.slice(1).toLowerCase()}.webp (128px) and run this again, or set creator_avatar`] : []);
  return {
    bots, added, errors,
    warnings: [...warnings.filter((w) => mine(w) || [...newHandles].some((h) => w.startsWith(`creator ${h} `))), ...extra],
  };
}

module.exports = { complete, plan };

if (require.main === module) {
  const argv = process.argv.slice(2), flag = (f) => argv.includes(f);
  const ji = argv.indexOf("--json"), file = argv.find((a, i) => !a.startsWith("--") && (ji < 0 || i !== ji + 1));
  let input;
  try {
    input = JSON.parse(ji >= 0 ? argv[ji + 1] : fs.readFileSync(file, "utf8"));
  } catch (e) {
    console.error(file || ji >= 0 ? `could not read the new bot JSON: ${e.message}` : "usage: node scripts/add-bot.js <bot.json> | --json '{...}' [--dry-run] [--no-build]");
    process.exit(2);
  }
  const file0 = path.join(PUB, "bots.json"), shelf = JSON.parse(fs.readFileSync(file0, "utf8"));
  const r = plan(input, shelf);
  for (const w of r.warnings) console.log("warning " + w);
  for (const e of r.errors) console.log("error   " + e);
  if (r.errors.length) { console.log(`not added: ${r.errors.length} error${r.errors.length > 1 ? "s" : ""}`); process.exit(1); }
  console.log(JSON.stringify(r.added, null, 2));
  if (flag("--dry-run")) { console.log(`dry run: ${r.added.length} bot${r.added.length > 1 ? "s" : ""} would be added`); process.exit(0); }
  fs.writeFileSync(file0, JSON.stringify(r.bots, null, 2) + "\n");
  console.log(`added ${r.added.map((b) => b.name).join(", ")} to public/bots.json`);
  execFileSync(process.execPath, [path.join(__dirname, "pairs-gen.js")], { stdio: "inherit" });
  if (!flag("--no-build")) execFileSync(process.execPath, [path.join(__dirname, "build.js")], { stdio: "inherit" });
  console.log("next: npm run check, then commit bots.json, pairs.json and the build output together");
}
