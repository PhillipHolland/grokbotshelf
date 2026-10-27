// Tiny static server that mimics the Vercel setup in vercel.json closely enough for the tests:
// cleanUrls, directory index.html, redirects (308/307), rewrites if any (only when no file matches,
// like Vercel's filesystem-first routing), and public/404.html with status 404.
// Usage: node test/serve.js [port]   (default 8765)
const http = require("http"), fs = require("fs"), path = require("path");
const PUB = path.join(__dirname, "..", "public");
const cfg = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "vercel.json"), "utf8"));
const TYPES = { ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".css": "text/css", ".json": "application/json", ".svg": "image/svg+xml",
  ".png": "image/png", ".webp": "image/webp", ".xml": "application/xml", ".txt": "text/plain; charset=utf-8", ".ico": "image/x-icon" };
const file = (rel) => { const f = path.join(PUB, rel); if (!f.startsWith(PUB)) return null; try { return fs.statSync(f).isFile() ? f : null; } catch { return null; } };
const resolve = (p) => file(p) || file(p + ".html") || file(path.join(p, "index.html"));
const rewrites = (cfg.rewrites || []).map((r) => ({ re: new RegExp("^" + r.source.replace(/:\w+/g, "[^/]+") + "/?$"), to: r.destination }));
const redirects = (cfg.redirects || []).map((r) => ({ re: new RegExp("^" + r.source.replace(/:(\w+)/g, "(?<$1>[^/]+)") + "/?$"), to: r.destination, code: r.permanent ? 308 : 307 }));
function handler(req, res) {
  let p; try { p = decodeURIComponent(new URL(req.url, "http://x").pathname); } catch { p = "/"; }
  for (const r of redirects) { const m = r.re.exec(p); if (m) { res.writeHead(r.code, { Location: r.to.replace(/:(\w+)/g, (_, k) => (m.groups || {})[k] || "") + new URL(req.url, "http://x").search }); return res.end(); } }
  let f = p.startsWith("/api/") ? null : resolve(p), status = 200;
  if (!f) { const r = rewrites.find((r) => r.re.test(p)); if (r) f = resolve(r.to); }
  if (!f) { f = file("404.html"); status = 404; }
  if (!f) { res.writeHead(404); return res.end("not found"); }
  res.writeHead(status, { "Content-Type": TYPES[path.extname(f)] || "application/octet-stream" });
  fs.createReadStream(f).pipe(res);
}
if (require.main === module) { const port = +process.argv[2] || 8765; http.createServer(handler).listen(port, () => console.log("serving public/ on http://localhost:" + port)); }
module.exports = { handler };
