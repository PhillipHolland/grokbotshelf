// GET /api/submit?list=pending: the rows are unreviewed, so with SUBMIT_LIST_TOKEN set only a matching
// Authorization: Bearer token gets them and everyone else gets the count. With the variable unset the list is open.
// No browser and no database: Neon's HTTP endpoint is stubbed. Run: node test/pendinglist.js
const path = require("path");
const ok = (c, m) => { console.log((c ? "PASS " : "FAIL ") + m); if (!c) process.exitCode = 1; };
const ROWS = [{ id: 1, created_at: "2026-11-04", bot_url: "https://x.ai/bot/zzzzzzzzzz", template_id: "zzzzzzzzzz", post_url: null, post_id: null,
  title: "Unreviewed", description: "Not checked yet", post_author: null, creator_handle: null, inspired_by: null, note: "private note" }];

function load(token) {
  process.env.VOTE_SALT = "test-salt";
  process.env.DATABASE_URL = "postgres://u:p@db.example.test/neondb";
  if (token) process.env.SUBMIT_LIST_TOKEN = token; else delete process.env.SUBMIT_LIST_TOKEN;
  const file = path.join(__dirname, "..", "api", "submit.js");
  delete require.cache[require.resolve(file)];
  return require(file);
}
async function call(handler, headers = {}) {
  const res = { headers: {}, setHeader(k, v) { this.headers[k] = v; }, end(b) { this.body = JSON.parse(b); } };
  await handler({ method: "GET", url: "/api/submit?list=pending", headers }, res);
  return res;
}

(async () => {
  global.fetch = async (url, init) => ({ ok: true, json: async () => ({ rows: /FROM submissions WHERE status/.test(JSON.parse(init.body).query) ? ROWS : [] }) });

  let h = load("s3cret-token");
  let r = await call(h);
  ok(r.statusCode === 200 && r.body.count === 1 && !("pending" in r.body), "token set, no header: count only");
  ok(!JSON.stringify(r.body).includes("private note"), "token set, no header: no submitter note in the reply");
  r = await call(h, { authorization: "Bearer wrong" });
  ok(!("pending" in r.body), "token set, wrong token: count only");
  r = await call(h, { authorization: "Bearer s3cret-token-and-more" });
  ok(!("pending" in r.body), "token set, longer token with the right prefix: count only");
  r = await call(h, { authorization: "Bearer s3cret-token" });
  ok(Array.isArray(r.body.pending) && r.body.pending.length === 1 && r.body.pending[0].note === "private note", "token set, right token: rows returned");
  ok(r.headers["Cache-Control"] === "no-store", "pending list is never cached");

  h = load("");
  r = await call(h);
  ok(Array.isArray(r.body.pending) && r.body.pending.length === 1, "token unset: list stays open");
})().catch((e) => { console.error(e); process.exit(1); });
