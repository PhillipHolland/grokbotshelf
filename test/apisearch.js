// /api/search (api/search.js): the public search endpoint for bots and agents. Calls the handler directly with a fake
// request against the real public/bots.json. No browser, no network. Usage: node test/apisearch.js
const ok = (c, m) => { console.log((c ? "PASS " : "FAIL ") + m); if (!c) process.exitCode = 1; };
const handler = require("../api/search.js");
const bots = require("../public/bots.json");

const call = (path, method = "GET") => {
  const res = { statusCode: 0, headers: {}, body: "", setHeader(k, v) { this.headers[k.toLowerCase()] = v; }, end(s = "") { this.body = s; } };
  handler({ method, url: path, headers: {} }, res);
  let json = null; try { json = res.body ? JSON.parse(res.body) : null; } catch {}
  return { code: res.statusCode, headers: res.headers, json };
};
const names = (r) => r.json.results.map((b) => b.name);

// Method handling and headers
{ const r = call("/api/search", "OPTIONS"); ok(r.code === 204 && r.headers["access-control-allow-origin"] === "*", "OPTIONS answers 204 with open CORS"); }
{ const r = call("/api/search", "POST"); ok(r.code === 405 && r.json.error === "method_not_allowed", "POST is 405"); }
{ const r = call("/api/search"); ok(r.code === 200 && /application\/json/.test(r.headers["content-type"]) && /s-maxage=60/.test(r.headers["cache-control"]), "GET is JSON with a 60s edge cache"); }

// No query: newest first, default limit 20, total is the whole shelf
{
  const r = call("/api/search");
  const added = r.json.results.map((b) => b.added);
  ok(r.json.count === 20 && r.json.results.length === 20 && r.json.total === bots.length, `no query returns 20 of ${bots.length}`);
  ok(added.every((d, i) => i === 0 || added[i - 1] >= d), "no query is sorted newest first");
  ok(r.json.query === "" && r.json.category === null && r.json.creator === null, "echoes an empty query and null filters");
}

// limit is clamped to 1..100, bad values fall back to 20
for (const [v, want] of [["5", 5], ["0", 20], ["-3", 20], ["abc", 20], ["1000", 100]]) {
  const r = call("/api/search?limit=" + v); ok(r.json.results.length === Math.min(want, bots.length), `limit=${v} gives ${want}`);
}

// Scoring: an exact name wins, every token must hit
{
  const target = bots.find((b) => /^[A-Za-z]+$/.test(b.name) && b.name.length > 5);
  const r = call("/api/search?q=" + encodeURIComponent(target.name.toLowerCase()));
  ok(r.json.results[0].name === target.name && r.json.results[0].score >= 100, `exact name "${target.name}" ranks first (score ${r.json.results[0].score})`);
  const s = r.json.results.map((b) => b.score); ok(s.every((x, i) => i === 0 || s[i - 1] >= x), "results are sorted by score");
}
{ const r = call("/api/search?q=zzzqqqxxx"); ok(r.json.count === 0 && r.json.results.length === 0, "a query that matches nothing returns an empty list"); }
{ const r = call("/api/search?q=budget%20zzzqqqxxx"); ok(r.json.count === 0, "every token must match (AND), so one nonsense word empties the list"); }
{ const r = call("/api/search?q=BUDGET"), r2 = call("/api/search?q=budget"); ok(r.json.count > 0 && JSON.stringify(names(r)) === JSON.stringify(names(r2)), `case does not matter ("budget": ${r.json.count} hits)`); }

// Filters
{
  const cat = bots[0].category, r = call("/api/search?limit=100&category=" + encodeURIComponent(cat.toUpperCase()));
  ok(r.json.count > 0 && r.json.results.every((b) => b.category === cat) && r.json.category === cat.toUpperCase(), `category filter is exact and case-insensitive (${cat}: ${r.json.count})`);
}
{
  const withHandle = bots.find((b) => b.creator_handle), h = withHandle.creator_handle;
  const a = call("/api/search?limit=100&creator=" + encodeURIComponent(h)), b = call("/api/search?limit=100&creator=" + encodeURIComponent(h.slice(1)));
  ok(a.json.count > 0 && a.json.results.every((x) => x.creator_handle.toLowerCase().includes(h.slice(1).toLowerCase()) || x.creator_name.toLowerCase().includes(h.slice(1).toLowerCase())), `creator filter matches ${h} (${a.json.count})`);
  ok(a.json.count === b.json.count && a.json.creator === h.slice(1), "creator works with or without @");
}
{ const r = call("/api/search?category=No%20Such%20Category"); ok(r.json.count === 0, "an unknown category returns nothing"); }

// Shape: only public fields, never internal ones
{
  const r = call("/api/search?limit=100"), allowed = new Set(["name", "emoji", "description", "category", "url", "creator_name", "creator_handle", "creator_url", "source_post", "added", "code_url", "score"]);
  const extra = r.json.results.flatMap((b) => Object.keys(b).filter((k) => !allowed.has(k)));
  ok(!extra.length, `results carry only the public fields${extra.length ? " (extra: " + [...new Set(extra)].join(", ") + ")" : ""}`);
  ok(r.json.results.every((b) => !("score" in b)), "no score field without a query");
}
