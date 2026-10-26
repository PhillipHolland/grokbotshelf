// Suggest a bot for the shelf. Queues a pending row in Neon (table submissions, see db/schema.sql).
// This route never writes bots.json. Shelf Inbox (or Phil/Nick) reviews the queue for NSFW and
// security issues. Clean submissions may be added without a second human click; unclear ones stay pending.
//
// POST /api/submit  { bot_url?, post_url?, note? }   (at least one URL)
//   -> { ok, status: "queued" | "already_queued" | "already_listed", ... }
// GET  /api/submit                 -> usage
// GET  /api/submit?list=pending    -> pending suggestions not yet on the shelf (public template data only)
const crypto = require("crypto");
const bots = require("../public/bots.json");

const DB = process.env.DATABASE_URL || process.env.NEON_DATABASE_URL || process.env.POSTGRES_URL || "";
// Required. A missing salt used to fall back to a public string, which made IP hashes predictable.
const SALT = (process.env.VOTE_SALT || "").trim();
const LIMITS = { ip10m: 5, ipDay: 20, allDay: 300 };

const tid = (u) => String(u || "").replace(/^https:\/\/x\.ai\/(bot\/)?/, "");
const pidOf = (u) => (String(u || "").match(/\/status\/(\d+)/) || [])[1] || "";
const fold = (s) => String(s).toLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g, "");
const slugify = (s) => fold(s).replace(/&/g, " and ").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
const LISTED_T = new Map(bots.map((b) => [tid(b.url), b]));
const LISTED_P = new Map(bots.filter((b) => pidOf(b.source_post)).map((b) => [pidOf(b.source_post), b]));
const listed = (b) => ({ name: b.name, page: "https://grokbotshelf.com/bot/" + slugify(b.name), url: b.url });

async function sql(query, params = []) {
  const r = await fetch(`https://${new URL(DB).hostname}/sql`, {
    method: "POST",
    headers: { "Neon-Connection-String": DB, "Content-Type": "application/json" },
    body: JSON.stringify({ query, params }),
  });
  if (!r.ok) throw new Error(`neon ${r.status}: ${(await r.text()).slice(0, 200)}`);
  return (await r.json()).rows;
}
let ready = null;
const ensure = () => (ready ||= (async () => {
  for (const q of [
    `CREATE TABLE IF NOT EXISTS submissions (id BIGSERIAL PRIMARY KEY, template_id TEXT, bot_url TEXT, post_id TEXT, post_url TEXT, title TEXT, description TEXT, post_author TEXT, post_text TEXT, note TEXT, status TEXT NOT NULL DEFAULT 'pending', ip_hash TEXT, created_at TIMESTAMPTZ NOT NULL DEFAULT now())`,
    `CREATE UNIQUE INDEX IF NOT EXISTS submissions_template ON submissions (template_id) WHERE template_id IS NOT NULL`,
    `CREATE UNIQUE INDEX IF NOT EXISTS submissions_post ON submissions (post_id) WHERE post_id IS NOT NULL`,
    `CREATE INDEX IF NOT EXISTS submissions_status ON submissions (status, created_at)`,
    `CREATE TABLE IF NOT EXISTS submit_events (ip_hash TEXT NOT NULL, at TIMESTAMPTZ NOT NULL DEFAULT now())`,
    `CREATE INDEX IF NOT EXISTS submit_events_ip_at ON submit_events (ip_hash, at)`,
  ]) await sql(q);
})().catch((e) => { ready = null; throw e; }));

