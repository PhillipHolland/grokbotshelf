// Perf round 6 #2: a re-render (filter, sort, Reset, Show more, Esc) builds on demand like the first load: the groups
// up to the one on screen go in at once, the rest when the reader scrolls toward them. What is on screen does not move,
// a rail jump still builds to its letter, and reading down the page still reaches every card.
// Usage: NODE_PATH=/path/to/node_modules node test/filterchunk.js [base-url]
const puppeteer = require('puppeteer-core');
const scrollAll = require('./scroll-all');
const BASE = process.argv[2] || 'http://localhost:8765/';
const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) process.exitCode = 1; };
const painted = (p) => p.evaluate(() => new Promise((r) => requestAnimationFrame(() => setTimeout(() => requestAnimationFrame(() => setTimeout(r, 0)), 0))));
const settle = (ms = 300) => new Promise((r) => setTimeout(r, ms));
(async () => {
  const b = await puppeteer.launch({ executablePath: process.env.CHROME || '/usr/bin/google-chrome', headless: 'new', args: ['--no-sandbox'] });
  const errs = [];
  for (const [label, vp] of [['desktop', { width: 1280, height: 900 }], ['phone', { width: 390, height: 844, isMobile: true, hasTouch: true, deviceScaleFactor: 2 }]]) {
    const p = await b.newPage(); p.on('pageerror', (e) => errs.push(e.message));
    await p.setViewport(vp);
    await p.setRequestInterception(true);
    p.on('request', (r) => /google-analytics|googletagmanager|\/_vercel\/|\/api\//.test(r.url()) ? r.abort() : r.continue());
    await p.goto(BASE, { waitUntil: 'networkidle0' });
    await scrollAll(p);
    const G = await p.$$eval('#results .group', (g) => g.length), C = await p.$$eval('#results .card', (c) => c.length);
    ok(G > 100, `${label}: reading down the home page builds all ${G} groups (${C} cards)`);
    // Reset after a filter, at the top: a few groups at once, the rest pending (html.tailing), and timed
    const cat = await p.$eval('#cats', (e) => e.options[1].value);
    await p.select('#cats', cat); await painted(p);
    await p.evaluate(() => { window.__lt = 0; new PerformanceObserver((l) => l.getEntries().forEach((e) => { window.__lt = Math.max(window.__lt, e.duration); })).observe({ type: 'longtask' }); });
    await p.click('#reset'); await painted(p);
    const r = await p.evaluate(() => ({ g: document.querySelectorAll('#results .group').length, tailing: document.documentElement.classList.contains('tailing'), lt: window.__lt, count: document.querySelector('#count').textContent }));
    ok(r.g >= 3 && r.g < G / 4 && r.tailing, `${label}: Reset builds ${r.g} of ${G} groups at once, the rest on demand (longest task ${Math.round(r.lt)}ms, count "${r.count}")`);
    await scrollAll(p);
    ok(await p.$$eval('#results .card', (c) => c.length) === C && await p.$$eval('#results .group', (g) => g.length) === G, `${label}: reading down after Reset reaches every group and card again`);
    // Deep in the page: a filter toggled on and off keeps the reader's place (same group, same spot, same scrollY).
    // The place is the group under the dock. When the filter drops that group (no bot of it is new this week), the
    // reader is looking at the next group the filter kept, and that is the one the reverse toggle has to keep.
    // Start a sixth of the way down: "New this week" keeps about half the page, and a reader past everything it
    // keeps has no place to keep (the page then starts over at the top, built on demand).
    await p.evaluate(() => { const gs = document.querySelectorAll('#results .group'); gs[Math.floor(gs.length / 6)].scrollIntoView(); window.scrollBy(0, -40); });
    await settle(300);
    const mark = () => p.evaluate(() => { const dock = document.getElementById('dock').getBoundingClientRect().bottom; const g = [...document.querySelectorAll('#results .group')].find((x) => x.getBoundingClientRect().bottom > dock + 40); return g ? { id: g.getAttribute('aria-labelledby'), top: g.getBoundingClientRect().top, y: scrollY } : null; });
    const m0 = await mark();
    await p.evaluate(() => { window.__cls = 0; new PerformanceObserver((l) => l.getEntries().forEach((e) => { if (!e.hadRecentInput) window.__cls += e.value; })).observe({ type: 'layout-shift' }); });
    await p.click('#fresh'); await painted(p);
    // (a filter that leaves no group under the dock, the reader past the last kept group, has no place to keep)
    const mOn = await mark(), kept = await p.$(`[aria-labelledby="${m0.id}"]`) ? m0 : mOn;
    await p.click('#fresh'); await painted(p); await settle(200);
    const m1 = await mark(), g1 = await p.$$eval('#results .group', (g) => g.length);
    // (a filter that empties most of the page can't keep the exact spot; before round 6 this landed far up the page)
    const r1 = kept ? await p.$eval(`[aria-labelledby="${kept.id}"]`, (g) => { const r = g.getBoundingClientRect(); return { top: r.top, on: r.bottom > 0 && r.top < innerHeight }; }) : null;
    ok(!kept || r1.on, kept ? `${label}: mid-page, "New this week" on and off keeps ${kept.id.slice(2)} on screen (${Math.round(kept.top)}px, now ${Math.round(r1.top)}px${kept === m0 ? '' : `; the filter dropped ${m0.id.slice(2)}`})` : `${label}: mid-page, "New this week" left no group under the dock (${m0.id.slice(2)} dropped), nothing to keep`);
    ok(g1 < G, `${label}: that re-render built ${g1} of ${G} groups (through the one on screen, plus what comes into range)`);
    // Show more on a group in the middle of the page: focus goes to its first new card, the page does not jump
    await p.evaluate(() => { const bs = [...document.querySelectorAll('#results button.more')]; const x = bs[Math.floor(bs.length / 2)]; x.scrollIntoView({ block: 'center' }); });
    await settle(300);
    const key = await p.evaluate(() => { const bs = [...document.querySelectorAll('#results button.more')].filter((x) => { const r = x.getBoundingClientRect(); return r.top > 100 && r.bottom < innerHeight; }); return bs[0] && bs[0].dataset.more; });
    if (key) {
      const t0 = await p.$eval(`[aria-labelledby="g-${key}"]`, (e) => e.getBoundingClientRect().top), k0 = await p.$$eval(`[aria-labelledby="g-${key}"] .card`, (c) => c.length);
      await p.click(`[data-more="${key}"]`); await painted(p); await settle(200);
      const s = await p.evaluate((key, k0) => { const g = document.querySelector(`[aria-labelledby="g-${key}"]`), cs = g.querySelectorAll('.card'); return { top: g.getBoundingClientRect().top, n: cs.length, focus: document.activeElement === cs[k0] }; }, key, k0);
      ok(s.n > k0 && s.focus && Math.abs(s.top - t0) < 1, `${label}: Show more mid-page on ${key} adds ${s.n - k0} cards, focuses the first new one, the group stays at ${Math.round(t0)}px (now ${s.top.toFixed(1)}px, focus on the new card: ${s.focus})`);
    } else ok(true, `${label}: no Show more on screen mid-page to check`);
    const cls = await p.evaluate(() => window.__cls);
    // Budget 0.01, not 0: about one run in two, half a second after Show more, the groups under it settle 15px lower (a
    // single new row sizing to its content, 0.0065 at 1280px). That was there before round 7 and is a hundredth of the
    // 0.1 that counts as good; the re-renders themselves must still add nothing.
    ok(cls < 0.01, `${label}: no layout shift from those re-renders (CLS ${cls.toFixed(4)})`);
    // Back at the top after Reset, a rail tap on the last letter builds through its group and lands it under the dock
    await p.evaluate(() => scrollTo(0, 0)); await settle(300); await p.select('#cats', cat); await painted(p); await p.click('#reset'); await painted(p); await settle(300);
    const letters = await p.$$eval('#rail button:not(.off)', (bs) => bs.map((x) => x.dataset.l)), L = letters[Math.floor(letters.length * 0.8)];
    const before = await p.$$eval('#results .group', (g) => g.length);
    if (label === 'phone') await p.tap(`#rail button[data-l="${L}"]`); else await p.click(`#rail button[data-l="${L}"]`);
    let last = -1; for (let i = 0; i < 40; i++) { await settle(150); const y = await p.evaluate(() => scrollY); if (y === last) break; last = y; }
    const j = await p.evaluate((L) => { const h = document.querySelector(`.group h2[data-letter="${L}"]`); return h ? { top: h.closest('.group').getBoundingClientRect().top - document.getElementById('dock').offsetHeight, g: document.querySelectorAll('#results .group').length } : null; }, L);
    ok(before < G && j && Math.abs(j.top - 12) < 2, `${label}: after Reset (${before} groups built), the rail jump to ${L} builds to it (${j && j.g} groups) and lands it under the dock (offset ${j && Math.round(j.top - 12)}px)`);
    await p.close();
  }
  ok(!errs.length, 'no page errors' + (errs.length ? ': ' + errs.join(' | ') : ''));
  await b.close();
})();
