// Checks public/bots.json before anything is built from it. scripts/build.js runs this first and stops on any error,
// so a typo in a listing fails the deploy with a message that names the bot and the field instead of producing an odd page.
//
//   node scripts/validate.js            # print errors and warnings; exit 1 on any error
//   node scripts/validate.js --strict   # warnings fail too
//
// Errors are things that are certainly wrong (a missing name, a template link x.ai would not open, two bots with the same
// page). Warnings are worth a look but have real examples on the shelf today (no creator credit, a one-bot category).
const fs = require("fs"), path = require("path");
const { slugify, templateId } = require("./shelf");

const PUB = path.join(__dirname, "..", "public");

// Every field a listing may carry. Anything else is most likely a typo ("descripton") and is reported as a warning.
const KNOWN_FIELDS = new Set([
  "name", "emoji", "description", "category", "url", "creator_name", "creator_handle", "creator_url", "creator_avatar",
  "source_post", "added", "code_url",
  // Optional "Under the hood" details, shown on the bot page as creator-supplied.
  "connectors", "routines", "sends", "posts", "spends", "permissions_note", "needs", "limits",
]);
const REQUIRED_TEXT = ["name", "emoji", "description", "category", "url", "added"];
const BOT_URL = /^https:\/\/x\.ai\/bot\/[A-Za-z0-9_-]{6,64}$/;
const MARKETPLACE_URL = /^https:\/\/x\.ai\/marketplace\/bots\/[a-z0-9-]{2,80}$/;
const HANDLE = /^@[A-Za-z0-9_]{1,15}$/;
const POST = /^https:\/\/x\.com\/([A-Za-z0-9_]{1,15}|i)\/status\/\d{5,25}$/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const DESC_MAX = 400;

const label = (b, i) => `bots.json[${i}] ${JSON.stringify(b && b.name ? b.name : "(no name)")}`;
const isText = (v) => typeof v === "string" && v.trim() !== "";
const realDate = (s) => { if (!DATE.test(s)) return false; const d = new Date(s + "T00:00:00Z"); return !isNaN(d) && d.toISOString().slice(0, 10) === s; };

/**
 * @param {object[]} bots   the parsed bots.json array
 * @param {object}  [opts]
 * @param {string}  [opts.pub]    public folder, for checking that avatar files exist (default: this repo's public/)
 * @param {string}  [opts.today]  YYYY-MM-DD, for the "added in the future" check (default: today, UTC)
 * @returns {{ errors: string[], warnings: string[] }}
 */
