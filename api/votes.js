// Up/down votes for Grok Bot Shelf, stored in Neon Postgres via Neon's HTTP SQL endpoint
// (plain fetch, so the repo stays dependency free). Schema: db/schema.sql.
//
// GET  /api/votes             -> { global, scores: { [slug]: { up, down, score } } }   (CDN cached ~15s)
// GET  /api/votes?slug=bot-x  -> same, one bot
// GET  /api/votes?mine=1      -> adds { mine: { [slug]: 1|-1 } } for this visitor (never cached)
// POST /api/votes  { slug, value: 1 | -1 | 0 }  (0 clears)  -> { global, slug, value, up, down, score }
//
// Bots and agents: send header `X-Bot-Voter: <stable id>` (1-128 printable chars) on POST and on
// GET ?mine=1. The voter key becomes "bot:" + a salted SHA-256 of that id, no cookie is set, and the
// same rate limits apply (a slightly higher per-voter cap so a bot can rate a batch of shelf bots).
//
// Caps on new votes per network (salted ip_hash; IPv6 /64): 1 voter per bot (cookie and X-Bot-Voter voters
// count together) and 100 new votes a day. Over a cap: 429 with Retry-After and
// { code: "cap_network" | "cap_daily", error, retry_after }. Changing or clearing your own vote is never capped.
//
// Voter identity: a random UUID in an httpOnly, Secure, SameSite=Lax cookie (gbs_vid), set on the
// first vote. No login, no IP stored as identity. The client IP (its /64 for IPv6) is only kept as a
// salted SHA-256 hash, for rate limits and vote caps. VOTE_SALT is required: if it is missing or empty the handler
// returns 500 and nothing is hashed. If DATABASE_URL is not set the API answers { global: false }
// and the site falls back to personal, browser-only votes.
const crypto = require("crypto");
const bots = require("../public/bots.json");

const fold = (s) => String(s).toLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g, "");
const slugify = (s) => fold(s).replace(/&/g, " and ").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
const SLUGS = new Set(bots.map((b) => "bot-" + slugify(b.name)));

const DB = process.env.DATABASE_URL || process.env.NEON_DATABASE_URL || process.env.POSTGRES_URL || "";
const SALT = (process.env.VOTE_SALT || "").trim();
const COOKIE = "gbs_vid";
const LIMITS = { ip: 40, voter: 25, botVoter: 40, windowSec: 60 }; // writes per window
// Caps on NEW votes from one network (ip_hash). Changing or clearing a vote you already cast is never capped.
const CAPS = { perBot: 1, perDay: 100 };
const DAY = 86400;
const CAP_MESSAGES = {
  cap_network: "Someone on your network already voted on this bot. It's one vote per bot per network.",
  cap_daily: "You've reached today's vote limit. Try again tomorrow.",
};
const BOT_HEADER = "x-bot-voter";

async function sql(query, params = []) {
  const host = new URL(DB).hostname;
  const r = await fetch(`https://${host}/sql`, {
    method: "POST",
    headers: { "Neon-Connection-String": DB, "Content-Type": "application/json" },
    body: JSON.stringify({ query, params }),
  });
  if (!r.ok) throw new Error(`neon ${r.status}: ${(await r.text()).slice(0, 200)}`);
  return (await r.json()).rows;
}

