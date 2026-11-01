// Refresh public/products.json titles from the Amazon Creators API (GetItems).
//
//   node scripts/creators-refresh.js                 # dry run, JSON report on stdout
//   node scripts/creators-refresh.js --report out.json
//   node scripts/creators-refresh.js --apply         # write amazon_title, last_refreshed, and a name only when it clearly matches
//   node scripts/creators-refresh.js --fixture file  # offline; does not call Amazon
//
// Credentials come only from the environment. This repo has none. The script
// exits 0 with a setup message when they are missing. It never reads a refresh
// token: Creators API uses the OAuth 2.0 client-credentials grant.
//
// Associates Central → sign in as the primary account owner → Tools → Creators API
// → Create Application → Add New Credential. Copy the three values shown once:
//   Credential ID      → AMAZON_CREATORS_CLIENT_ID
//   Credential Secret  → AMAZON_CREATORS_CLIENT_SECRET
//   Version            → AMAZON_CREATORS_VERSION (optional here; default 3.1)
// Docs: https://affiliate-program.amazon.com/creatorsapi/docs/en-us/onboarding/register-for-creators-api
//       https://affiliate-program.amazon.com/creatorsapi/docs/en-us/get-started/using-curl
//       https://affiliate-program.amazon.com/creatorsapi/docs/en-us/api-reference/operations/get-items
//
// Version picks the Login with Amazon token host (credentials themselves are global):
//   3.1  https://api.amazon.com/auth/o2/token       North America (www.amazon.com)
//   3.2  https://api.amazon.co.uk/auth/o2/token     Europe
//   3.3  https://api.amazon.co.jp/auth/o2/token     Far East
// Token body: { grant_type: "client_credentials", client_id, client_secret, scope: "creatorsapi::default" }
// GetItems: POST https://creatorsapi.amazon/catalog/v1/getItems
//   Authorization: Bearer <access_token>
//   x-marketplace: www.amazon.com
//   partnerTag is always botshelf-20 (not an env var).
//   resources: itemInfo.title, images.primary.large. At most 10 ASINs per call.
//
// --apply writes amazon_title and last_refreshed. It updates name only when the
// Amazon title is the same words with cleaner casing or punctuation. A longer
// listing title is kept in amazon_title so you can diff it, and the curated
// short name stays. id, asin, blurb, emoji, match, auto, flag, and pair_note
// are left as they are. Image URLs are reported only: pair UI renders the emoji
// as a Lucide icon, and an empty image must not change that rendering.

const fs = require("fs");
const path = require("path");
const { assertCatalog } = require("./pairs");

const PARTNER_TAG = "botshelf-20";
const MARKETPLACE = "www.amazon.com";
const GET_ITEMS_URL = "https://creatorsapi.amazon/catalog/v1/getItems";
const BATCH_SIZE = 10;
const RESOURCES = ["itemInfo.title", "images.primary.large"];
const TOKEN_ENDPOINTS = {
  "3.1": "https://api.amazon.com/auth/o2/token",
  "3.2": "https://api.amazon.co.uk/auth/o2/token",
  "3.3": "https://api.amazon.co.jp/auth/o2/token",
};
const FROZEN = ["id", "asin", "blurb", "emoji", "match", "auto", "flag", "pair_note"];
const DEFAULT_CATALOG = path.join(__dirname, "..", "public", "products.json");
const ASIN = /^B[0-9A-Z]{9}$/;
const NOISE = new Set(["the", "a", "an", "and", "with", "for", "of", "by", "to", "on", "in", "new", "pack", "set", "pc", "pcs", "inch", "inches", "black", "white", "bundle", "amazon", "official", "version", "gen", "generation"]);