function send(res, code, body, headers = {}) {
  res.statusCode = code;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  for (const [k, v] of Object.entries(headers)) res.setHeader(k, v);
  res.end(JSON.stringify(body));
}
async function readBody(req) {
  if (req.body && typeof req.body === "object") return req.body;
  if (typeof req.body === "string") return JSON.parse(req.body || "{}");
  let s = ""; for await (const c of req) { s += c; if (s.length > 4000) break; }
  return JSON.parse(s || "{}");
}
const ipHash = (req) => {
  if (!SALT) { const err = new Error("VOTE_SALT is not configured"); err.code = "NO_SALT"; throw err; }
  const ip = String(req.headers["x-forwarded-for"] || req.socket?.remoteAddress || "").split(",")[0].trim();
  return crypto.createHash("sha256").update(SALT + "|submit|" + ip).digest("hex").slice(0, 32);
};
const decode = (s) => String(s || "").replace(/&quot;/g, '"').replace(/&#x27;|&#39;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&");
const clip = (s, n) => { s = String(s || "").replace(/\s+/g, " ").trim(); return s.length > n ? s.slice(0, n) : s; };

function normBot(u) {
  u = String(u || "").trim(); if (!u) return "";
  if (!/^https?:\/\//i.test(u)) u = "https://" + u;
  let x; try { x = new URL(u); } catch { return null; }
  if (!/^(www\.)?x\.ai$/i.test(x.hostname)) return null;
  let m = x.pathname.match(/^\/bot\/([A-Za-z0-9_-]{6,64})\/?$/);
  if (m) return "https://x.ai/bot/" + m[1];
  m = x.pathname.match(/^\/marketplace\/bots\/([a-z0-9-]{2,80})\/?$/);
  return m ? "https://x.ai/marketplace/bots/" + m[1] : null;
}
function normPost(u) {
  u = String(u || "").trim(); if (!u) return "";
  if (!/^https?:\/\//i.test(u)) u = "https://" + u;
  let x; try { x = new URL(u); } catch { return null; }
  if (!/^(www\.|mobile\.)?(x|twitter)\.com$/i.test(x.hostname)) return null;
  const m = x.pathname.match(/^\/([A-Za-z0-9_]{1,15}|i\/web)\/status\/(\d{5,25})/);
  return m ? `https://x.com/${m[1] === "i/web" ? "i" : m[1]}/status/${m[2]}` : null;
}
async function get(url, ms) {
  const c = new AbortController(), t = setTimeout(() => c.abort(), ms);
  try { return await fetch(url, { signal: c.signal, headers: { "User-Agent": "GrokBotShelf/1.0 (+https://grokbotshelf.com)" }, redirect: "follow" }); }
  finally { clearTimeout(t); }
}
async function templateMeta(botUrl) {
  try {
    const r = await get(botUrl, 6000);
    if (r.status === 404) return { missing: true };
    if (!r.ok) return {};
    const h = (await r.text()).slice(0, 200000);
    const meta = (p) => { const m = h.match(new RegExp(`<meta[^>]+property="${p}"[^>]+content="([^"]*)"`, "i")); return m ? decode(m[1]) : ""; };
    return { title: clip(meta("og:title"), 200), description: clip(meta("og:description"), 600) };
  } catch { return {}; }
}
async function postMeta(postUrl) {
  try {
    const r = await get("https://publish.twitter.com/oembed?omit_script=1&dnt=true&url=" + encodeURIComponent(postUrl), 5000);
    if (!r.ok) return {};
    const d = await r.json();
    const text = decode(String(d.html || "").replace(/<[^>]+>/g, " "));
    const bot = (String(d.html || "").match(/https?:\/\/x\.ai\/bot\/[A-Za-z0-9_-]{6,64}/) || [])[0] || "";
    const author = (String(d.author_url || "").match(/(?:x|twitter)\.com\/([A-Za-z0-9_]{1,15})/) || [])[1];
    return { author: author ? "@" + author : "", text: clip(text, 600), bot };
  } catch { return {}; }
}

module.exports = async (req, res) => {
  if (!SALT) return send(res, 500, { error: "VOTE_SALT is not configured" }, { "Cache-Control": "no-store" });
  const url = new URL(req.url, "http://x");
  try {
    if (req.method === "GET") {
      if (url.searchParams.get("list") === "pending") {
        if (!DB) return send(res, 200, { pending: [] });
        await ensure();
        const rows = await sql(`SELECT id, created_at, bot_url, template_id, post_url, post_id, title, description, post_author, note
                                  FROM submissions WHERE status = 'pending' ORDER BY created_at DESC LIMIT 200`);
        const pending = rows.filter((r) => !(r.template_id && LISTED_T.has(r.template_id)) && !(r.post_id && LISTED_P.has(r.post_id)))
          .map(({ template_id, post_id, ...r }) => r);
        return send(res, 200, { pending, count: pending.length });
      }
      return send(res, 200, { ok: true, usage: "POST JSON { bot_url, post_url, note } with at least one URL. Reviewed for NSFW and security issues by Shelf Inbox (or Phil/Nick). Clean submissions may be added without a second human click; anything unclear stays pending. GET ?list=pending to see the queue. Email pbh+shelf@mail.grokbot.com or ask Shelf Inbox in Grok Bot. See https://grokbotshelf.com/llms.txt." });
    }
    if (req.method !== "POST") return send(res, 405, { error: "GET or POST" }, { Allow: "GET, POST" });

    let body; try { body = await readBody(req); } catch { return send(res, 400, { error: "Send JSON." }); }
    if (body.website) return send(res, 200, { ok: true, status: "queued", message: "Thanks! It is in the review queue." }); // honeypot
    let botUrl = normBot(body.bot_url), postUrl = normPost(body.post_url);
    if (botUrl === null) return send(res, 400, { error: "The template link should look like https://x.ai/bot/..." });
    if (postUrl === null) return send(res, 400, { error: "The X post link should look like https://x.com/you/status/..." });
    if (!botUrl && !postUrl) return send(res, 400, { error: "Paste an x.ai/bot link or an X post link." });
    const note = clip(body.note, 280);

    // Already on the shelf? Answer before touching the database.
    const hit = (botUrl && LISTED_T.get(tid(botUrl))) || (postUrl && LISTED_P.get(pidOf(postUrl)));
    if (hit) return send(res, 200, { ok: true, status: "already_listed", bot: listed(hit), message: `${hit.name} is already on the shelf.` });

    if (!DB) return send(res, 503, { error: "Suggestions are offline right now. Post on X instead." });
    await ensure();
    const ih = ipHash(req);
    const [rl] = await sql(`SELECT COUNT(*) FILTER (WHERE ip_hash = $1 AND at > now() - interval '10 minutes')::int AS m10,
                                   COUNT(*) FILTER (WHERE ip_hash = $1)::int AS day, COUNT(*)::int AS total
                              FROM submit_events WHERE at > now() - interval '1 day'`, [ih]);
    if (rl.m10 >= LIMITS.ip10m || rl.day >= LIMITS.ipDay || rl.total >= LIMITS.allDay)
      return send(res, 429, { error: "Too many suggestions for now. Try again later." }, { "Retry-After": "600" });
    await sql("INSERT INTO submit_events (ip_hash) VALUES ($1)", [ih]);
    if (Math.random() < 0.05) sql("DELETE FROM submit_events WHERE at < now() - interval '2 days'").catch(() => {});

    const pm = postUrl ? await postMeta(postUrl) : {};
    if (!botUrl && pm.bot) botUrl = normBot(pm.bot) || "";
    if (botUrl) {
      const again = LISTED_T.get(tid(botUrl));
      if (again) return send(res, 200, { ok: true, status: "already_listed", bot: listed(again), message: `${again.name} is already on the shelf.` });
    }
    const tm = botUrl ? await templateMeta(botUrl) : {};
    if (tm.missing) return send(res, 400, { error: "That template link does not open on x.ai. Check it and try again." });

    const templateId = botUrl ? tid(botUrl) : null, postId = postUrl ? pidOf(postUrl) : null;
    const dup = await sql("SELECT id FROM submissions WHERE (template_id IS NOT NULL AND template_id = $1) OR (post_id IS NOT NULL AND post_id = $2) LIMIT 1", [templateId, postId]);
    if (dup.length) return send(res, 200, { ok: true, status: "already_queued", message: "Thanks! That one is already in the review queue." });

    const [row] = await sql(
      `INSERT INTO submissions (template_id, bot_url, post_id, post_url, title, description, post_author, post_text, note, ip_hash)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) ON CONFLICT DO NOTHING RETURNING id`,
      [templateId, botUrl || null, postId, postUrl || null, tm.title || null, tm.description || null, pm.author || null, pm.text || null, note || null, ih]);
    if (!row) return send(res, 200, { ok: true, status: "already_queued", message: "Thanks! That one is already in the review queue." });
    return send(res, 200, { ok: true, status: "queued", id: +row.id, title: tm.title || null,
      message: (tm.title ? `Thanks! ${tm.title} is in the review queue.` : "Thanks! It is in the review queue.") + " Reviewed for NSFW and security issues. Clean bots go live. Anything unclear is parked for a human." });
  } catch (e) {
    console.error("submit", e && e.message);
    if (e && e.code === "NO_SALT") return send(res, 500, { error: "VOTE_SALT is not configured" }, { "Cache-Control": "no-store" });
    return send(res, 500, { error: "That did not go through. Try again in a minute." });
  }
};
