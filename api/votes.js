// Up/down votes for Grok Bot Shelf, stored in Neon Postgres via Neon's HTTP SQL endpoint
// (plain fetch, so the repo stays dependency free). Schema: db/schema.sql.
//
// GET  /api/votes             -> { global, scores: { [slug]: { up, down, score } } }   (CDN cached ~15s)
// GET  /api/votes?slug=bot-x  -> same, one bot
// GET  /api/votes?mine=1      -> adds { mine: { [slug]: 1|-1 } } for this visitor (never cached)
// POST /api/votes  { slug, value: 1 | -1 | 0 }  (0 clears)  -> { global, slug, value, up, down, score }
//
// Voter identity: a random UUID in an httpOnly, Secure, SameSite=Lax cookie (gbs_vid), set on the
// first vote. No login, no IP stored as identity. The client IP is only kept as a salted SHA-256
// hash for burst rate limiting. If DATABASE_URL is not set the API answers { global: false } and
// the site falls back to personal, browser-only votes.
const crypto = require("crypto");
const bots = require("../public/bots.json");

const fold = (s) => String(s).toLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g, "");
const slugify = (s) => fold(s).replace(/&/g, " and ").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
const SLUGS = new Set(bots.map((b) => "bot-" + slugify(b.name)));

const DB = process.env.DATABASE_URL || process.env.NEON_DATABASE_URL || process.env.POSTGRES_URL || "";
const SALT = process.env.VOTE_SALT || "grokbotshelf-votes";
const COOKIE = "gbs_vid";
const LIMITS = { ip: 40, voter: 25, windowSec: 60 }; // writes per window

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
const ipHash = (req) => {
  const ip = String(req.headers["x-forwarded-for"] || req.socket?.remoteAddress || "").split(",")[0].trim();
  return crypto.createHash("sha256").update(SALT + "|" + ip).digest("hex").slice(0, 32);
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

module.exports = async (req, res) => {
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
        const vid = cookieOf(req), mine = {};
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

      let vid = cookieOf(req); const headers = { ...noStore };
      if (!vid) {
        vid = crypto.randomUUID();
        headers["Set-Cookie"] = `${COOKIE}=${vid}; Path=/api/votes; Max-Age=63072000; HttpOnly; Secure; SameSite=Lax`;
      }
      const ih = ipHash(req);

      const [rl] = await sql(
        `SELECT COUNT(*) FILTER (WHERE ip_hash = $1)::int AS ip, COUNT(*) FILTER (WHERE voter_key = $2)::int AS voter
           FROM vote_events WHERE at > now() - make_interval(secs => $3) AND (ip_hash = $1 OR voter_key = $2)`,
        [ih, vid, LIMITS.windowSec]);
      if (rl.ip >= LIMITS.ip || rl.voter >= LIMITS.voter)
        return send(res, 429, { error: "slow down a little" }, { ...headers, "Retry-After": String(LIMITS.windowSec) });

      await sql("INSERT INTO vote_events (ip_hash, voter_key) VALUES ($1, $2)", [ih, vid]);
      if (value === 0) await sql("DELETE FROM votes WHERE bot_slug = $1 AND voter_key = $2", [slug, vid]);
      else await sql(
        `INSERT INTO votes (bot_slug, voter_key, value, ip_hash, updated_at) VALUES ($1, $2, $3, $4, now())
         ON CONFLICT (bot_slug, voter_key) DO UPDATE SET value = EXCLUDED.value, ip_hash = EXCLUDED.ip_hash, updated_at = now()`,
        [slug, vid, value, ih]);
      if (Math.random() < 0.05) sql("DELETE FROM vote_events WHERE at < now() - interval '1 day'").catch(() => {});

      const [t] = await sql("SELECT up, down, score FROM vote_totals WHERE bot_slug = $1", [slug]);
      return send(res, 200, { global: true, slug, value, up: t ? +t.up : 0, down: t ? +t.down : 0, score: t ? +t.score : 0 }, headers);
    }

    return send(res, 405, { error: "GET or POST" }, { Allow: "GET, POST" });
  } catch (e) {
    console.error("votes", e && e.message);
    return send(res, 500, { error: "vote store unavailable" }, { "Cache-Control": "no-store" });
  }
};
