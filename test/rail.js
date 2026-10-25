// A-Z rail: letters only for visible creator groups, a tap scrolls that group's header just under the dock,
// it follows filters and hides on flat views, and Creator sort keeps the larger cap.
// Usage: NODE_PATH=/path/to/node_modules node test/rail.js [base-url]
const puppeteer = require('puppeteer-core');
const BASE = process.argv[2] || 'http://localhost:8765/';
const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) process.exitCode = 1; };
const settle = (ms = 300) => new Promise(r => setTimeout(r, ms));
const letterOf = (n) => { const ch = n.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/^[^\p{L}\p{N}]+/u, '').charAt(0).toUpperCase(); return /[A-Z]/.test(ch) ? ch : '#'; };
(async () => {
  const BOTS = await (await fetch(new URL('bots.json', BASE))).json();
  const want = [...new Set(BOTS.map((b) => b.creator_name))].sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' })).map(letterOf).filter((l, i, a) => a.indexOf(l) === i);
  const b = await puppeteer.launch({ executablePath: '/usr/bin/google-chrome', headless: 'new', args: ['--no-sandbox'] });
  const errs = [];
  for (const [label, vp] of [['desktop', { width: 1360, height: 900 }], ['phone', { width: 390, height: 844, isMobile: true, hasTouch: true, deviceScaleFactor: 2 }]]) {
    const p = await b.newPage(); p.on('pageerror', e => errs.push(e.message));
    await p.setViewport(vp);
    await p.goto(BASE, { waitUntil: 'networkidle0' });
    const letters = await p.$$eval('#rail button', bs => bs.map(x => x.textContent));
    ok(letters.join('') === want.join(''), `${label}: rail shows ${letters.join('')}`);
    const L = letters[Math.floor(letters.length * 0.7)];
    if (label === 'phone') await p.tap(`#rail button[data-l="${L}"]`); else await p.click(`#rail button[data-l="${L}"]`);
    let last = -1; for (let i = 0; i < 40; i++) { await settle(150); const y = await p.evaluate(() => scrollY); if (y === last) break; last = y; }
    const r = await p.evaluate((L) => { const h = document.querySelector(`.group h2[data-letter="${L}"]`), g = h.closest('.group'); return { top: g.getBoundingClientRect().top, dock: document.getElementById('dock').offsetHeight, cur: document.querySelector('#rail button.on')?.dataset.l }; }, L);
    ok(r.top >= r.dock - 2 && r.top <= r.dock + 30, `${label}: tapping ${L} puts its first group just under the dock (top ${Math.round(r.top)}, dock ${r.dock}) and marks ${r.cur}`);
    const rail = await p.$eval('#rail', e => e.getBoundingClientRect().toJSON());
    const card = await p.$eval('#results .card', e => e.getBoundingClientRect().toJSON());
    ok(rail.left >= card.right - 1, `${label}: rail (x ${Math.round(rail.left)}) does not overlap cards (right ${Math.round(card.right)})`);
    await p.close();
  }
  const p = await b.newPage(); p.on('pageerror', e => errs.push(e.message));
  await p.setViewport({ width: 1360, height: 900 });
  await p.goto(BASE, { waitUntil: 'networkidle0' });
  await p.select('#cats', await p.$$eval('#cats option', o => o[1].value)); await settle();
  const fl = await p.$$eval('#rail button', bs => bs.map(x => x.textContent));
  const gl = await p.$$eval('.group h2[data-letter]', hs => [...new Set(hs.map(h => h.dataset.letter))]);
  ok(fl.length > 1 ? fl.join() === gl.join() : await p.$eval('#rail', e => e.hidden), `category filter: rail matches the visible groups (${fl.join('')})`);
  await p.goto(BASE + '?sort=newest', { waitUntil: 'networkidle0' });
  ok(await p.$eval('#rail', e => e.hidden), 'Newest (flat) view hides the rail');
  await p.goto(BASE + '?sort=creator', { waitUntil: 'networkidle0' });
  const big = await p.$$eval('.group', gs => gs.filter(g => g.querySelector('[data-more]')).map(g => g.querySelectorAll('.card').length));
  ok(big.length && big.every(n => n === 12) && !(await p.$eval('#rail', e => e.hidden)), `Creator sort keeps 12 per group (${big}) and the rail`);
  ok(!errs.length, 'no page errors' + (errs.length ? ': ' + errs.join(' | ') : ''));
  await b.close();
})();
