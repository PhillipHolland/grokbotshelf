// "Pairs with". public/pairs.json is one row per bot slug: 0–3 products, each score 4 or 5
// plus a short reason. Empty means nothing relevant. A row with no "auto" flag is curated
// and pairs-gen will not overwrite it. Rows marked "auto": true were proposed by the scorer.
// public/pairs-overrides.json wins at render time: none, block, and pin. Bot Tools defaults
// to none unless that slug sets "none": false or lists pin ids.
// Category fields never match. The scorer uses exact bot_names, strong phrases, and a
// support word only as a bump on a phrase. A single generic word never scores.
//
// New bot: node scripts/pairs-gen.js && node scripts/build.js
// After editing products.json: node scripts/pairs-gen.js --backfill && node scripts/build.js
// Do not turn category matching back on.

const fs = require("fs");
const path = require("path");
const { slugify } = require("./shelf");

const TIERS = { pin: 0, curated: 1, name: 2, keyword: 3 };
const ASIN = /^B[0-9A-Z]{9}$/;
const BANNED_KEYWORDS = new Set(["voice", "desk", "tools", "tracker", "hub", "network", "scanner", "backup", "export"]);
// Single words that must not score on their own, and must not bump a phrase to 5.
const GENERIC_SUPPORT = new Set([
  "drill", "mouse", "keyboard", "webcam", "router", "bottle", "camera", "speaker", "watch", "light",
  "podcast", "laptop", "phone", "email", "video", "audio", "music", "photo", "photos", "files", "notes",
  "paper", "home", "food", "money", "bible", "church", "travel", "workout", "health", "design", "price",
  "deal", "budget", "receipt", "receipts", "invoice", "flight", "hotel", "recipe", "recipes", "kitchen",
  "scanner", "backup", "tools", "voice", "desk", "tracker", "hub", "export", "network",
]);
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

function isMultiWord(keyword) {
  return String(keyword || "").trim().split(/\s+/).filter(Boolean).length >= 2;
}

// A strong phrase is multi-word, or an explicit match.phrases entry (a distinctive token the
// editor listed on purpose). Generic one-word keywords are support at most.
function strongPhrases(product) {
  const m = product.match || {};
  const out = [];
  for (const k of m.phrases || []) {
    const s = String(k || "").trim();
    if (s && !BANNED_KEYWORDS.has(s.toLowerCase())) out.push(s);
  }
  for (const k of m.keywords || []) {
    const s = String(k || "").trim();
    if (s && isMultiWord(s) && !BANNED_KEYWORDS.has(s.toLowerCase())) out.push(s);
  }
  return out;
}

function supportWords(product) {
  const m = product.match || {};
  const out = [];
  for (const k of m.keywords || []) {
    const s = String(k || "").trim();
    const low = s.toLowerCase();
    if (!s || isMultiWord(s) || BANNED_KEYWORDS.has(low) || GENERIC_SUPPORT.has(low) || low.length < 5) continue;
    out.push(s);
  }
  return out;
}

function excluded(bot, product) {
  const m = product.match || {};
  const hay = `${bot.name || ""}\n${bot.description || ""}`;
  const name = String(bot.name || "");
  if ((m.exclude_names || []).some((n) => n === name)) return true;
  return (m.exclude || []).some((k) => keywordHit(hay, k));
}

// Deterministic 0–3 proposals. Exact bot name → 5. Two strong phrases, or one phrase plus a
// support word → 5. One strong phrase → 4. Support alone, a generic word, or a category → nothing.
// Products with auto:false are curated-only (Echo Dot). Catalog order breaks score ties.
function proposePairs(bot, catalog) {
  const products = (catalog && catalog.products) || [];
  const name = String(bot.name || "");
  const hay = `${name}\n${bot.description || ""}`;
  const hits = [];
  products.forEach((p, index) => {
    if (p.auto === false) return;
    if (excluded(bot, p)) return;
    const m = p.match || {};
    if ((m.bot_names || []).some((n) => n === name)) {
      hits.push({ id: p.id, score: 5, reason: `Named match for ${name}.`, index, auto: true });
      return;
    }
    const phrases = strongPhrases(p).filter((k) => keywordHit(hay, k));
    if (!phrases.length) return;
    const support = supportWords(p).filter((k) => keywordHit(hay, k));
    const score = phrases.length >= 2 || support.length >= 1 ? 5 : 4;
    const why = phrases[0];
    const reason = phrases.length >= 2 || support.length
      ? `Mentions “${why}” and another gear cue.`
      : `Mentions “${why}”.`;
    hits.push({ id: p.id, score, reason, index, auto: true });
  });
  hits.sort((a, b) => b.score - a.score || a.index - b.index);
  const out = [];
  for (const h of hits) {
    if (out.some((r) => r.id === h.id)) continue;
    out.push({ id: h.id, score: h.score, reason: h.reason, auto: true });
    if (out.length === 3) break;
  }
  return out;
}

