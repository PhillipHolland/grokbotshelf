// Vote painting: once tallies arrive every vote widget shows its bot's score in one pass (no per-slug page query
// per widget), both copies of a bot (From the builders + its creator group) agree, and a single vote repaints both.
// /api/votes is mocked in the browser, so nothing is sent anywhere.
// Usage: NODE_PATH=/path/to/node_modules node test/votepaint.js [base-url]
const puppeteer = require('puppeteer-core');
const BASE = process.argv[2] || 'http://localhost:8765/';
const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) process.exitCode = 1; };
const settle = (ms = 300) => new Promise((r) => setTimeout(r, ms));
const fold = (s) => String(s).toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '');
const slug = (s) => fold(s).replace(/&/g, ' and ').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
(async () => {
  const BOTS = await (await fetch(new URL('bots.json', BASE))).json();
  // Every other bot gets a distinct tally; the rest have none
  const scores = {}; BOTS.forEach((x, i) => { if (i % 2 === 0) scores['bot-' + slug(x.name)] = { up: (i % 7) + 1, down: i % 3, score: (i % 7) + 1 - (i % 3) }; });
  const b = await puppeteer.launch({ executablePath: '/usr/bin/google-chrome', headless: 'new', args: ['--no-sandbox'] });
  const errs = [];
  const p = await b.newPage(); p.on('pageerror', (e) => errs.push(e.message));
  await p.setViewport({ width: 1280, height: 900 });
  await p.setRequestInterception(true);
  p.on('request', async (req) => {
    const u = req.url();
    if (/google-analytics|googletagmanager|\/_vercel\//.test(u)) return req.abort();
    if (!/\/api\/votes/.test(u)) return req.continue();
    if (req.method() === 'GET') { await settle(600); return req.respond({ status: 200, contentType: 'application/json', body: JSON.stringify({ global: true, scores }) }); }
    const { slug: s, value } = JSON.parse(req.postData() || '{}'), o = scores[s] || { up: 0, down: 0, score: 0 };
    return req.respond({ status: 200, contentType: 'application/json', body: JSON.stringify({ global: true, up: o.up + (value === 1), down: o.down + (value === -1), score: o.score + value }) });
  });
  // Count page-wide per-slug vote lookups (the O(n²) pattern) while tallies are painted
  await p.evaluateOnNewDocument(() => {
    window.__slugQ = 0; const qsa = Element.prototype.querySelectorAll;
    Element.prototype.querySelectorAll = function (s) { if (/\.vote\[data-vote=/.test(s)) window.__slugQ++; return qsa.call(this, s); };
  });
  await p.goto(BASE, { waitUntil: 'networkidle0' }); await settle(800);
  const r = await p.evaluate((scores) => {
    const els = [...document.querySelectorAll('#results .vote')]; let bad = [];
    for (const el of els) { const s = scores[el.dataset.vote], n = el.querySelector('.vn').textContent; const want = s ? String(s.score) : ['', '0']; if (Array.isArray(want) ? !want.includes(n) : n !== want) bad.push(el.dataset.vote + '=' + n); }
    return { n: els.length, bad: bad.slice(0, 5), nbad: bad.length, q: window.__slugQ };
  }, scores);
  ok(r.n > 100 && r.nbad === 0, `all ${r.n} vote widgets show their tally after load (${r.nbad} wrong${r.bad.length ? ': ' + r.bad.join(', ') : ''})`);
  ok(r.q === 0, `painting tallies does no per-slug page query (${r.q} .vote[data-vote=…] lookups)`);
  // A bot shown twice (From the builders + its group): both copies agree, and one vote repaints both
  const id = await p.evaluate(() => { for (const f of document.querySelectorAll('#results .builders .card')) { const k = f.id.replace(/^f-/, ''); if (document.getElementById(k)) return k; } return ''; });
  ok(!!id, `a From the builders card also shows in its creator group (${id})`);
  if (id) {
    const read = () => p.evaluate((id) => [...document.querySelectorAll(`#results .vote[data-vote="${id}"]`)].map((el) => el.querySelector('.vn').textContent + '|' + el.querySelector('.up').getAttribute('aria-pressed')), id);
    const before = await read();
    ok(before.length === 2 && before[0] === before[1], `both copies of ${id} agree before a vote (${before.join(', ')})`);
    await p.evaluate((id) => document.querySelector(`#f-${id} .vote .up`).click(), id); await settle(500);
    const after = await read();
    ok(after.length === 2 && after[0] === after[1] && /\|true$/.test(after[0]) && after[0] !== before[0], `one upvote repaints both copies (${after.join(', ')})`);
  }
  ok(errs.length === 0, `no page errors (${errs.join(' | ')})`);
  await b.close();
})().catch((e) => { console.error(e); process.exit(1); });
