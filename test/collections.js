// Round 4 #5: collections (bot-meta.json "collections": ["Family"]) are a tag, not a category. Round 5: each collection
// that has bots, then One job, is an option at the end of the category select under a "Collections" label (no pills).
// The select is single choice: Family, One job or a category replaces the others. URLs stay ?collection=family,
// ?one_job=1 and ?cat=, so old links still open; an old link with several keeps the collection, else One job.
// Cards and bot pages show the badge, and a collection-only entry does not count as "tagged by the shelf".
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
  const settle = () => new Promise((x) => setTimeout(x, 400));
  // The "Collections" group at the end of #cats: [label, [[value, text], ...]], or null
  const group = (p) => p.$eval('#cats', (s) => { const g = s.querySelector('optgroup'); return g && [g.label, [...g.children].map((o) => [o.value, o.textContent]), s.lastElementChild === g]; });
  const state = (p) => p.evaluate(() => ({ url: location.search, value: document.querySelector('#cats').value, count: document.querySelector('#count').textContent, on: document.querySelector('#cats').classList.contains('on'), reset: document.querySelector('#reset').classList.contains('on') }));

  // 1. The live catalog: an option for each collection that has bots, then One job (when any bot is marked one_job)
  const data = await (await fetch(new URL('/shelf-data.json', BASE))).json();
  const live = [...new Set(data.bots.flatMap((x) => x.collections || []))].sort();
  const oneJobs = data.bots.filter((x) => x.meta && x.meta.one_job === true).length;
  const want = [...live.map((c) => ['__coll:' + slugify(c), c]), ...(oneJobs ? [['__onejob', 'One job']] : [])];
  const home = await open(BASE, '/');
  const g0 = await group(home);
  ok(want.length ? g0 && g0[0] === 'Collections' && g0[2] && JSON.stringify(g0[1]) === JSON.stringify(want) : !g0, `this catalog: the category select ends with Collections [${want.map((x) => x[1]).join(', ') || 'none'}] (${JSON.stringify(g0)})`);
  ok(await home.evaluate(() => !document.querySelector('#onejob') && !document.querySelector('[data-coll]') && document.querySelectorAll('.filterbar button.chip').length === 1 && !!document.querySelector('.filterbar #fresh')), 'the One job and collection pills are gone; New this week stays');
  if (oneJobs) {
    await home.select('#cats', '__onejob'); await settle();
    const o = await state(home);
    ok(o.url === '?one_job=1' && o.value === '__onejob' && o.on && o.count === `${oneJobs} bots`, `One job filters to the ${oneJobs} bots marked one_job (${JSON.stringify(o)})`);
  }
  const noneCover = await home.evaluate(async () => { const s = document.querySelector('#cats'); s.value = '__onejob'; s.dispatchEvent(new Event('change')); await new Promise((r) => setTimeout(r, 300)); return document.querySelector('#cover').textContent; });
  await home.close();
  const o1 = await open(BASE, '/?one_job=1');
  ok(oneJobs ? (await state(o1)).value === '__onejob' && (await state(o1)).count === `${oneJobs} bots` : true, 'an old /?one_job=1 link opens with One job picked');
  await o1.close();

  // 2. A copy with three Family bots: one already tagged by the shelf, two with no other meta
  const bots = data.bots, withMeta = bots.find((x) => x.meta), plain = bots.filter((x) => !x.meta).slice(0, 2), fam = [withMeta, ...plain];
  const cat = withMeta.category, inCat = bots.filter((x) => x.category === cat).length;
  const site = await tempSite(({ J, W }) => { const m = J('bot-meta.json'); for (const e of Object.values(m.bots)) delete e.collections; for (const x of fam) { const id = templateId(x.url); m.bots[id] = { ...(m.bots[id] || { name: x.name }), collections: ['Family'] }; } W('bot-meta.json', m); });
  try {
    for (const w of [1280, 390]) {
      const p = await open(site.base, '/', { w });
      const g = await group(p);
      ok(g && g[0] === 'Collections' && g[1][0][0] === '__coll:family' && g[1][0][1] === 'Family' && (!oneJobs || g[1][1][0] === '__onejob'), `${w}: Family is in the Collections group, before One job (${JSON.stringify(g && g[1])})`);
      const r = await p.evaluate(() => { const fb = document.querySelector('.filterbar'), s = document.querySelector('#cats'), kids = [...fb.children].filter((e) => e.offsetParent);
        return { tops: new Set(kids.map((e) => Math.round(e.getBoundingClientRect().top))).size, h: s.getBoundingClientRect().height }; });
      ok(w < 700 ? r.h >= 44 : r.tops === 1, `${w}: ${w < 700 ? `44px select (${r.h})` : 'the filter row is one row'}`);
      ok(await p.evaluate(() => window.__cls) === 0, `${w}: CLS 0 on load`);
      await p.select('#cats', cat); await settle();
      await p.select('#cats', '__coll:family'); await settle();
      const f = await state(p), badges = await p.$$eval('#results .card', (cs) => cs.map((c) => [...c.querySelectorAll('.badge.coll')].map((x) => x.textContent).join()));
      ok(f.url === '?collection=family' && f.value === '__coll:family' && f.count === '3 bots' && f.on && f.reset && badges.length === 3 && badges.every((x) => x === 'Family'), `${w}: Family replaces the category and shows the 3 Family bots, each with a badge (${JSON.stringify(f)})`);
      if (oneJobs) {
        await p.select('#cats', '__onejob'); await settle();
        const o = await state(p);
        ok(o.url === '?one_job=1' && o.value === '__onejob', `${w}: One job replaces Family (${o.url})`);
      }
      await p.select('#cats', cat); await settle();
      const c = await state(p);
      ok(c.url === `?cat=${slugify(cat)}` && c.value === cat && c.count === `${inCat} bots`, `${w}: a category replaces them (${JSON.stringify(c)})`);
      await p.select('#cats', '__coll:family'); await settle();
      await p.click('#reset'); await settle();
      ok(await p.evaluate(() => location.search === '' && document.querySelector('#cats').value === ''), `${w}: Reset clears it`);
      await p.close();
    }
    const d = await open(site.base, '/?collection=family');
    ok((await state(d)).count === '3 bots' && (await state(d)).value === '__coll:family', 'an old /?collection=family link opens with Family picked');
    const cover = await d.evaluate(async () => { const s = document.querySelector('#cats'); s.value = '__onejob'; s.dispatchEvent(new Event('change')); await new Promise((r) => setTimeout(r, 300)); return document.querySelector('#cover').textContent; });
    ok(cover === noneCover, `collection-only entries do not raise the "tagged by the shelf" count (${cover.match(/Only \d+ of \d+/)})`);
    await d.close();
    const both = await open(site.base, `/?cat=${slugify(cat)}&collection=family&one_job=1`);
    const bs = await state(both);
    ok(bs.value === '__coll:family' && bs.count === '3 bots', `an old link with several keeps the collection (${JSON.stringify(bs)})`);
    await both.close();
    if (oneJobs) {
      const oc = await open(site.base, `/?cat=${slugify(cat)}&one_job=1`);
      ok((await state(oc)).value === '__onejob' && (await state(oc)).count === `${oneJobs} bots`, 'an old link with a category and One job keeps One job');
      await oc.close();
    }
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
