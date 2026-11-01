// Offline tests for scripts/creators-refresh.js. Never calls Amazon.
// Usage: node test/creators-refresh.js
const fs = require("fs"), os = require("os"), path = require("path"), { execFileSync, spawnSync } = require("child_process");
const ok = (c, m) => { console.log((c ? "PASS " : "FAIL ") + m); if (!c) process.exitCode = 1; };
const ROOT = path.join(__dirname, "..");
const SCRIPT = path.join(ROOT, "scripts", "creators-refresh.js");
const FIX = path.join(__dirname, "fixtures");
const {
  run, nameDecision, chunk, BATCH_SIZE, PARTNER_TAG, GET_ITEMS_URL, TOKEN_ENDPOINTS, FROZEN,
} = require(SCRIPT);

function cleanEnv(extra) {
  const env = { ...process.env, ...extra };
  for (const k of ["AMAZON_CREATORS_CLIENT_ID", "AMAZON_CREATORS_CLIENT_SECRET", "AMAZON_CREATORS_VERSION", "AMAZON_CREATORS_REFRESH_TOKEN"]) {
    if (!extra || !Object.prototype.hasOwnProperty.call(extra, k)) delete env[k];
  }
  return env;
}

function jsonResponse(obj, status) {
  const code = status || 200;
  return { ok: code >= 200 && code < 300, status: code, async text() { return JSON.stringify(obj); } };
}

const help = spawnSync(process.execPath, [SCRIPT, "--help"], { encoding: "utf8", env: cleanEnv() });
ok(help.status === 0 && /botshelf-20/.test(help.stdout) && /AMAZON_CREATORS_CLIENT_ID/.test(help.stdout) && /client_credentials|refresh token/i.test(help.stdout), " --help exits 0 and names the credential variables and partner tag");

const preload = path.join(os.tmpdir(), "creators-refresh-no-fetch.js");
fs.writeFileSync(preload, "global.fetch = () => { throw new Error('live fetch'); };\n");
const missing = spawnSync(process.execPath, ["-r", preload, SCRIPT, "--catalog", path.join(ROOT, "public", "products.json")], { encoding: "utf8", env: cleanEnv() });
ok(missing.status === 0 && /AMAZON_CREATORS_CLIENT_ID/.test(missing.stderr) && /AMAZON_CREATORS_CLIENT_SECRET/.test(missing.stderr) && /botshelf-20/.test(missing.stderr) && /No request was sent/.test(missing.stderr) && !/live fetch/.test(missing.stderr + missing.stdout), "missing credentials exit 0 with a setup message and do not call fetch");

const refreshOnly = spawnSync(process.execPath, ["-r", preload, SCRIPT], { encoding: "utf8", env: cleanEnv({ AMAZON_CREATORS_REFRESH_TOKEN: "should-not-count" }) });
ok(refreshOnly.status === 0 && /no refresh token/i.test(refreshOnly.stderr) && /AMAZON_CREATORS_CLIENT_ID/.test(refreshOnly.stderr), "a refresh token is not a Creators credential");

