const bots = require("../public/bots.json");

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "Cache-Control": "public, max-age=60, s-maxage=60",
  "Content-Type": "application/json; charset=utf-8",
};

function norm(s) {
  return String(s || "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "");
}

function tokens(q) {
  return norm(q)
    .split(/[^a-z0-9@_+.-]+/)
    .filter(Boolean);
}

function scoreBot(b, toks) {
  if (!toks.length) return 0;
  const name = norm(b.name);
  const desc = norm(b.description);
  const cat = norm(b.category);
  const handle = norm(b.creator_handle);
  const creator = norm(b.creator_name);
  const emoji = String(b.emoji || "");
  let score = 0;
  for (const t of toks) {
    let hit = 0;
    if (name === t) hit = 100;
    else if (name.startsWith(t)) hit = 70;
    else if (name.includes(t)) hit = 50;
    if (handle === t || handle === `@${t}`) hit = Math.max(hit, 60);
    else if (handle.includes(t)) hit = Math.max(hit, 35);
    if (creator.includes(t)) hit = Math.max(hit, 30);
    if (cat === t) hit = Math.max(hit, 40);
    else if (cat.includes(t)) hit = Math.max(hit, 25);
    if (desc.includes(t)) hit = Math.max(hit, 20);
    if (emoji.includes(t)) hit = Math.max(hit, 10);
    if (!hit) return 0;
    score += hit;
  }
  return score;
}

function publicBot(b) {
  return {
    name: b.name,
    emoji: b.emoji || "",
    description: b.description,
    category: b.category,
    url: b.url,
    creator_name: b.creator_name,
    creator_handle: b.creator_handle,
    creator_url: b.creator_url,
    source_post: b.source_post || "",
    added: b.added || "",
    ...(b.code_url ? { code_url: b.code_url } : {}),
  };
}

module.exports = function handler(req, res) {
  Object.entries(CORS).forEach(([k, v]) => res.setHeader(k, v));
  if (req.method === "OPTIONS") {
    res.statusCode = 204;
    return res.end();
  }
  if (req.method !== "GET") {
    res.statusCode = 405;
    return res.end(JSON.stringify({ error: "method_not_allowed" }));
  }

  const url = new URL(req.url, "https://grokbotshelf.com");
  const q = (url.searchParams.get("q") || "").trim();
  const category = (url.searchParams.get("category") || "").trim();
  const creator = (url.searchParams.get("creator") || "").trim().replace(/^@/, "");
  let limit = parseInt(url.searchParams.get("limit") || "20", 10);
  if (!Number.isFinite(limit) || limit < 1) limit = 20;
  if (limit > 100) limit = 100;

  let pool = bots.slice();
  if (category) {
    const c = norm(category);
    pool = pool.filter((b) => norm(b.category) === c || norm(b.category).includes(c));
  }
  if (creator) {
    const c = norm(creator);
    pool = pool.filter(
      (b) =>
        norm(b.creator_handle).replace(/^@/, "") === c ||
        norm(b.creator_handle).includes(c) ||
        norm(b.creator_name).includes(c)
    );
  }

  const toks = tokens(q);
  let results;
  if (!toks.length) {
    results = pool
      .slice()
      .sort((a, b) => String(b.added || "").localeCompare(String(a.added || "")) || a.name.localeCompare(b.name))
      .slice(0, limit)
      .map(publicBot);
  } else {
    results = pool
      .map((b) => ({ b, s: scoreBot(b, toks) }))
      .filter((x) => x.s > 0)
      .sort((a, b) => b.s - a.s || a.b.name.localeCompare(b.b.name))
      .slice(0, limit)
      .map((x) => ({ ...publicBot(x.b), score: x.s }));
  }

  res.statusCode = 200;
  res.end(
    JSON.stringify({
      query: q,
      category: category || null,
      creator: creator || null,
      count: results.length,
      total: bots.length,
      results,
    })
  );
};
