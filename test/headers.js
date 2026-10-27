// Cache, frame and permissions headers (round 2 #6). Resolves vercel.json the way Vercel does (every matching rule
// applies, a later rule wins on the same key) for sample URLs. Given a non-local base URL it also checks the live
// response headers. Usage: node test/headers.js [base-url]
const fs = require('fs'), path = require('path');
const BASE = process.argv[2] || 'http://localhost:8765/';
const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) process.exitCode = 1; };
const cfg = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'vercel.json'), 'utf8'));
const resolve = (url) => {
  const u = new URL(url, 'https://x.test'), out = {};
  for (const r of cfg.headers) {
    const re = new RegExp('^' + r.source.replace(/:(\w+)/g, '[^/]+') + '$');
    if (!re.test(u.pathname)) continue;
    const q = (c) => c.type === 'query' && u.searchParams.has(c.key);
    if ((r.has || []).some((c) => !q(c)) || (r.missing || []).some(q)) continue;
    for (const h of r.headers) out[h.key.toLowerCase()] = h.value;
  }
  return out;
};
const IMM = 'public, max-age=31536000, immutable';
const cases = [
  ['/app.js?v=0123456789', IMM], ['/add.js?v=0123456789', IMM], ['/shelf-up.js?v=0123456789', IMM], ['/bot-page.js?v=0123456789', IMM],
  ['/styles.css?v=0123456789', IMM], ['/shelf-data.json?v=0123456789', IMM], ['/og.png?v=0123456789', IMM],
  ['/avatars/48/x.webp?v=0123456789', IMM],
  ['/app.js', 'public, max-age=300, stale-while-revalidate=86400'], ['/styles.css', 'public, max-age=300, stale-while-revalidate=86400'],
  ['/shelf-up.js', 'public, max-age=300, stale-while-revalidate=86400'], ['/shelf-data.json', 'public, max-age=300, stale-while-revalidate=86400'],
  ['/favicon.svg', 'public, max-age=86400'], ['/badge.svg', 'public, max-age=86400'], ['/apple-touch-icon.png', 'public, max-age=86400'],
  ['/bots.json', 'public, max-age=0, must-revalidate'], ['/feed.xml', 'public, max-age=0, must-revalidate'],
  ['/', undefined], ['/bot/archivist', undefined],
];
for (const [u, want] of cases) { const got = resolve(u)['cache-control']; ok(got === want, `${u} cache: ${got || '(Vercel default)'}`); }
for (const u of ['/', '/bot/archivist', '/@phil_holland', '/badge.svg']) {
  const h = resolve(u);
  ok(h['x-frame-options'] === 'DENY' && h['content-security-policy'] === "frame-ancestors 'none'" && h['permissions-policy'] === 'camera=(), microphone=(), geolocation=()' && h['x-content-type-options'] === 'nosniff' && h['referrer-policy'] === 'strict-origin-when-cross-origin', `${u}: no framing, no camera/mic/location, nosniff and referrer policy kept`);
}
ok(cfg.redirects && cfg.redirects.some((r) => r.source === '/bot/product-catalog-organizer'), 'existing redirects kept');
(async () => {
  if (/localhost|127\.0\.0\.1/.test(BASE)) return;
  const idx = await (await fetch(BASE)).text();
  const live = [...new Set(idx.match(/\/(?:app\.js|styles\.css|shelf-up\.js|shelf-data\.json)\?v=[0-9a-f]+/g) || [])];
  for (const u of [...live, '/favicon.svg', '/']) {
    const r = await fetch(new URL(u, BASE), { method: 'GET' }), h = Object.fromEntries(r.headers);
    const want = resolve(u)['cache-control'];
    ok(r.status === 200 && (!want || h['cache-control'] === want) && h['x-frame-options'] === 'DENY' && /frame-ancestors 'none'/.test(h['content-security-policy'] || '') && h['permissions-policy'] === 'camera=(), microphone=(), geolocation=()', `live ${u}: ${r.status}, ${h['cache-control']}, XFO ${h['x-frame-options']}, ${h['permissions-policy']}`);
  }
})();