function credentialHelp(missing) {
  const which = missing.length ? `Missing ${missing.join(" and ")}.` : "Creators API credentials are not set.";
  return [
    which,
    "Create them in Associates Central: Tools → Creators API → Create Application → Add New Credential.",
    "The Credential Secret is shown once. Export it in the shell that runs this script. Do not commit it.",
    "  AMAZON_CREATORS_CLIENT_ID       Credential ID (OAuth client_id)",
    "  AMAZON_CREATORS_CLIENT_SECRET   Credential Secret (OAuth client_secret)",
    "  AMAZON_CREATORS_VERSION         optional, default 3.1 for www.amazon.com (3.2 EU, 3.3 FE)",
    "Creators API uses the client_credentials grant. There is no refresh token to set.",
    `partnerTag stays ${PARTNER_TAG}. No request was sent.`,
    "Re-run after exporting the variables. Add --apply to write public/products.json.",
    "Offline dry run: node scripts/creators-refresh.js --fixture response.json",
  ].join("\n");
}

function missingCreds(env) {
  const missing = [];
  if (!String(env.AMAZON_CREATORS_CLIENT_ID || "").trim()) missing.push("AMAZON_CREATORS_CLIENT_ID");
  if (!String(env.AMAZON_CREATORS_CLIENT_SECRET || "").trim()) missing.push("AMAZON_CREATORS_CLIENT_SECRET");
  return missing;
}

function parseArgs(argv) {
  const out = { apply: false, help: false, report: "", catalog: DEFAULT_CATALOG, fixture: "", now: "" };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--help" || a === "-h") out.help = true;
    else if (a === "--apply") out.apply = true;
    else if (a === "--report") out.report = argv[++i] || "";
    else if (a === "--catalog") out.catalog = argv[++i] || "";
    else if (a === "--fixture") out.fixture = argv[++i] || "";
    else if (a === "--now") out.now = argv[++i] || "";
    else throw new Error(`Unknown argument ${a}. Try --help.`);
  }
  if (out.report === "" && argv.includes("--report")) throw new Error("--report needs a file path.");
  if (out.catalog === "") throw new Error("--catalog needs a file path.");
  if (out.fixture === "" && argv.includes("--fixture")) throw new Error("--fixture needs a file path.");
  if (out.now === "" && argv.includes("--now")) throw new Error("--now needs an ISO timestamp.");
  return out;
}

function helpText() {
  return [
    "Usage: node scripts/creators-refresh.js [--apply] [--report file] [--catalog file] [--fixture file] [--now ISO]",
    "",
    "Dry run by default. Prints a JSON report and leaves products.json unchanged.",
    "--apply writes amazon_title and last_refreshed, and updates name only when the Amazon title is the same words.",
    "Never changes id, asin, blurb, emoji, match, auto, flag, or pair_note.",
    `partnerTag is always ${PARTNER_TAG}. Marketplace is ${MARKETPLACE}.`,
    "",
    "Environment (client credentials; no refresh token):",
    "  AMAZON_CREATORS_CLIENT_ID",
    "  AMAZON_CREATORS_CLIENT_SECRET",
    "  AMAZON_CREATORS_VERSION   optional, default 3.1 (NA). 3.2 EU, 3.3 FE.",
    "",
    "Associates Central → Tools → Creators API → Create Application → Add New Credential.",
    "Without those variables, and without --fixture, this command exits 0 and prints how to set them.",
    "--fixture reads a saved GetItems JSON body and does not call Amazon.",
  ].join("\n");
}