(async () => {
  const catalogPath = path.join(FIX, "creators-catalog.json");
  const before = fs.readFileSync(catalogPath);
  const reportPath = path.join(os.tmpdir(), "creators-refresh-report.json");
  const dry = await run({
    argv: ["--fixture", path.join(FIX, "creators-getitems.json"), "--catalog", catalogPath, "--now", "2026-11-01T00:00:00.000Z", "--report", reportPath],
    env: cleanEnv(),
    fetch: () => { throw new Error("live fetch"); },
    log: () => {},
    err: () => {},
  });
  const actual = fs.readFileSync(reportPath, "utf8");
  const expected = fs.readFileSync(path.join(FIX, "creators-refresh-dry-run.json"), "utf8");
  ok(dry === 0 && actual === expected && fs.readFileSync(catalogPath).equals(before), "fixture dry run matches the sample report and leaves the catalog bytes unchanged");

  const tmp = path.join(os.tmpdir(), "creators-catalog-apply.json");
  fs.copyFileSync(catalogPath, tmp);
  const applied = await run({
    argv: ["--apply", "--fixture", path.join(FIX, "creators-getitems.json"), "--catalog", tmp, "--now", "2026-11-01T00:00:00.000Z"],
    env: cleanEnv(),
    fetch: () => { throw new Error("live fetch"); },
    log: () => {},
    err: () => {},
  });
  const written = JSON.parse(fs.readFileSync(tmp, "utf8"));
  const byId = Object.fromEntries(written.products.map((p) => [p.id, p]));
  const frozenOk = written.products.every((p) => {
    const orig = JSON.parse(before.toString()).products.find((x) => x.id === p.id);
    return FROZEN.every((k) => JSON.stringify(p[k]) === JSON.stringify(orig[k]));
  });
  ok(applied === 0 && frozenOk, "--apply keeps id, asin, blurb, emoji, match, auto, flag, and pair_note");
  ok(byId["shure-case"].name === "Shure MV7" && byId["samsung-t7"].name === "Samsung T7 SSD" && byId["kindle-paperwhite"].name === "Kindle Paperwhite" && byId["echo-dot"].name === "Echo Dot", "name changes only for the same words, not for SEO titles or a different product");
  ok(byId["samsung-t7"].amazon_title.includes("Portable SSD") && byId["shure-mv7"].last_refreshed === "2026-11-01T00:00:00.000Z" && !byId["gone-asin"].amazon_title && !byId["gone-asin"].last_refreshed, "amazon_title and last_refreshed are stored for items GetItems returned");
  ok(written.products.every((p) => !("image" in p) && !("image_url" in p) && !("images" in p)) && byId["echo-dot"].auto === false && byId["echo-dot"].flag.startsWith("Leave unpaired") && byId["echo-dot"].pair_note.includes("Home category"), "image URLs stay out of the catalog; echo flags stay");

  const calls = [];
  const liveCatalog = {
    tag: "botshelf-20",
    disclosure: "As an Amazon Associate, Grok Bot Shelf earns from qualifying purchases.",
    ux: { label: "Pairs with", cta: "View on Amazon", rel: "noopener sponsored" },
    products: Array.from({ length: 11 }, (_, i) => ({
      id: "p" + i,
      asin: "B" + String(i).padStart(9, "0"),
      name: "Widget " + i,
      blurb: "A widget.",
      emoji: "📦",
      match: { keywords: ["widget " + i] },
    })),
  };
  const livePath = path.join(os.tmpdir(), "creators-live-catalog.json");
  fs.writeFileSync(livePath, JSON.stringify(liveCatalog, null, 2) + "\n");
  const liveBefore = fs.readFileSync(livePath);
  async function mockFetch(url, init) {
    calls.push({ url, init });
    if (url === TOKEN_ENDPOINTS["3.1"]) {
      const body = JSON.parse(init.body);
      if (body.grant_type !== "client_credentials" || body.scope !== "creatorsapi::default" || body.client_id !== "id" || body.client_secret !== "secret") {
        throw new Error("unexpected token body");
      }
      return jsonResponse({ access_token: "test-token", expires_in: 3600 });
    }
    if (url === GET_ITEMS_URL) {
      const body = JSON.parse(init.body);
      if (body.partnerTag !== PARTNER_TAG || body.marketplace !== "www.amazon.com") throw new Error("partner tag");
      if (body.itemIds.length > BATCH_SIZE) throw new Error("batch larger than 10");
      if (JSON.stringify(body.resources) !== JSON.stringify(["itemInfo.title", "images.primary.large"])) throw new Error("resources");
      if (init.headers.Authorization !== "Bearer test-token" || init.headers["x-marketplace"] !== "www.amazon.com") throw new Error("headers");
      if (String(init.body).includes("secret")) throw new Error("secret in GetItems body");
      return jsonResponse({
        itemResults: {
          items: body.itemIds.map((asin) => ({
            asin,
            images: { primary: { large: { url: "https://m.media-amazon.com/images/I/" + asin + ".jpg" } } },
            itemInfo: { title: { displayValue: "Widget " + Number(asin.slice(1)) } },
          })),
        },
      });
    }
    throw new Error("unexpected URL " + url);
  }
  const live = await run({
    argv: ["--catalog", livePath, "--now", "2026-11-01T00:00:00.000Z", "--report", path.join(os.tmpdir(), "creators-live-report.json")],
    env: cleanEnv({ AMAZON_CREATORS_CLIENT_ID: "id", AMAZON_CREATORS_CLIENT_SECRET: "secret" }),
    fetch: mockFetch,
    log: () => {},
    err: () => {},
  });
  const batches = calls.filter((c) => c.url === GET_ITEMS_URL).map((c) => JSON.parse(c.init.body).itemIds.length);
  ok(live === 0 && calls.filter((c) => c.url === TOKEN_ENDPOINTS["3.1"]).length === 1 && JSON.stringify(batches) === "[10,1]" && fs.readFileSync(livePath).equals(liveBefore), "mocked GetItems uses one NA token and batches of 10, and a dry run does not write");

  const euCalls = [];
  const eu = await run({
    argv: ["--catalog", livePath, "--now", "2026-11-01T00:00:00.000Z"],
    env: cleanEnv({ AMAZON_CREATORS_CLIENT_ID: "id", AMAZON_CREATORS_CLIENT_SECRET: "secret", AMAZON_CREATORS_VERSION: "3.2" }),
    fetch: async (url, init) => {
      euCalls.push(url);
      if (url === TOKEN_ENDPOINTS["3.2"]) return jsonResponse({ access_token: "eu-token" });
      if (url === GET_ITEMS_URL) {
        const body = JSON.parse(init.body);
        return jsonResponse({ itemResults: { items: body.itemIds.map((asin) => ({ asin, itemInfo: { title: { displayValue: "Widget " + Number(asin.slice(1)) } } })) } });
      }
      throw new Error("unexpected URL " + url);
    },
    log: () => {},
    err: () => {},
  });
  ok(eu === 0 && euCalls[0] === "https://api.amazon.co.uk/auth/o2/token", "version 3.2 uses the EU token host");

  const denied = await run({
    argv: ["--apply", "--catalog", livePath],
    env: cleanEnv({ AMAZON_CREATORS_CLIENT_ID: "id", AMAZON_CREATORS_CLIENT_SECRET: "secret" }),
    fetch: async () => jsonResponse({ error: "invalid_client" }, 401),
    log: () => {},
    err: () => {},
  });
  ok(denied === 1 && fs.readFileSync(livePath).equals(liveBefore), "a failed token request exits 1 and does not write the catalog");

  const badTag = path.join(os.tmpdir(), "creators-bad-tag.json");
  fs.writeFileSync(badTag, JSON.stringify({ ...liveCatalog, tag: "other-20" }));
  let tagCode = 0;
  let tagErr = "";
  try {
    tagCode = await run({ argv: ["--catalog", badTag], env: cleanEnv(), fetch: () => { throw new Error("live fetch"); }, log: () => {}, err: (m) => { tagErr += m; } });
  } catch (e) {
    tagCode = 1;
    tagErr = e.message;
  }
  ok(tagCode === 1 && /botshelf-20/.test(tagErr), "a catalog whose tag is not botshelf-20 is refused");

  ok(nameDecision("Shure MV7", "SHURE MV7").action === "keep" && nameDecision("Shure MV7", "SHURE MV7").reason.includes("shouty"), "shouty Amazon titles do not replace the curated name");
  ok(chunk([1, 2, 3], 2).length === 2 && chunk([1, 2, 3], 2)[1].length === 1, "ASIN batches split on the GetItems limit");
})().catch((e) => {
  console.log("FAIL " + (e && e.stack || e));
  process.exitCode = 1;
});