function send(res, code, body, headers = {}) {
  res.statusCode = code;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  for (const [k, v] of Object.entries(headers)) res.setHeader(k, v);
  res.end(JSON.stringify(body));
}
const cookieOf = (req) => {
  const m = String(req.headers.cookie || "").match(/(?:^|;\s*)gbs_vid=([0-9a-f-]{36})(?:;|$)/i);
  return m ? m[1].toLowerCase() : "";
};
// Returns undefined when the header is absent, null when it is present but invalid, else the voter key.
const botKey = (req) => {
  const raw = req.headers[BOT_HEADER];
  if (raw === undefined) return undefined;
  const id = String(Array.isArray(raw) ? raw[0] : raw).trim();
  if (!/^[\x21-\x7e][\x20-\x7e]{0,127}$/.test(id)) return null;
  if (!SALT) { const err = new Error("VOTE_SALT is not configured"); err.code = "NO_SALT"; throw err; }
  return "bot:" + crypto.createHash("sha256").update(SALT + "|bot|" + id).digest("hex").slice(0, 32);
};
// Client IP. Vercel sets x-vercel-forwarded-for, x-real-ip and x-forwarded-for to the same single address and replaces
// whatever the client sent (https://vercel.com/docs/headers/request-headers). x-vercel-forwarded-for goes first because
// it stays correct even if a proxy is ever put in front of Vercel.
const firstOf = (req, name) => String(req.headers[name] || "").split(",")[0].trim();
const clientIp = (req) => firstOf(req, "x-vercel-forwarded-for") || firstOf(req, "x-real-ip") || firstOf(req, "x-forwarded-for") || String(req.socket?.remoteAddress || "");
// The network a vote comes from: the IPv4 address, or the /64 for IPv6 (one home or phone usually gets a whole /64).
const network = (ip) => {
  ip = String(ip).trim().replace(/^\[|\](?::\d+)?$/g, "").replace(/%.*$/, "").toLowerCase();
  const v4 = /^(?:::ffff:)?(\d{1,3}(?:\.\d{1,3}){3})$/.exec(ip);
  if (v4) return v4[1];
  if (!ip.includes(":")) return ip;
  const parts = (s) => (s ? s.split(":").flatMap((p) => (p.includes(".") ? ["0", "0"] : [p])) : []);
  const [h, t] = ip.split("::"), head = parts(h), tail = ip.includes("::") ? parts(t) : [];
  const all = ip.includes("::") ? [...head, ...Array(Math.max(0, 8 - head.length - tail.length)).fill("0"), ...tail] : head;
  return all.slice(0, 4).map((x) => (parseInt(x, 16) || 0).toString(16)).join(":") + "::/64";
};
const ipHash = (req) => {
  if (!SALT) { const err = new Error("VOTE_SALT is not configured"); err.code = "NO_SALT"; throw err; }
  return crypto.createHash("sha256").update(SALT + "|" + network(clientIp(req))).digest("hex").slice(0, 32);
};
const shape = (rows) => {
  const out = {};
  for (const r of rows) out[r.bot_slug] = { up: +r.up, down: +r.down, score: +r.score };
  return out;
};
async function readBody(req) {
  if (req.body && typeof req.body === "object") return req.body;
  if (typeof req.body === "string") return JSON.parse(req.body || "{}");
  let s = ""; for await (const c of req) { s += c; if (s.length > 2000) break; }
  return JSON.parse(s || "{}");
}

// Which cap (if any) stops a NEW vote: the per-bot cap first, then the daily one.
function capFor(rl) {
  if (rl.bot_voters >= CAPS.perBot) return "cap_network";
  if (rl.day_votes >= CAPS.perDay) return "cap_daily";
  return "";
}

