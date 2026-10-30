// Round 4 #5: collections (bot-meta.json "collections": ["Family"]) are a tag, not a category. A collection gets a
// filter chip only while it has bots; the chip filters the shelf (?collection=family), cards and bot pages show the
// badge, and a collection-only entry does not count as "tagged by the shelf" in the coverage note.
// Usage: NODE_PATH=/path/to/node_modules node test/collections.js [base-url]
const puppeteer = require('puppeteer-core'), tempSite = require('./tempsite');
const { templateId, slugify } = require('../scripts/shelf');
const BASE = process.argv[2] || 'http://localhost:8765/';
const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) process.exitCode = 1; };
const UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1';
(async () => {
  const b = await puppeteer.launch({ executablePath: '/usr/bin/google-chrome', headless: 'new', args: ['--no-sandbox'] });
  const errs = [];
  async function open(base, path, { w = 1280 } = {}) {
    const p = await b.newPage(); p.on('pageerror', (e) => errs.push(e.message));
    p.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errs.push('console: ' + m.text()); });
    const mob = w < 700;
    await p.setViewport({ width: w, height: mob ? 844 : 900, isMobile: mob, hasTouch: mob });
    if (mob) await p.setUserAgent(UA);
    await p.evaluateOnNewDocument(() => { window.__cls = 0; new PerformanceObserver((l) => l.getEntries().forEach((e) => { if (!e.hadRecentInput) window.__cls += e.value; })).observe({ type: 'layout-shift', buffered: true }); });
    await p.setRequestInterception(true);
    p.on('request', (r) => (/google-analytics|googletagmanager|\/_vercel\/|\/api\//.test(r.url()) ? r.abort() : r.continue()));
    await p.goto(new URL(path, base).href, { waitUntil: 'networkidle0' });
    return p;
  }
  const chips = (p) => p.$$eval('.filterbar [data-coll]', (e) => e.filter((x) => !x.hidden && x.offsetParent).map((x) => x.textContent));

  // 1. The live catalog: a chip exactly for each collection that has bots (none at all is fine)
  const data = await (await fetch(new URL('/shelf-data.json', BASE))).json();
  const live = [...new Set(data.bots.flatMap((x) => x.collections || []))].sort();
  const home = await open(BASE, '/');
  ok(JSON.stringify(await chips(home)) === JSON.stringify(live), `this catalog: chips [${live.join(', ') || 'none'}] match the collections that have bots`);
  const noneCover = await home.evaluate(async () => { document.querySelector('#onejob').click(); await new Promise((r) => setTimeout(r, 300)); return document.querySelector('#cover').textContent; });
  await home.close();

  // 2. A copy with three Family bots: one already tagged by the shelf, two with no other meta
  const bots = data.bots, withMeta = bots.find((x) => x.meta), plain = bots.filter((x) => !x.meta).slice(0, 2), fam = [withMeta, ...plain];
  const site = await tempSite(({ J, W }) => { const m = J('bot-meta.json'); for (const x of fam) { const id = templateId(x.url); m.bots[id] = { ...(m.bots[id] || { name: x.name }), collections: ['Family'] }; } W('bot-meta.json', m); });
  try {
    for (const w of [1280, 390]) {
      const p = await open(site.base, '/', { w });
      const r = await p.evaluate(() => { const c = document.querySelector('.filterbar [data-coll="family"]'), one = document.querySelector('#onejob'), fb = document.querySelector('.filterbar');
        return c && { prev: c.previousElementSibling && c.previousElementSibling.id, h: c.getBoundingClientRect().height, rows: Math.round(fb.getBoundingClientRect().height / one.getBoundingClientRect().height), pressed: c.getAttribute('aria-pressed') }; });
      ok(r && r.prev === 'onejob' && r.pressed === 'false', `${w}: Family chip right after One job (${JSON.stringify(r)})`);
      ok(w < 700 ? r.h >= 44 : r.rows === 1, `${w}: ${w < 700 ? `44px tap target (${r.h})` : 'the filter row is still one row'}`);
      ok(await p.evaluate(() => window.__cls) === 0, `${w}: CLS 0 on load with the chip`);
      await p.click('.filterbar [data-coll="family"]'); await new Promise((x) => setTimeout(x, 400));
      const f = await p.evaluate(() => ({ url: location.search, count: document.querySelector('#count').textContent, pressed: document.querySelector('[data-coll="family"]').getAttribute('aria-pressed'), reset: document.querySelector('#reset').classList.contains('on'),
        badges: [...document.querySelectorAll('#results .card')].map((c) => [...c.querySelectorAll('.badge.coll')].map((x) => x.textContent).join()) }));
      ok(f.url === '?collection=family' && f.count === '3 bots' && f.pressed === 'true' && f.reset && f.badges.length === 3 && f.badges.every((x) => x === 'Family'), `${w}: the chip filters to the 3 Family bots, each with a Family badge (${JSON.stringify(f)})`);
      await p.click('#reset'); await new Promise((x) => setTimeout(x, 400));
      ok(await p.evaluate(() => location.search === '' && document.querySelector('[data-coll="family"]').getAttribute('aria-pressed') === 'false'), `${w}: Reset clears it`);
      await p.close();
    }
    const d = await open(site.base, '/?collection=family');
    ok(await d.$eval('#count', (e) => e.textContent) === '3 bots', 'a /?collection=family link opens filtered');
    const cover = await d.evaluate(async () => { document.querySelector('#onejob').click(); await new Promise((r) => setTimeout(r, 300)); return document.querySelector('#cover').textContent; });
    ok(cover === noneCover, `collection-only entries do not raise the "tagged by the shelf" count (${cover.match(/Only \d+ of \d+/)})`);
    await d.close();
    const bp = await open(site.base, '/bot/' + slugify(plain[0].name));
    const bb = await bp.$$eval('.bp .badges a.badge.coll', (e) => e.map((x) => [x.textContent, x.getAttribute('href')]));
    ok(bb.length === 1 && bb[0][0] === 'Family' && bb[0][1] === '/?collection=family', `bot page: Family badge links to the collection (${JSON.stringify(bb)})`);
    await bp.close();
    // A filter for a collection with no bots is dropped
    const g = await open(site.base, '/?collection=games');
    ok(await g.evaluate(() => location.search === '' && /^\d+ bots$/.test(document.querySelector('#count').textContent)), 'an unknown ?collection= is ignored');
    await g.close();
  } finally { site.close(); }
  ok(!errs.length, `no page or console errors (${errs.slice(0, 3).join(' | ')})`);
  await b.close();
})().catch((e) => { console.error(e); process.exit(1); });