function rowsAreCurated(rows) {
  return Array.isArray(rows) && rows.length > 0 && rows.some((r) => !r || r.auto !== true);
}

// What render would keep, so auto rows do not store gear an override or Bot Tools none would hide.
function proposalsFor(bot, catalog, overrides) {
  const slug = bot.slug || slugify(bot.name || "");
  const rows = proposePairs(bot, catalog);
  const shown = resolvePairs({ ...bot, slug }, catalog, { pairs: { [slug]: rows } }, overrides);
  const byId = new Map(rows.map((r) => [r.id, r]));
  return shown.map((h) => byId.get(h.product.id)).filter(Boolean);
}

// mode "missing": only slugs with no key. mode "backfill": also rescore auto rows and empty
// placeholders. A non-empty row that lacks auto is curated and is never replaced.
function generatePairs({ bots, catalog, curated, overrides, mode }) {
  const prev = (curated && curated.pairs) || {};
  const fillEmpty = mode === "backfill";
  const ordered = {};
  for (const bot of bots) {
    const slug = bot.slug || slugify(bot.name || "");
    const has = Object.prototype.hasOwnProperty.call(prev, slug);
    const existing = has ? prev[slug] : undefined;
    if (has && rowsAreCurated(existing)) {
      ordered[slug] = existing;
      continue;
    }
    const autoRows = has && Array.isArray(existing) && existing.length > 0 && existing.every((r) => r && r.auto === true);
    const empty = has && Array.isArray(existing) && existing.length === 0;
    if (has && !autoRows && !empty) {
      ordered[slug] = existing;
      continue;
    }
    if (has && !fillEmpty) {
      ordered[slug] = existing;
      continue;
    }
    ordered[slug] = proposalsFor({ ...bot, slug }, catalog, overrides);
  }
  return ordered;
}

function assertPairKeys(bots, curated) {
  const pairs = curated && curated.pairs;
  if (!pairs || typeof pairs !== "object") throw new Error("public/pairs.json: pairs object missing");
  const missing = [];
  for (const b of bots) {
    const slug = b.slug || slugify(b.name || "");
    if (!Object.prototype.hasOwnProperty.call(pairs, slug)) missing.push(slug);
  }
  if (missing.length) {
    throw new Error(`public/pairs.json is missing ${missing.length} bot slug${missing.length === 1 ? "" : "s"} (${missing.slice(0, 5).join(", ")}). Run: node scripts/pairs-gen.js`);
  }
}

function resetPairCache() {
  cache = undefined;
  pairsFor._checked = false;
}

// Compact fields the homepage card needs. The tag is applied in the client.
function pairCards(hits) {
  return hits.map(({ product: p }) => ({ id: p.id, name: p.name, emoji: p.emoji || "", asin: p.asin }));
}

function pairsFor(bot, catalog) {
  const { curated, overrides } = loadPairFiles();
  if (!pairsFor._checked) {
    assertCurated(curated, catalog);
    pairsFor._checked = true;
  }
  const slug = bot.slug || slugify(bot.name || "");
  if (!curated.pairs || !Object.prototype.hasOwnProperty.call(curated.pairs, slug)) {
    const rows = proposePairs(bot, catalog);
    return resolvePairs({ ...bot, slug }, catalog, { pairs: { [slug]: rows } }, overrides);
  }
  return resolvePairs(bot, catalog, curated, overrides);
}

module.exports = {
  pairsFor, resolvePairs, matchTier, keywordHit, productUrl, assertCatalog, assertCurated,
  proposePairs, proposalsFor, generatePairs, assertPairKeys, resetPairCache, pairCards,
  rowsAreCurated, strongPhrases, TIERS, BANNED_KEYWORDS, GENERIC_SUPPORT,
};