function normalizeTitle(s) {
  return String(s || "")
    .toLowerCase()
    .replace(/[™®©]/g, "")
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tokens(s) {
  return normalizeTitle(s).split(" ").filter(Boolean);
}

function shouty(s) {
  const letters = String(s || "").replace(/[^A-Za-z]/g, "");
  if (letters.length < 4) return false;
  const upper = letters.replace(/[^A-Z]/g, "").length;
  return upper / letters.length > 0.8;
}

function sameProduct(curated, amazon) {
  const ct = tokens(curated).filter((t) => !NOISE.has(t));
  const at = new Set(tokens(amazon));
  if (!ct.length || !at.size) return false;
  return ct.every((t) => at.has(t));
}

function seoNoisy(curated, amazon) {
  const extra = tokens(amazon).filter((t) => !tokens(curated).includes(t) && !NOISE.has(t));
  if (extra.length >= 3) return true;
  if (String(amazon).trim().length > String(curated).trim().length + 15) return true;
  return false;
}

// name_action update is only a casing or punctuation cleanup of the same words.
// A longer Amazon listing title is the same product (keep) or a different one (mismatch).
function nameDecision(curated, amazon) {
  const title = String(amazon || "").replace(/\s+/g, " ").trim();
  if (!title) return { action: "missing", reason: "GetItems returned no title. Curated name left unchanged." };
  if (!sameProduct(curated, title)) {
    return { action: "mismatch", reason: "Amazon title does not contain this product's name. Curated name left unchanged." };
  }
  if (normalizeTitle(curated) === normalizeTitle(title)) {
    if (String(curated).trim() === title) return { action: "keep", reason: "Title already matches." };
    if (shouty(title)) return { action: "keep", reason: "Amazon title is shouty. Curated casing kept." };
    return { action: "update", name: title, reason: "Same words with cleaner casing or punctuation." };
  }
  if (seoNoisy(curated, title)) {
    return { action: "keep", reason: "Same product, but the Amazon title is a long listing name. Curated short name kept." };
  }
  return { action: "keep", reason: "Same product. Curated short name kept." };
}

function chunk(list, size) {
  const out = [];
  for (let i = 0; i < list.length; i += size) out.push(list.slice(i, i + size));
  return out;
}

function itemsOf(body) {
  if (!body || typeof body !== "object") return [];
  if (body.itemResults && Array.isArray(body.itemResults.items)) return body.itemResults.items;
  if (Array.isArray(body.items)) return body.items;
  return [];
}

function errorsOf(body) {
  if (!body || typeof body !== "object" || !Array.isArray(body.errors)) return [];
  return body.errors;
}

function asinFromError(err) {
  if (!err || typeof err !== "object") return "";
  if (ASIN.test(String(err.asin || ""))) return err.asin;
  if (ASIN.test(String(err.itemId || ""))) return err.itemId;
  const msg = String(err.message || "");
  const m = msg.match(/ItemId\s+(B[0-9A-Z]{9})/);
  return m ? m[1] : "";
}

function imageUrl(item) {
  const large = item && item.images && item.images.primary && item.images.primary.large;
  const url = large && large.url;
  return typeof url === "string" && url ? url : null;
}

function titleOf(item) {
  const title = item && item.itemInfo && item.itemInfo.title;
  const value = title && title.displayValue;
  return typeof value === "string" ? value : "";
}

async function readJson(url, res) {
  const text = await res.text();
  if (!res.ok) {
    const err = new Error(`${url} returned HTTP ${res.status}. Response body omitted.`);
    err.transport = true;
    throw err;
  }
  try {
    return JSON.parse(text);
  } catch (e) {
    const err = new Error(`${url} returned a non-JSON body.`);
    err.transport = true;
    throw err;
  }
}

async function fetchToken(env, fetchImpl) {
  const version = String(env.AMAZON_CREATORS_VERSION || "3.1").trim();
  const url = TOKEN_ENDPOINTS[version];
  if (!url) {
    throw new Error(`AMAZON_CREATORS_VERSION ${version} is unsupported. Use 3.1 (NA), 3.2 (EU), or 3.3 (FE).`);
  }
  const res = await fetchImpl(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({
      grant_type: "client_credentials",
      client_id: String(env.AMAZON_CREATORS_CLIENT_ID).trim(),
      client_secret: String(env.AMAZON_CREATORS_CLIENT_SECRET).trim(),
      scope: "creatorsapi::default",
    }),
  });
  const json = await readJson("Creators token endpoint", res);
  if (!json || typeof json.access_token !== "string" || !json.access_token) {
    throw new Error("Creators token response had no access_token.");
  }
  return json.access_token;
}

