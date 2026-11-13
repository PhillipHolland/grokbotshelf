// POST /api/submit with the optional creator-supplied details. Unknown keys are dropped, text is clipped, "not sure"
// (anything that is not a boolean) is left out, and nothing usable stores NULL. No browser and no database: Neon's
// HTTP endpoint and the x.ai lookup are stubbed. Run: node test/submitdetails.js
const path = require("path");
const ok = (c, m) => { console.log((c ? "PASS " : "FAIL ") + m); if (!c) process.exitCode = 1; };
process.env.VOTE_SALT = "test-salt";
process.env.DATABASE_URL = "postgres://u:p@db.example.test/neondb";
delete process.env.SUBMIT_LIST_TOKEN;
let inserted = null;
global.fetch = async (url, init) => {
  if (!String(url).includes("db.example.test")) return { ok: true, status: 200, text: async () => "", json: async () => ({}) };
  const { query, params } = JSON.parse(init.body);
  if (/^INSERT INTO submissions/.test(query.trim())) { inserted = { query, params }; return { ok: true, json: async () => ({ rows: [{ id: 7 }] }) }; }
  if (/FROM submit_events/.test(query)) return { ok: true, json: async () => ({ rows: [{ m10: 0, day: 0, total: 0 }] }) };
  return { ok: true, json: async () => ({ rows: [] }) };
};
const handler = require(path.join(__dirname, "..", "api", "submit.js"));
async function post(body) {
  inserted = null;
  const res = { setHeader() {}, end(b) { this.body = JSON.parse(b); } };
  await handler({ method: "POST", url: "/api/submit", headers: { "x-forwarded-for": "203.0.113.9" }, body }, res);
  return res;
}
const stored = () => { const cols = inserted.query.match(/\(([^)]+)\)/)[1].split(",").map((s) => s.trim()); const v = inserted.params[cols.indexOf("details")]; return v == null ? null : JSON.parse(v); };

(async () => {
  let r = await post({ bot_url: "https://x.ai/bot/detailsTest001", details: {
    connectors: ["Gmail", " Gmail ", "Google Calendar", "", "x".repeat(80), 5], needs: "  A Gmail account  ", limits: "y".repeat(400),
    sends: true, posts: "yes", spends: false, admin: true, routines: [{ name: "nope" }] } });
  ok(r.statusCode === 200 && r.body.status === "queued", "a submission with details is queued");
  const d = stored();
  ok(d && JSON.stringify(d.connectors) === JSON.stringify(["Gmail", "Google Calendar", "x".repeat(30), "5"]), "connectors are trimmed, de-duplicated and clipped: " + JSON.stringify(d && d.connectors));
  ok(d.needs === "A Gmail account" && d.limits.length === 160, "text fields are trimmed and clipped to 160");
  ok(d.sends === true && d.spends === false && !("posts" in d), "only real booleans are kept for sends/posts/spends");
  ok(!("admin" in d) && !("routines" in d), "unknown keys are dropped");

  r = await post({ bot_url: "https://x.ai/bot/detailsTest002", details: { connectors: [], needs: "   ", sends: "no" } });
  ok(r.body.status === "queued" && stored() === null, "nothing usable stores NULL");
  r = await post({ bot_url: "https://x.ai/bot/detailsTest003", details: "<script>" });
  ok(r.body.status === "queued" && stored() === null, "a non-object details value is ignored, not an error");
  r = await post({ bot_url: "https://x.ai/bot/detailsTest004" });
  ok(r.body.status === "queued" && stored() === null, "details stay optional");
})().catch((e) => { console.error(e); process.exit(1); });
