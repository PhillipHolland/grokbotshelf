// Fill public/pairs.json from the scorer in scripts/pairs.js.
//
//   node scripts/pairs-gen.js
//     Adds a key for every bot that does not have one yet. Does not touch existing rows.
//
//   node scripts/pairs-gen.js --backfill
//     Also rescores empty rows and rows marked "auto": true (catalog grew).
//     A non-empty row with no auto flag is curated and is left as written.
//
// Then node scripts/build.js. The build fails if any bot slug is missing.
// Overrides (none / block / pin) and the Bot Tools default of none are applied
// before an auto row is saved, so hidden gear is not written. Category matching stays off.

const fs = require("fs");
const path = require("path");
const { slugify } = require("./shelf");
const { assertCatalog, generatePairs, resetPairCache } = require("./pairs");

const PUB = path.join(__dirname, "..", "public");
const mode = process.argv.includes("--backfill") ? "backfill" : "missing";

function read(name) {
  return JSON.parse(fs.readFileSync(path.join(PUB, name), "utf8"));
}

const bots = read("bots.json").map((b) => ({ ...b, slug: slugify(b.name) }));
const catalog = read("products.json");
const curated = read("pairs.json");
const overrides = read("pairs-overrides.json");
assertCatalog(catalog);

const nextPairs = generatePairs({ bots, catalog, curated, overrides, mode });
const before = JSON.stringify(curated.pairs);
const after = JSON.stringify(nextPairs);
if (before === after) {
  const n = Object.keys(nextPairs).length;
  const filled = Object.values(nextPairs).filter((r) => r.length).length;
  console.log(`pairs.json unchanged (${n} slugs, ${filled} with products, mode ${mode})`);
  process.exit(0);
}

const out = {
  version: curated.version || 1,
  tag: "botshelf-20",
  generated: new Date().toISOString(),
  note: "One key per bot slug. Rows without auto are curated and pairs-gen will not replace them. auto:true rows come from scripts/pairs.js (exact name, strong phrase, phrase plus support). Empty is correct when nothing scores 4 or 5. Overrides in pairs-overrides.json still win at render. node scripts/pairs-gen.js after a new bot; add --backfill after products.json changes.",
  pairs: nextPairs,
};
fs.writeFileSync(path.join(PUB, "pairs.json"), JSON.stringify(out, null, 1) + "\n");
resetPairCache();
const filled = Object.values(nextPairs).filter((r) => r.length).length;
const added = bots.filter((b) => !Object.prototype.hasOwnProperty.call(curated.pairs || {}, b.slug)).length;
console.log(`pairs.json updated (${Object.keys(nextPairs).length} slugs, ${filled} with products, ${added} new keys, mode ${mode})`);
