// /api/submit link checks (api/submit.js): which template and post links are accepted, how they are normalized, and
// the "already on the shelf" answer, all of which happen before the database. DATABASE_URL is unset and fetch is
// stubbed, so nothing is stored and nothing leaves this process. No browser. Usage: node test/submitlinks.js
process.env.VOTE_SALT = "test-salt";
delete process.env.DATABASE_URL; delete process.env.NEON_DATABASE_URL; delete process.env.POSTGRES_URL;
const ok = (c, m) => { console.log((c ? "PASS " : "FAIL ") + m); if (!c) process.exitCode = 1; };
let fetched = 0;
global.fetch = async () => { fetched++; return { ok: false, status: 500, text: async () => "", json: async () => ({}) }; };
const handler = require("../api/submit.js");
const bots = require("../public/bots.json");

const call = (method, body) => new Promise((resolve) => {
  const res = { headers: {}, setHeader(k, v) { this.headers[k] = v; }, end(s) { resolve({ code: this.statusCode, headers: this.headers, body: JSON.parse(s) }); } };
  handler({ method, url: "/api/submit", body, headers: { "x-forwarded-for": "1.2.3.4" }, socket: {} }, res);
});

(async () => {
  // Rejected template links: 400 naming the expected shape.
  for (const u of ["https://x.com/bot/AbCdEf123", "https://x.ai/bot/abc", "https://x.ai/bot/has space here", "https://evil.example/x.ai/bot/AbCdEf123", "https://x.ai/agents/AbCdEf123", "javascript:alert(1)"]) {
    const r = await call("POST", { bot_url: u });
    ok(r.code === 400 && /x\.ai\/bot/.test(r.body.error), `bot_url ${JSON.stringify(u)} is rejected`);
  }
  // Rejected post links.
  for (const u of ["https://x.com/someone", "https://x.com/someone/likes", "https://facebook.com/someone/status/1234567890", "https://x.com/someone/status/12"]) {
    const r = await call("POST", { post_url: u });
    ok(r.code === 400 && /x\.com\/you\/status/.test(r.body.error), `post_url ${JSON.stringify(u)} is rejected`);
  }
  { const r = await call("POST", {}); ok(r.code === 400 && /Paste an x\.ai\/bot link/.test(r.body.error), "no link at all is a 400"); }
  { const r = await call("POST", "{not json"); ok(r.code === 400 && r.body.error === "Send JSON.", "a body that is not JSON is a 400"); }
  { const r = await call("PUT", {}); ok(r.code === 405 && r.headers.Allow === "GET, POST", "PUT is 405 with Allow"); }

  // Already listed: answered from bots.json, before any network or database work, in every accepted link form.
  const listed = bots.find((b) => /^https:\/\/x\.ai\/bot\//.test(b.url)), id = listed.url.split("/").pop();
  for (const u of [listed.url, listed.url + "/", "x.ai/bot/" + id, "https://www.x.ai/bot/" + id, "http://x.ai/bot/" + id]) {
    const before = fetched, r = await call("POST", { bot_url: u });
    ok(r.code === 200 && r.body.status === "already_listed" && r.body.bot.url === listed.url && fetched === before, `${JSON.stringify(u)} is already_listed as ${listed.name}, with no lookups`);
  }
  { const r = await call("POST", { bot_url: listed.url }); ok(/^https:\/\/grokbotshelf\.com\/bot\/[a-z0-9-]+$/.test(r.body.bot.page), `already_listed links the bot page (${r.body.bot.page})`); }
  const withPost = bots.find((b) => b.source_post), pid = withPost.source_post.split("/").pop();
  for (const u of [withPost.source_post, `https://twitter.com/someone/status/${pid}`, `https://mobile.x.com/i/web/status/${pid}?s=20`]) {
    const r = await call("POST", { post_url: u });
    ok(r.code === 200 && r.body.status === "already_listed" && r.body.bot.name === withPost.name, `post ${JSON.stringify(u)} is already_listed by its post id`);
  }

  // Not listed and no database: a clear 503, never a crash and never a fake "queued".
  { const r = await call("POST", { bot_url: "https://x.ai/bot/NotOnTheShelf42" }); ok(r.code === 503 && /offline/.test(r.body.error), "a new link with no database is a 503"); }
  { const r = await call("POST", { bot_url: "https://x.ai/bot/NotOnTheShelf42", website: "http://spam" }); ok(r.code === 200 && r.body.status === "queued", "the honeypot field gets a fake success and stores nothing"); }

  // GET
  { const r = await call("GET"); ok(r.code === 200 && /POST JSON/.test(r.body.usage) && r.headers["Cache-Control"] === "no-store", "GET returns usage, not cached"); }
})();