function validateBots(bots, { pub = PUB, today = new Date().toISOString().slice(0, 10) } = {}) {
  const errors = [], warnings = [];
  if (!Array.isArray(bots)) return { errors: ["bots.json must be a JSON array of bot objects"], warnings };
  const tomorrow = new Date(Date.parse(today + "T00:00:00Z") + 86400000).toISOString().slice(0, 10);
  const slugs = new Map(), templates = new Map(), cats = new Map(), names = new Map();

  bots.forEach((b, i) => {
    const at = label(b, i);
    const err = (m) => errors.push(`${at}: ${m}`), warn = (m) => warnings.push(`${at}: ${m}`);
    if (!b || typeof b !== "object" || Array.isArray(b)) return err("each entry must be an object");

    for (const k of Object.keys(b)) if (!KNOWN_FIELDS.has(k)) warn(`unknown field "${k}" (typo? known fields are listed in scripts/validate.js)`);
    for (const k of REQUIRED_TEXT) if (!isText(b[k])) err(`"${k}" is required and must be a non-empty string`);
    for (const [k, v] of Object.entries(b)) if (typeof v === "string" && v !== v.trim()) err(`"${k}" has leading or trailing spaces`);

    if (isText(b.name)) {
      const s = slugify(b.name);
      if (!s) err(`name has no letters or digits, so it has no page slug`);
      else if (slugs.has(s)) err(`same page slug "/bot/${s}" as ${slugs.get(s)} (rename one of them)`);
      else slugs.set(s, at);
    }
    if (isText(b.description) && b.description.length > DESC_MAX) err(`description is ${b.description.length} characters; keep it under ${DESC_MAX}`);

    if (isText(b.url)) {
      if (/^https:\/\/x\.ai\/bot\/marketplace\//.test(b.url)) warn(`url ${b.url} mixes the /bot/ and /marketplace/ forms; marketplace links are https://x.ai/marketplace/bots/<name>`);
      else if (!BOT_URL.test(b.url) && !MARKETPLACE_URL.test(b.url)) err(`url ${JSON.stringify(b.url)} should look like https://x.ai/bot/<id> or https://x.ai/marketplace/bots/<name>`);
      const t = templateId(b.url);
      if (templates.has(t)) err(`same template link as ${templates.get(t)}`);
      else templates.set(t, at);
    }

    if (isText(b.added)) {
      if (!realDate(b.added)) err(`added ${JSON.stringify(b.added)} should be a real date, YYYY-MM-DD`);
      else if (b.added > tomorrow) err(`added ${b.added} is in the future`);
    }

    if (isText(b.category)) cats.set(b.category, [...(cats.get(b.category) || []), at]);

    // Creator credit. 46 bots have no handle today; that is allowed but every handle that is set must be a real X handle.
    const h = b.creator_handle;
    if (h !== undefined && typeof h !== "string") err(`creator_handle must be a string`);
    else if (isText(h)) {
      if (!HANDLE.test(h)) err(`creator_handle ${JSON.stringify(h)} should be @ plus 1 to 15 letters, digits or _`);
      else {
        const want = "https://x.com/" + h.slice(1);
        if (b.creator_url && String(b.creator_url).toLowerCase() !== want.toLowerCase()) err(`creator_url ${JSON.stringify(b.creator_url)} does not match creator_handle (expected ${want})`);
        const k = h.toLowerCase();
        if (isText(b.creator_name)) names.set(k, (names.get(k) || new Set()).add(b.creator_name));
      }
      if (!isText(b.creator_name)) warn(`has a creator_handle but no creator_name`);
    } else {
      if (isText(b.creator_url)) err(`creator_url is set but creator_handle is empty`);
      if (!isText(b.creator_name)) warn(`no creator credit (creator_name and creator_handle are both empty)`);
    }

    if (b.creator_avatar !== undefined && b.creator_avatar !== "") {
      const a = String(b.creator_avatar);
      if (!/^\/avatars\/[^/?#]+\.(webp|png|jpg)$/.test(a)) err(`creator_avatar ${JSON.stringify(a)} should be /avatars/<file>.webp`);
      // Test copies of the site leave public/avatars out entirely; only check files when the folder is there.
      else if (pub && fs.existsSync(path.join(pub, "avatars")) && !fs.existsSync(path.join(pub, a))) err(`creator_avatar ${a} is not in public/avatars/`);
    }

    if (b.source_post !== undefined && b.source_post !== "" && !POST.test(String(b.source_post)))
      err(`source_post ${JSON.stringify(b.source_post)} should look like https://x.com/<handle>/status/<id>`);
    if (b.code_url !== undefined && !/^https:\/\/\S+$/.test(String(b.code_url))) err(`code_url should be an https:// link`);

    if (b.connectors !== undefined && !(Array.isArray(b.connectors) && b.connectors.every(isText))) err(`connectors should be a list of app names`);
    if (b.routines !== undefined && !(Array.isArray(b.routines) && b.routines.every((r) => r && isText(r.name)))) err(`routines should be a list of { "name": ..., "schedule": ... }`);
    for (const k of ["sends", "posts", "spends"]) if (b[k] !== undefined && typeof b[k] !== "boolean") err(`${k} should be true or false`);
    for (const k of ["permissions_note", "needs", "limits"]) if (b[k] !== undefined && typeof b[k] !== "string") err(`${k} should be a string`);
  });

  // A category used by a single bot is usually a typo of an existing one ("Productivty"). A new category is allowed.
  for (const [c, list] of cats) if (list.length === 1 && cats.size > 1) {
    const near = [...cats.keys()].find((o) => o !== c && slugify(o) === slugify(c));
    warnings.push(`${list[0]}: category ${JSON.stringify(c)} is used by this bot only${near ? ` (did you mean ${JSON.stringify(near)}?)` : ""}`);
  }
  for (const [h, set] of names) if (set.size > 1) warnings.push(`creator ${h} is credited under ${set.size} names: ${[...set].map((n) => JSON.stringify(n)).join(", ")}`);
  return { errors, warnings };
}

function readBots(pub = PUB) {
  return JSON.parse(fs.readFileSync(path.join(pub, "bots.json"), "utf8"));
}

// For scripts/build.js: throws with every error listed, so one run shows them all.
function assertBots(bots, opts) {
  const { errors } = validateBots(bots, opts);
  if (errors.length) throw new Error(`public/bots.json has ${errors.length} problem${errors.length > 1 ? "s" : ""} (node scripts/validate.js lists them):\n  ${errors.join("\n  ")}`);
}

module.exports = { validateBots, assertBots, readBots, KNOWN_FIELDS };

if (require.main === module) {
  const strict = process.argv.includes("--strict");
  let bots;
  try { bots = readBots(); } catch (e) { console.error(`public/bots.json does not parse: ${e.message}`); process.exit(1); }
  const { errors, warnings } = validateBots(bots);
  for (const w of warnings) console.log("warning " + w);
  for (const e of errors) console.log("error   " + e);
  console.log(`${bots.length} bots: ${errors.length} error${errors.length === 1 ? "" : "s"}, ${warnings.length} warning${warnings.length === 1 ? "" : "s"}`);
  process.exit(errors.length || (strict && warnings.length) ? 1 : 0);
}
