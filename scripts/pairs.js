// "Pairs with" on bot pages. public/pairs.json is the curated source of truth
// (bot slug → 0–3 products, each score 4 or 5 plus a short reason). Empty means no row.
// public/pairs-overrides.json wins: none, block, and pin. Bot Tools defaults to none
// unless that slug sets "none": false or lists pin ids.
// Category fields never match. Keyword rules in products.json are documentation only;
// pairsFor does not spray them onto pages.
//
// New bot: add its slug to public/pairs.json (score >= 4, at most 3, or an empty array)
// or pin/block/none in public/pairs-overrides.json, then run node scripts/build.js.
// Do not turn category matching back on.

const fs = require("fs");
const path = require("path");
const { slugify } = require("./shelf");

const TIERS = { pin: 0, curated: 1, name: 2, keyword: 3 };
const ASIN = /^B[0-9A-Z]{9}$/;
const BANNED_KEYWORDS = new Set(["voice", "desk", "tools", "tracker", "hub", "network", "scanner", "backup", "export"]);
const PUB = path.join(__dirname, "..", "public");

function keywordHit(hay, keyword) {
  const k = String(keyword || "").trim().toLowerCase();
  if (!k) return false;
  const esc = k.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  // Whole phrase: "mic" does not match "micdrop" or "dynamic", "desk" does not match "desktop".
  return new RegExp(`(?:^|[^a-z0-9])${esc}(?![a-z0-9])`, "i").test(String(hay).toLowerCase());
}

// Name, then a specific keyword. Never category. Not used to render pages.
function matchTier(bot, product) {
  const m = product.match || {};
  const name = String(bot.name || "");
  if ((m.bot_names || []).some((n) => n === name)) return "name";
  const hay = `${name}\n${bot.description || ""}`;
  if ((m.keywords || []).some((k) => keywordHit(hay, k))) return "keyword";
  return null;
}

function productUrl(product, tag) {
  const asin = String(product.asin || "");
  if (!ASIN.test(asin)) throw new Error(`bad ASIN for ${product.id || product.name}: ${asin}`);
  if (tag !== "botshelf-20") throw new Error("Amazon Associates tag must be botshelf-20");
  return `https://www.amazon.com/dp/${asin}?tag=${tag}`;
}

function assertCatalog(catalog) {
  if (!catalog || !Array.isArray(catalog.products)) throw new Error("public/products.json: products array missing");
  if (catalog.tag !== "botshelf-20") throw new Error("public/products.json: tag must be botshelf-20");
  const rel = catalog.ux && catalog.ux.rel;
  if (!rel || !/\bnoopener\b/.test(rel) || !/\bsponsored\b/.test(rel)) throw new Error("public/products.json: ux.rel must include noopener and sponsored");
  if (!catalog.disclosure) throw new Error("public/products.json: disclosure missing");
  if (!catalog.ux || !catalog.ux.label || !catalog.ux.cta) throw new Error("public/products.json: ux.label and ux.cta required");
  const ids = new Set();
  for (const p of catalog.products) {
    if (!p.id || ids.has(p.id)) throw new Error(`public/products.json: duplicate or missing id ${p.id}`);
    ids.add(p.id);
    productUrl(p, catalog.tag);
    const blob = JSON.stringify(p);
    if (/heygen|opus\.pro|runwayml|synthesia/i.test(blob)) throw new Error(`public/products.json: non-Amazon product ${p.id}`);
    const m = p.match || {};
    if (Array.isArray(m.categories) && m.categories.length) throw new Error(`public/products.json: ${p.id} still has category matching`);
    for (const k of m.keywords || []) {
      if (BANNED_KEYWORDS.has(String(k).trim().toLowerCase())) throw new Error(`public/products.json: ${p.id} has ambiguous keyword "${k}"`);
    }
  }
}

function readJson(name) {
  const file = path.join(PUB, name);
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch (e) {
    throw new Error(`public/${name} missing or invalid: ${e.message}`);
  }
}

let cache;
function loadPairFiles() {
  if (!cache) cache = { curated: readJson("pairs.json"), overrides: readJson("pairs-overrides.json") };
  return cache;
}

function assertCurated(curated, catalog) {
  const ids = new Set(catalog.products.map((p) => p.id));
  const pairs = curated && curated.pairs;
  if (!pairs || typeof pairs !== "object") throw new Error("public/pairs.json: pairs object missing");
  for (const [slug, rows] of Object.entries(pairs)) {
    if (!Array.isArray(rows) || rows.length > 3) throw new Error(`public/pairs.json: ${slug} must list 0–3 products`);
    const seen = new Set();
    for (const r of rows) {
      if (!r || !ids.has(r.id)) throw new Error(`public/pairs.json: ${slug} unknown product ${r && r.id}`);
      if (seen.has(r.id)) throw new Error(`public/pairs.json: ${slug} duplicate ${r.id}`);
      seen.add(r.id);
      if (typeof r.score !== "number" || r.score < 4 || r.score > 5) throw new Error(`public/pairs.json: ${slug} ${r.id} score must be 4 or 5`);
    }
  }
}

// curated + overrides → products to render. opts may replace the files (tests).
function resolvePairs(bot, catalog, curated, overrides) {
  const slug = bot.slug || slugify(bot.name || "");
  const ov = (overrides && overrides.bots && overrides.bots[slug]) || {};
  if (ov.none === true) return [];
  const catDefault = overrides && overrides.defaults && overrides.defaults.category && overrides.defaults.category[String(bot.category || "")];
  const dropCurated = catDefault === "none" && ov.none !== false;
  const blocked = new Set(ov.block || []);
  const byId = new Map(catalog.products.map((p) => [p.id, p]));
  const max = catalog.ux && Number.isInteger(catalog.ux.max) ? catalog.ux.max : 3;
  const out = [];
  const seen = new Set();
  function push(id, meta) {
    if (!id || seen.has(id) || blocked.has(id) || out.length >= max) return;
    const product = byId.get(id);
    if (!product) return;
    seen.add(id);
    out.push({ product, ...meta });
  }
  for (const id of ov.pin || []) push(id, { tier: "pin", score: 5, reason: ov.reason || "Pinned." });
  if (!dropCurated) {
    const rows = (curated && curated.pairs && curated.pairs[slug]) || [];
    for (const r of rows) {
      if (!r || typeof r.score !== "number" || r.score < 4) continue;
      push(r.id, { tier: "curated", score: r.score, reason: r.reason || "" });
    }
  }
  return out;
}

function pairsFor(bot, catalog) {
  const { curated, overrides } = loadPairFiles();
  if (!pairsFor._checked) {
    assertCurated(curated, catalog);
    pairsFor._checked = true;
  }
  return resolvePairs(bot, catalog, curated, overrides);
}

module.exports = { pairsFor, resolvePairs, matchTier, keywordHit, productUrl, assertCatalog, assertCurated, TIERS, BANNED_KEYWORDS };