async function getItems(token, asins, fetchImpl) {
  const res = await fetchImpl(GET_ITEMS_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      Accept: "application/json",
      "x-marketplace": MARKETPLACE,
    },
    body: JSON.stringify({
      itemIds: asins,
      itemIdType: "ASIN",
      languagesOfPreference: ["en_US"],
      marketplace: MARKETPLACE,
      partnerTag: PARTNER_TAG,
      resources: RESOURCES,
    }),
  });
  return readJson("GetItems", res);
}

async function lookupLive(asins, env, fetchImpl) {
  const token = await fetchToken(env, fetchImpl);
  const items = new Map();
  const errors = [];
  for (const batch of chunk(asins, BATCH_SIZE)) {
    try {
      const body = await getItems(token, batch, fetchImpl);
      absorb(items, errors, body);
    } catch (e) {
      errors.push({ batch, message: e.message, transport: true });
    }
  }
  return { items, errors };
}

function absorb(items, errors, body) {
  for (const item of itemsOf(body)) {
    if (item && ASIN.test(String(item.asin || ""))) items.set(item.asin, item);
  }
  for (const err of errorsOf(body)) {
    errors.push({ asin: asinFromError(err), code: err && err.code, message: err && err.message, transport: false });
  }
}

function loadFixture(file) {
  const body = JSON.parse(fs.readFileSync(file, "utf8"));
  const items = new Map();
  const errors = [];
  absorb(items, errors, body);
  return { items, errors };
}

function plan(catalog, lookedUp, generatedAt) {
  const byAsin = new Map();
  for (const err of lookedUp.errors) {
    if (err.asin) byAsin.set(err.asin, err);
  }
  const rows = catalog.products.map((product) => {
    const item = lookedUp.items.get(product.asin);
    const err = byAsin.get(product.asin);
    if (!item) {
      return {
        id: product.id,
        asin: product.asin,
        name: product.name,
        amazon_title: null,
        name_action: "missing",
        reason: err && err.message ? String(err.message) : "No GetItems item for this ASIN.",
        image: null,
        ...(err && err.code ? { error_code: err.code } : {}),
      };
    }
    const amazon = titleOf(item);
    const decision = nameDecision(product.name, amazon);
    return {
      id: product.id,
      asin: product.asin,
      name: product.name,
      amazon_title: amazon || null,
      name_action: decision.action,
      ...(decision.action === "update" ? { proposed_name: decision.name } : {}),
      reason: decision.reason,
      image: imageUrl(item),
      last_refreshed: generatedAt,
    };
  });
  const summary = {
    products: rows.length,
    name_updates: rows.filter((r) => r.name_action === "update").length,
    kept: rows.filter((r) => r.name_action === "keep").length,
    mismatches: rows.filter((r) => r.name_action === "mismatch").length,
    missing: rows.filter((r) => r.name_action === "missing").length,
    transport_errors: lookedUp.errors.filter((e) => e.transport).length,
  };
  return { rows, summary };
}

function applyRows(catalog, report) {
  const byId = new Map(report.rows.map((r) => [r.id, r]));
  for (const product of catalog.products) {
    const row = byId.get(product.id);
    if (!row || row.name_action === "missing") continue;
    const before = {};
    for (const key of FROZEN) before[key] = JSON.stringify(product[key]);
    if (row.name_action === "update") product.name = row.proposed_name;
    product.amazon_title = row.amazon_title;
    product.last_refreshed = row.last_refreshed;
    for (const key of FROZEN) {
      if (JSON.stringify(product[key]) !== before[key]) {
        throw new Error(`refused to change ${key} on ${product.id}`);
      }
    }
  }
}