const handler = async (req, res) => {
  if (!SALT) return send(res, 500, { error: "VOTE_SALT is not configured" }, { "Cache-Control": "no-store" });
  const url = new URL(req.url, "http://x");
  try {
    if (req.method === "GET") {
      if (!DB) return send(res, 200, { global: false, scores: {} }, { "Cache-Control": "public, s-maxage=300" });
      const slug = url.searchParams.get("slug");
      if (slug && !SLUGS.has(slug)) return send(res, 404, { error: "unknown bot" });
      const rows = slug
        ? await sql("SELECT bot_slug, up, down, score FROM vote_totals WHERE bot_slug = $1", [slug])
        : await sql("SELECT bot_slug, up, down, score FROM vote_totals");
      const body = { global: true, scores: shape(rows) };
      if (url.searchParams.get("mine")) {
        const bk = botKey(req);
        if (bk === null) return send(res, 400, { error: "X-Bot-Voter must be 1 to 128 printable characters" }, { "Cache-Control": "no-store" });
        const vid = bk || cookieOf(req), mine = {};
        if (vid) for (const r of await sql("SELECT bot_slug, value FROM votes WHERE voter_key = $1", [vid])) mine[r.bot_slug] = +r.value;
        body.mine = mine;
        return send(res, 200, body, { "Cache-Control": "private, no-store" });
      }
      return send(res, 200, body, { "Cache-Control": "public, max-age=0, s-maxage=15, stale-while-revalidate=60" });
    }

    if (req.method === "POST") {
      const noStore = { "Cache-Control": "no-store" };
      if (!DB) return send(res, 503, { global: false, error: "votes are local only for now" }, noStore);
      let body; try { body = await readBody(req); } catch { return send(res, 400, { error: "bad json" }, noStore); }
      const slug = String(body.slug || ""), value = Number(body.value);
      if (!SLUGS.has(slug)) return send(res, 400, { error: "unknown bot" }, noStore);
      if (![1, -1, 0].includes(value)) return send(res, 400, { error: "value must be 1, -1 or 0" }, noStore);

      const bk = botKey(req);
      if (bk === null) return send(res, 400, { error: "X-Bot-Voter must be 1 to 128 printable characters" }, noStore);
      let vid = bk || cookieOf(req); const headers = { ...noStore };
      if (!vid) {
        vid = crypto.randomUUID();
        headers["Set-Cookie"] = `${COOKIE}=${vid}; Path=/api/votes; Max-Age=63072000; HttpOnly; Secure; SameSite=Lax`;
      }
      const ih = ipHash(req);

      // One read for the burst limits and the caps. net = this network's votes on this bot, or from the last day.
      const [rl] = await sql(
        `WITH ev AS (SELECT ip_hash, voter_key FROM vote_events WHERE at > now() - make_interval(secs => $3) AND (ip_hash = $1 OR voter_key = $2)),
              net AS (SELECT bot_slug, voter_key, updated_at FROM votes WHERE ip_hash = $1 AND (bot_slug = $4 OR updated_at > now() - interval '1 day'))
         SELECT (SELECT COUNT(*) FROM ev WHERE ip_hash = $1)::int AS ip,
                (SELECT COUNT(*) FROM ev WHERE voter_key = $2)::int AS voter,
                EXISTS (SELECT 1 FROM votes WHERE bot_slug = $4 AND voter_key = $2) AS has_vote,
                (SELECT COUNT(*) FROM net WHERE bot_slug = $4 AND voter_key <> $2)::int AS bot_voters,
                (SELECT COUNT(*) FROM net WHERE updated_at > now() - interval '1 day')::int AS day_votes,
                (SELECT CEIL(EXTRACT(EPOCH FROM MIN(updated_at) + interval '1 day' - now())) FROM net WHERE updated_at > now() - interval '1 day')::int AS day_reset`,
        [ih, vid, LIMITS.windowSec, slug]);
      if (rl.ip >= LIMITS.ip || rl.voter >= (bk ? LIMITS.botVoter : LIMITS.voter))
        return send(res, 429, { error: "slow down a little" }, { ...headers, "Retry-After": String(LIMITS.windowSec) });

      await sql("INSERT INTO vote_events (ip_hash, voter_key) VALUES ($1, $2)", [ih, vid]);
      const cap = value !== 0 && !rl.has_vote && capFor(rl);
      if (cap) {
        const retry = cap === "cap_daily" ? Math.min(DAY, Math.max(60, +rl.day_reset || DAY)) : DAY;
        return send(res, 429, { error: CAP_MESSAGES[cap], code: cap, retry_after: retry }, { ...headers, "Retry-After": String(retry) });
      }
      if (value === 0) await sql("DELETE FROM votes WHERE bot_slug = $1 AND voter_key = $2", [slug, vid]);
      else await sql(
        `INSERT INTO votes (bot_slug, voter_key, value, ip_hash, updated_at) VALUES ($1, $2, $3, $4, now())
         ON CONFLICT (bot_slug, voter_key) DO UPDATE SET value = EXCLUDED.value, ip_hash = EXCLUDED.ip_hash, updated_at = now()`,
        [slug, vid, value, ih]);
      if (Math.random() < 0.05) sql("DELETE FROM vote_events WHERE at < now() - interval '1 day'").catch(() => {});

      const [t] = await sql("SELECT up, down, score FROM vote_totals WHERE bot_slug = $1", [slug]);
      return send(res, 200, { global: true, slug, value, voter: bk ? "bot" : "browser", up: t ? +t.up : 0, down: t ? +t.down : 0, score: t ? +t.score : 0 }, headers);
    }

    return send(res, 405, { error: "GET or POST" }, { Allow: "GET, POST" });
  } catch (e) {
    console.error("votes", e && e.message);
    if (e && e.code === "NO_SALT") return send(res, 500, { error: "VOTE_SALT is not configured" }, { "Cache-Control": "no-store" });
    return send(res, 500, { error: "vote store unavailable" }, { "Cache-Control": "no-store" });
  }
};
module.exports = handler;
module.exports.network = network;
module.exports.clientIp = clientIp;
module.exports.capFor = capFor;
module.exports.CAP_MESSAGES = CAP_MESSAGES;
