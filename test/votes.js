// Unit tests for api/votes.js against an in-memory Postgres (PGlite, needs @electric-sql/pglite on NODE_PATH like
// puppeteer-core). fetch is replaced, so the handler's Neon HTTP calls run against PGlite and nothing leaves this
// process: no request ever reaches a real database, preview or production.
// Usage: NODE_PATH=/path/to/node_modules node test/votes.js
const fs = require("fs"), path = require("path"), crypto = require("crypto");
const { PGlite } = require("@electric-sql/pglite");
const ok = (c, m) => { console.log((c ? "PASS " : "FAIL ") + m); if (!c) process.exitCode = 1; };
process.env.DATABASE_URL = "postgres://test:test@db.mock.invalid/votes"; process.env.VOTE_SALT = "unit-test-salt";
delete process.env.NEON_DATABASE_URL; delete process.env.POSTGRES_URL;
const db = new PGlite();
global.fetch = async (url, init) => {
  if (!/^https:\/\/db\.mock\.invalid\/sql$/.test(String(url))) throw new Error("unexpected fetch " + url);
  const { query, params } = JSON.parse(init.body);
  const r = await db.query(query, params);
  return { ok: true, status: 200, json: async () => ({ rows: r.rows }), text: async () => "" };
};
const votes = require(path.join(__dirname, "..", "api", "votes.js"));
const { slugify } = require(path.join(__dirname, "..", "scripts", "shelf.js"));
const SLUGS = require(path.join(__dirname, "..", "public", "bots.json")).slice(0, 8).map((b) => "bot-" + slugify(b.name));
const [A, B, C, D, E] = SLUGS;
const uuid = () => crypto.randomUUID();
function post(body, { ip = "203.0.113.1", vid, bot, headers = {} } = {}) {
  return new Promise((resolve, reject) => {
    const h = { "x-vercel-forwarded-for": ip, "x-real-ip": ip, "x-forwarded-for": ip, ...headers };
    if (vid) h.cookie = "gbs_vid=" + vid;
    if (bot) h["x-bot-voter"] = bot;
    const res = { statusCode: 0, headers: {}, setHeader(k, v) { this.headers[k.toLowerCase()] = v; }, end(b) { let d = {}; try { d = JSON.parse(b); } catch {} resolve({ status: this.statusCode, headers: this.headers, body: d }); } };
    Promise.resolve(votes({ method: "POST", url: "/api/votes", headers: h, body }, res)).catch(reject);
  });
}
const rows = async (q, p = []) => (await db.query(q, p)).rows;
const count = async (slug) => +(await rows("SELECT COUNT(*)::int AS n FROM votes WHERE bot_slug = $1", [slug]))[0].n;