function reportEnvelope(mode, source, generatedAt, planned) {
  return {
    mode,
    source,
    partnerTag: PARTNER_TAG,
    marketplace: MARKETPLACE,
    endpoint: GET_ITEMS_URL,
    resources: RESOURCES,
    batch_size: BATCH_SIZE,
    generated_at: generatedAt,
    image_policy: "Primary image URLs are listed on each row for hygiene only. products.json does not store them. Pair UI renders the product emoji as a Lucide icon, so an empty image leaves that mark as it is.",
    summary: planned.summary,
    rows: planned.rows,
  };
}

function loadCatalog(file) {
  let catalog;
  try {
    catalog = JSON.parse(fs.readFileSync(file, "utf8"));
  } catch (e) {
    throw new Error(`Could not read ${file}: ${e.message}`);
  }
  if (!catalog || catalog.tag !== PARTNER_TAG) {
    throw new Error(`Catalog tag must be ${PARTNER_TAG}.`);
  }
  assertCatalog(catalog);
  const seen = new Set();
  for (const product of catalog.products) {
    if (!ASIN.test(String(product.asin || ""))) throw new Error(`bad ASIN for ${product.id}: ${product.asin}`);
    if (seen.has(product.asin)) throw new Error(`duplicate ASIN ${product.asin}`);
    seen.add(product.asin);
  }
  return catalog;
}

async function run(options) {
  const argv = options.argv || [];
  const env = options.env || process.env;
  const fetchImpl = options.fetch || globalThis.fetch;
  const log = options.log || console.log;
  const err = options.err || console.error;
  const args = parseArgs(argv);
  if (args.help) {
    log(helpText());
    return 0;
  }
  const catalog = loadCatalog(args.catalog);
  const generatedAt = args.now || (options.now ? options.now() : new Date().toISOString());
  let lookedUp;
  let source;
  if (args.fixture) {
    try {
      lookedUp = loadFixture(args.fixture);
    } catch (e) {
      err(e.message || String(e));
      return 1;
    }
    source = "fixture";
  } else {
    const missing = missingCreds(env);
    if (missing.length) {
      err(credentialHelp(missing));
      return 0;
    }
    try {
      lookedUp = await lookupLive(catalog.products.map((p) => p.asin), env, fetchImpl);
    } catch (e) {
      err(e.message || String(e));
      return 1;
    }
    source = "creators-api";
  }
  const planned = plan(catalog, lookedUp, generatedAt);
  const mode = args.apply ? "apply" : "dry-run";
  const report = reportEnvelope(mode, source, generatedAt, planned);
  const transport = planned.summary.transport_errors > 0;
  if (args.apply && !transport) {
    applyRows(catalog, report);
    fs.writeFileSync(args.catalog, JSON.stringify(catalog, null, 2) + "\n");
  }
  const line = `${mode}: ${planned.summary.products} products, ${planned.summary.name_updates} name update(s), ${planned.summary.kept} kept, ${planned.summary.mismatches} mismatch(es), ${planned.summary.missing} missing. ${args.apply && !transport ? "Wrote " + args.catalog + "." : "Catalog was not written."}`;
  if (args.report) {
    fs.writeFileSync(args.report, JSON.stringify(report, null, 2) + "\n");
    log(line);
  } else {
    err(line);
    log(JSON.stringify(report, null, 2));
  }
  return transport ? 1 : 0;
}

module.exports = {
  PARTNER_TAG,
  BATCH_SIZE,
  RESOURCES,
  FROZEN,
  TOKEN_ENDPOINTS,
  GET_ITEMS_URL,
  credentialHelp,
  missingCreds,
  parseArgs,
  nameDecision,
  sameProduct,
  chunk,
  run,
};

if (require.main === module) {
  run({ argv: process.argv.slice(2) }).then(
    (code) => process.exit(code),
    (e) => {
      console.error(e.message || String(e));
      process.exit(1);
    }
  );
}
