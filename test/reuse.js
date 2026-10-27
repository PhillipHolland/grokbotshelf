// Re-rendering reuses card nodes: sort, filter, Show more and Reset move the same <article> elements instead of
// rebuilding them, keep order and markup identical to a fresh load of the same URL, repaint vote state on cards
// that were off the page, and paint the pressed control before the cards re-render.
// Usage: NODE_PATH=/path/to/node_modules node test/reuse.js [base-url]
const puppeteer = require('puppeteer-core');
const scrollAll = require('./scroll-all');
const BASE = process.argv[2] || 'http://localhost:8765/';
const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) process.exitCode = 1; };
const settle = (ms = 300) => new Promise((r) => setTimeout(r, ms));
(async () => {
  const b = await puppeteer.launch({ executablePath: '/usr/bin/google-chrome', headless: 'new', args: ['--no-sandbox'] });
  const errs = [];
  async function page() {
    const p = await b.newPage();
    p.on('pageerror', (e) => errs.push(e.message));
    await p.setViewport({ width: 1280, height: 900 });
    await p.setRequestInterception(true);
    p.on('request', (req) => {
      const u = req.url();
      if (/google-analytics|googletagmanager|\/_vercel\//.test(u)) return req.abort();
      if (/\/api\//.test(u)) return req.respond({ status: 503, contentType: 'application/json', body: '{}' }); // no database: local votes
      return req.continue();
    });
    return p;
  }
  // Every card on the page, in order, with its markup (minus transient classes)
  const snap = (p) => p.evaluate(() => [...document.querySelectorAll('#results .card')].map((c) => [c.id, c.outerHTML.replace(/ class="card[^"]*"/, '')]));
  // Tag every current card node so a later check can tell reused nodes from rebuilt ones
  const tag = (p, k) => p.evaluate((k) => { window[k] = new Map([...document.querySelectorAll('#results .card')].map((c) => [c.id, c])); return window[k].size; }, k);
  const same = (p, k) => p.evaluate((k) => { let s = 0, n = 0; for (const c of document.querySelectorAll('#results .card')) { const o = window[k].get(c.id); if (o) { n++; if (o === c) s++; } } return [s, n]; }, k);
  const fresh = async (path) => { const q = await page(); await q.goto(new URL(path, BASE).href, { waitUntil: 'networkidle0' }); await settle(); await scrollAll(q); const s = await snap(q); await q.close(); return s; };
  const path = (p) => { const u = new URL(p.url()); return u.pathname + u.search; };
  const sameAsFresh = async (p, what) => {
    await scrollAll(p); const a = await snap(p), f = await fresh(path(p));
    const firstDiff = a.findIndex((x, i) => !f[i] || x[0] !== f[i][0] || x[1] !== f[i][1]);
    ok(a.length === f.length && firstDiff < 0, `${what}: same ${a.length} cards, order and markup as a fresh load of ${path(p)}` + (firstDiff >= 0 ? ` (first difference at #${firstDiff}: ${a[firstDiff] && a[firstDiff][0]} vs ${f[firstDiff] && f[firstDiff][0]})` : ''));
  };

  const p = await page();
  await p.goto(BASE, { waitUntil: 'networkidle0' }); await settle();
  await scrollAll(p);
  const n0 = await tag(p, '__home');
  ok(n0 > 50, `home has ${n0} cards`);

  // Paint first: the toggle shows pressed inside the click; the cards re-render after the next frame
  const t = await p.evaluate(() => { const c = document.querySelectorAll('#results .card').length, f = document.querySelector('#fresh'); f.click(); return { pressed: f.getAttribute('aria-pressed'), reset: document.querySelector('#reset').classList.contains('on'), same: document.querySelectorAll('#results .card').length === c }; });
  ok(t.pressed === 'true' && t.reset && t.same, `"New this week" is pressed and Reset shows before the cards re-render (${JSON.stringify(t)})`);
  await settle();
  ok(/new=1/.test(path(p)), 'new=1 is in the URL');
  await p.click('#fresh'); await settle();
  let [s, n] = await same(p, '__home');
  ok(n === n0 && s === n, `toggling back reuses every card node (${s} of ${n})`);

  // Sort: newest (flat list) then back to featured
  await p.focus('#sort'); await p.select('#sort', 'newest'); await settle();
  [s, n] = await same(p, '__home');
  ok(n > 0 && s === n, `sort Newest reuses the cards already built (${s} of ${n})`);
  await sameAsFresh(p, 'sort Newest');
  ok(await p.evaluate(() => document.activeElement && document.activeElement.id === 'sort'), 'focus stays on the sort menu');
  // Vote on a card while its "From the builders" twin is off the page, then come back
  const fid = await p.evaluate(() => (window.__home && [...window.__home.keys()].find((k) => k.startsWith('f-'))) || '');
  const gid = fid.slice(2);
  await p.$eval(`#${gid} .vb.up`, (e) => e.click()); await settle();
  await p.select('#sort', 'featured'); await settle();
  [s, n] = await same(p, '__home');
  ok(n === n0 && s === n, `back to Featured: every card is the original node (${s} of ${n})`);
  ok(await p.$eval(`#${fid} .vb.up`, (e) => e.getAttribute('aria-pressed')) === 'true', `the off-page builders card ${fid} shows the vote cast while it was hidden`);
  await sameAsFresh(p, 'back to Featured after a vote');
  await p.$eval(`#${fid} .vb.up`, (e) => e.click()); await settle(); // undo the vote

  // Filter by category
  const cat = await p.$eval('#cats', (e) => e.options[1].value);
  await p.select('#cats', cat); await settle();
  [s, n] = await same(p, '__home');
  ok(s === n, `category filter reuses the cards already built (${s} of ${n})`);
  await sameAsFresh(p, `filter ${cat}`);
  ok(await p.$eval('#cats', (e) => e.value) === cat && (await p.$$eval('#cats option', (o) => o.length)) > 2, 'category menu keeps its options and shows the choice');

  // Reset puts back the original nodes
  await p.click('#reset'); await settle();
  [s, n] = await same(p, '__home');
  ok(n === n0 && s === n && path(p) === '/', `Reset: original ${n0} nodes, clean URL (${s} of ${n}, ${path(p)})`);

  // Show more: cards above stay put (same nodes), new ones append, focus goes to the first new card
  await tag(p, '__before');
  const key = await p.$eval('#results button.more', (e) => e.dataset.more);
  const k0 = await p.$$eval(`[aria-labelledby="g-${key}"] .card`, (c) => c.length);
  await p.click(`[data-more="${key}"]`); await settle();
  [s, n] = await same(p, '__before');
  const fx = await p.evaluate((key, k0) => { const cs = document.querySelectorAll(`[aria-labelledby="g-${key}"] .card`); return { n: cs.length, focus: document.activeElement === cs[k0] }; }, key, k0);
  ok(n === n0 && s === n, `Show more keeps every card that was on the page (${s} of ${n})`);
  ok(fx.n > k0 && fx.focus, `Show more adds ${fx.n - k0} cards to ${key} and focuses the first new one`);
  ok(path(p) === `/?more=${key}`, `URL is ${path(p)}`);
  await sameAsFresh(p, 'after Show more');

  ok(!errs.length, 'no page errors' + (errs.length ? ': ' + errs.slice(0, 3).join(' | ') : ''));
  await b.close();
})().catch((e) => { console.log('FAIL crashed: ' + e.message); process.exit(1); });
