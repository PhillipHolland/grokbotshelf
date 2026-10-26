// /api/submit credit fields: creator_handle (template author) and inspired_by (idea credit).
// No browser, no network: Neon and x.ai are mocked through global fetch.
process.env.VOTE_SALT = "test-salt"; process.env.DATABASE_URL = "postgres://u:p@db.example.neon.tech/x";
const ok = (c, m) => { console.log((c ? "PASS " : "FAIL ") + m); if (!c) process.exitCode = 1; };
const queries = [];
global.fetch = async (url, init = {}) => {
  if (String(url).endsWith("/sql")) {
    const { query, params } = JSON.parse(init.body); queries.push({ query, params });
    let rows = [];
    if (/COUNT\(\*\)/.test(query)) rows = [{ m10: 0, day: 0, total: 0 }];
    if (/^\s*INSERT INTO submissions/.test(query)) rows = [{ id: "7" }];
    return { ok: true, json: async () => ({ rows }) };
  }
  return { ok: false, status: 500, text: async () => "" }; // template/oEmbed lookups: no metadata
};
const handler = require("../api/submit.js");
const call = (method, body, path = "/api/submit") => new Promise((resolve) => {
  const res = { headers: {}, setHeader(k, v) { this.headers[k] = v; }, end(s) { resolve({ code: this.statusCode, body: JSON.parse(s) }); } };
  handler({ method, url: path, body, headers: { "x-forwarded-for": "1.2.3.4" }, socket: {} }, res);
});
(async () => {
  const u = await call("GET");
  ok(/creator_handle/.test(u.body.usage) && /inspired_by/.test(u.body.usage), "usage mentions creator_handle and inspired_by");
  for (const [k, v] of [["creator_handle", "@has space"], ["creator_handle", "@@x"], ["inspired_by", "a".repeat(16)], ["inspired_by", "bad-dash"]]) {
    const r = await call("POST", { bot_url: "https://x.ai/bot/NotListedYet42", [k]: v });
    ok(r.code === 400 && r.body.error.includes(k), `${k}=${JSON.stringify(v)} is rejected with 400`);
  }
  const r = await call("POST", { bot_url: "https://x.ai/bot/NotListedYet42", note: "n".repeat(280), creator_handle: " Jorhan ", inspired_by: "@Phil_Holland" });
  ok(r.code === 200 && r.body.status === "queued", "valid handles queue the suggestion");
  const ins = queries.find((q) => /^\s*INSERT INTO submissions/.test(q.query));
  const [, , , , , , author, , note, , creator, inspired] = ins.params;
  ok(creator === "@Jorhan" && inspired === "@Phil_Holland", `handles stored normalized (${creator}, ${inspired})`);
  ok(author === "@Jorhan", "creator_handle fills post_author when the post gives none");
  ok(note.length <= 280 && note.endsWith(" author:@Jorhan inspired_by:@Phil_Holland"), `credit line folded into the note within 280 (${note.length})`);
  ok(queries.some((q) => /ADD COLUMN IF NOT EXISTS creator_handle/.test(q.query)) && queries.some((q) => /ADD COLUMN IF NOT EXISTS inspired_by/.test(q.query)), "ensure() adds the credit columns");
})();
