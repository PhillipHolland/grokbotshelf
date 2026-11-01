// "Pairs with" gear for bot pages. public/products.json is the catalog (Amazon only).
// Match tier, best first: exact bot name, then a keyword in the name or description, then category.
// Same tier keeps catalog order. The first `max` products (default 3) are the ones a page shows.
// Adding a product is a JSON edit; this file does not list ASINs.

const TIERS = { name: 0, keyword: 1, category: 2 };
const ASIN = /^B[0-9A-Z]{9}$/;

function keywordHit(hay, keyword) {
  const k = String(keyword || "").trim().toLowerCase();
  if (!k) return false;
  const esc = k.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  // Whole phrase: "mic" does not match "micdrop" or "dynamic", "desk" does not match "desktop".
  return new RegExp(`(?:^|[^a-z0-9])${esc}(?![a-z0-9])`, "i").test(String(hay).toLowerCase());
}

function matchTier(bot, product) {
  const m = product.match || {};
  const name = String(bot.name || "");
  if ((m.bot_names || []).some((n) => n === name)) return "name";
  const hay = `${name}\n${bot.description || ""}`;
  if ((m.keywords || []).some((k) => keywordHit(hay, k))) return "keyword";
  const cat = String(bot.category || "").trim().toLowerCase();
  if (cat && (m.categories || []).some((c) => String(c).trim().toLowerCase() === cat)) return "category";
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
  }
}

function pairsFor(bot, catalog) {
  const max = catalog.ux && Number.isInteger(catalog.ux.max) ? catalog.ux.max : 3;
  const ranked = [];
  catalog.products.forEach((product, i) => {
    const tier = matchTier(bot, product);
    if (tier) ranked.push({ product, tier, i });
  });
  ranked.sort((a, b) => TIERS[a.tier] - TIERS[b.tier] || a.i - b.i);
  return ranked.slice(0, max);
}

module.exports = { pairsFor, matchTier, keywordHit, productUrl, assertCatalog, TIERS };
