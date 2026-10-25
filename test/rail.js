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
    // Rail buttons never cover a card control (on phones they may reach into a card's empty edge padding)
    const hit = await p.evaluate(() => { const rl = Math.min(...[...document.querySelectorAll('#rail button')].map(b => b.getBoundingClientRect().left)); return { rl, cr: Math.max(...[...document.querySelectorAll('#results .card')].slice(0, 40).flatMap(c => [...c.querySelectorAll('a,button')].map(e => e.getBoundingClientRect().right))) }; });
    ok(hit.rl >= hit.cr, `${label}: rail (x ${Math.round(hit.rl)}) does not cover card controls (right ${Math.round(hit.cr)})`);
    // At the top of the page the dock sits below the hero; no letter may hide behind it
    await p.evaluate(() => scrollTo(0, 0)); await settle(200);
    const t = await p.evaluate(() => ({ a: document.getElementById('rail').getBoundingClientRect().top, d: document.getElementById('dock').getBoundingClientRect().bottom }));
    ok(t.a >= t.d, `${label}: at the top, the rail (y ${Math.round(t.a)}) starts below the dock (${Math.round(t.d)})`);
    // A far jump (top to the last letter) is quick and keeps that letter marked even though its group can't reach the top
    const Z = letters[letters.length - 1], t0 = Date.now();
    if (label === 'phone') await p.tap(`#rail button[data-l="${Z}"]`); else await p.click(`#rail button[data-l="${Z}"]`);
    await p.waitForFunction((Z) => { const g = document.querySelector(`.group h2[data-letter="${Z}"]`).closest('.group'); return document.documentElement.scrollTop + innerHeight >= document.documentElement.scrollHeight - 2 || Math.abs(g.getBoundingClientRect().top - document.getElementById('dock').offsetHeight - 12) < 3; }, { timeout: 3000, polling: 30 }, Z).catch(() => {});
    const ms = Date.now() - t0; await settle(500);
    const zon = await p.$eval('#rail button.on', e => e.dataset.l).catch(() => '');
    ok(ms < 1200 && zon === Z, `${label}: far jump to ${Z} lands in ${ms}ms (< 1200) and keeps ${zon} marked`);
    if (label === 'phone') {
      // Scrub: drag down the rail; a letter bubble follows, the page follows, the bubble goes away after
      await p.evaluate(() => scrollTo(0, 0)); await settle(200);
      const c = await p.target().createCDPSession();
      const r = await p.$eval('#rail', e => { const bs = e.children; return { x: bs[0].getBoundingClientRect().right - 6, a: bs[0].getBoundingClientRect().top, z: bs[bs.length - 1].getBoundingClientRect().bottom }; });
      await c.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: r.x, y: r.a + 4 }] });
      for (let y = r.a + 4; y < r.a + (r.z - r.a) * 0.5; y += 8) { await c.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: r.x, y }] }); await settle(16); }
      await settle(150);
      const s = await p.evaluate(() => { const pop = document.querySelector('.rail-pop'), L = document.querySelector('#rail .on')?.dataset.l, g = document.querySelector(`.group h2[data-letter="${L}"]`)?.closest('.group'); return { shown: !pop.hidden, pl: pop.textContent, L, top: g && g.getBoundingClientRect().top, dock: document.getElementById('dock').offsetHeight }; });
      ok(s.shown && s.pl === s.L && s.L !== letters[0] && Math.abs(s.top - s.dock - 12) < 4, `phone: scrubbing to ${s.L} shows a ${s.pl} bubble and puts that group under the dock (top ${Math.round(s.top)})`);
      await c.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }); await settle(700);
      ok(await p.$eval('.rail-pop', e => e.hidden), 'phone: the letter bubble hides after the finger lifts');
    }
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
  // Reduced motion: the jump is instant
  await p.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'reduce' }]);
  await p.goto(BASE, { waitUntil: 'networkidle0' });
  const L2 = await p.$$eval('#rail button', bs => bs[Math.floor(bs.length / 2)].dataset.l);
  await p.click(`#rail button[data-l="${L2}"]`); await settle(80);
  const rm = await p.evaluate((L) => document.querySelector(`.group h2[data-letter="${L}"]`).closest('.group').getBoundingClientRect().top - document.getElementById('dock').offsetHeight, L2);
  ok(Math.abs(rm - 12) < 4, `reduced motion: jump to ${L2} is instant (offset ${Math.round(rm)} after 80ms)`);
  await p.emulateMediaFeatures([]);
  // Narrowest phones: the rail's padding must not push cards wider than the screen
  await p.setViewport({ width: 320, height: 568, isMobile: true, hasTouch: true });
  await p.goto(BASE, { waitUntil: 'networkidle0' });
  const ov = await p.evaluate(() => [document.documentElement.scrollWidth, innerWidth]);
  ok(ov[0] <= 320 && ov[1] === 320, `320px phone: no sideways overflow (scrollWidth ${ov[0]})`);
  ok(!errs.length, 'no page errors' + (errs.length ? ': ' + errs.join(' | ') : ''));
  await b.close();
})();