(async () => {
  await db.exec(fs.readFileSync(path.join(__dirname, "..", "db", "schema.sql"), "utf8"));

  // network(): IPv4 as is, IPv6 by /64, header order
  ok(votes.network("2001:db8:abcd:12:1:2:3:4") === votes.network("2001:DB8:abcd:0012::99") && votes.network("2001:db8:abcd:13::1") !== votes.network("2001:db8:abcd:12::1"), "IPv6 addresses in the same /64 are one network, a different /64 is another");
  ok(votes.network("::ffff:198.51.100.7") === "198.51.100.7" && votes.network("198.51.100.7") === "198.51.100.7", "IPv4 and IPv4-mapped IPv6 are the same network");
  ok(votes.clientIp({ headers: { "x-vercel-forwarded-for": "198.51.100.1", "x-real-ip": "198.51.100.2", "x-forwarded-for": "6.6.6.6, 198.51.100.3" } }) === "198.51.100.1"
    && votes.clientIp({ headers: { "x-real-ip": "198.51.100.2", "x-forwarded-for": "6.6.6.6" } }) === "198.51.100.2", "client IP prefers x-vercel-forwarded-for, then x-real-ip, then x-forwarded-for");

  // One vote per device, with a backstop of 3 distinct voters per bot per network (browser and X-Bot-Voter together)
  const NET_MSG = "This bot already has the most votes we allow from one network (3). On shared Wi-Fi, that's why.";
  ok(votes.CAP_MESSAGES.cap_network === NET_MSG && !("cap_bot_voter" in votes.CAP_MESSAGES), "cap_network has the new copy and there is no cap_bot_voter");
  const v = [uuid(), uuid(), uuid(), uuid(), uuid()];
  let r = await post({ slug: A, value: 1 }, { vid: v[0] });
  ok(r.status === 200 && r.body.global, "1st voter on a network can vote on a bot");
  r = await post({ slug: A, value: -1 }, { vid: v[1] });
  ok(r.status === 200, "2nd voter on the same network can vote");
  r = await post({ slug: A, value: 1 }, { vid: v[2] });
  ok(r.status === 200, "3rd voter on the same network can vote");
  r = await post({ slug: A, value: 1 }, { vid: v[3] });
  ok(r.status === 429 && r.body.code === "cap_network" && r.body.error === NET_MSG && r.headers["retry-after"] === "86400" && r.body.retry_after === 86400,
    `4th voter on the same network: 429 cap_network, Retry-After ${r.headers["retry-after"]}`);
  ok(await count(A) === 3, "the capped vote was not written");
  r = await post({ slug: A, value: 1 }, { vid: v[0] });
  ok(r.status === 200 && await count(A) === 3, "a voter re-sending the same vote does not count as new (one row per device)");
  r = await post({ slug: A, value: 1 }, { vid: uuid(), headers: { "x-forwarded-for": "192.0.2.77" } });
  ok(r.status === 429 && r.body.code === "cap_network", "a spoofed x-forwarded-for does not change the network (x-vercel-forwarded-for wins)");
  r = await post({ slug: A, value: 1 }, { vid: v[1] });
  ok(r.status === 200 && r.body.value === 1, "an existing voter can still flip their vote at the cap");
  r = await post({ slug: A, value: 0 }, { vid: v[2] });
  ok(r.status === 200 && r.body.value === 0 && await count(A) === 2, "an existing voter can still clear their vote at the cap");
  r = await post({ slug: A, value: 1 }, { vid: v[3] });
  ok(r.status === 200, "after a clear frees a slot, a new voter on that network can vote");
  r = await post({ slug: A, value: 1 }, { vid: v[4], ip: "203.0.113.2" });
  ok(r.status === 200, "a voter on a different network is not affected");
  r = await post({ slug: B, value: 1 }, { vid: v[4] });
  ok(r.status === 200, "the cap is per bot: the same network can vote on another bot");
  r = await post({ slug: A, value: 0 }, { vid: uuid() });
  ok(r.status === 200, "clearing a vote you never cast is not capped");

  // IPv6: one /64 is one network
  const six = (n) => `2001:db8:5:6::${n}`;
  for (let i = 1; i <= 3; i++) {
    r = await post({ slug: C, value: 1 }, { vid: uuid(), ip: six(i) });
    ok(r.status === 200, `IPv6: address ${i} in a /64 can vote`);
  }
  r = await post({ slug: C, value: 1 }, { vid: uuid(), ip: "2001:db8:5:6:ffff:1:2:3" });
  ok(r.status === 429 && r.body.code === "cap_network", "IPv6: a 4th address in the same /64 hits cap_network");
  r = await post({ slug: C, value: 1 }, { vid: uuid(), ip: "2001:db8:5:7::1" });
  ok(r.status === 200, "IPv6: a different /64 can vote");

  // Browser and X-Bot-Voter voters share the same 3 per bot per network
  const bip = { ip: "198.51.100.40" };
  r = await post({ slug: A, value: 1 }, { ...bip, bot: "agent-1" });
  ok(r.status === 200 && r.body.voter === "bot", "a bot voter can vote");
  r = await post({ slug: A, value: 1 }, { ...bip, vid: uuid() });
  ok(r.status === 200, "a browser voter on the same network and bot can vote (2 of 3)");
  r = await post({ slug: A, value: 1 }, { ...bip, bot: "agent-2" });
  ok(r.status === 200, "a 2nd bot id on the same network and bot can vote (3 of 3)");
  r = await post({ slug: A, value: 1 }, { ...bip, bot: "agent-3" });
  ok(r.status === 429 && r.body.code === "cap_network" && r.headers["retry-after"] === "86400", "a 4th voter that is a bot id: 429 cap_network");
  r = await post({ slug: A, value: 1 }, { ...bip, vid: uuid() });
  ok(r.status === 429 && r.body.code === "cap_network", "a 4th voter that is a browser: 429 cap_network");
  r = await post({ slug: A, value: -1 }, { ...bip, bot: "agent-1" });
  ok(r.status === 200 && r.body.value === -1, "a bot voter can still flip its vote at the cap");
  ok((await post({ slug: B, value: 1 }, { ...bip, bot: "agent-3" })).status === 200 && (await post({ slug: C, value: 1 }, { ...bip, bot: "agent-4" })).status === 200,
    "other bot ids on that network can vote on other bots (no separate bot-id cap)");

  // 100 new votes per network per day
  const dip = "198.51.100.90", dh = crypto.createHash("sha256").update("unit-test-salt|" + dip).digest("hex").slice(0, 32);
  await db.query(`INSERT INTO votes (bot_slug, voter_key, value, ip_hash, updated_at)
    SELECT 'bot-x-' || g, 'seed-' || g, 1, $1, now() - make_interval(hours => 23) + make_interval(secs => g) FROM generate_series(1, 100) g`, [dh]);
  r = await post({ slug: B, value: 1 }, { ip: dip, vid: uuid() });
  const ra = +r.headers["retry-after"];
  ok(r.status === 429 && r.body.code === "cap_daily" && r.body.error === "You've reached today's vote limit. Try again tomorrow." && ra > 3500 && ra <= 3700 && r.body.retry_after === ra,
    `101st new vote in a day: 429 cap_daily, Retry-After ${ra}s (when the oldest of the 100 turns a day old)`);
  await db.query("UPDATE votes SET updated_at = now() - interval '25 hours' WHERE voter_key LIKE 'seed-%'");
  r = await post({ slug: B, value: 1 }, { ip: dip, vid: uuid() });
  ok(r.status === 200, "votes older than a day no longer count toward the daily cap");

  // Burst limit still answers first, with no cap code
  const sip = "198.51.100.120", sv = uuid(); let last;
  for (let i = 0; i < 26; i++) last = await post({ slug: E, value: i % 2 ? 1 : -1 }, { ip: sip, vid: sv });
  ok(last.status === 429 && !last.body.code && last.body.error === "slow down a little" && last.headers["retry-after"] === "60", "burst limit unchanged: 429 slow down a little, Retry-After 60, no cap code");
  const left = await rows("SELECT bot_slug FROM votes WHERE ip_hash IS NULL");
  ok(!left.length, "every vote row has an ip_hash");
})().catch((e) => { console.log("FAIL crashed: " + e.stack); process.exitCode = 1; });
