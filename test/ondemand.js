// Render on demand (audit #2). A first load builds the builders strip and a handful of creator groups; the rest come in
// as you scroll toward them. Flat views (search, Votes, Newest, A-Z) build 48 cards at a time. The count line, the A-Z
// rail, rail jumps, #bot deep links and "Add your bot" behave as if everything were there, Show more causes no layout
// shift, and a reload renders everything so the browser can restore the scroll position.
// Usage: NODE_PATH=/path/to/node_modules node test/ondemand.js [base-url]
const puppeteer = require('puppeteer-core');
const scrollAll = require('./scroll-all');
const BASE = process.argv[2] || 'http://localhost:8765/';
const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) process.exitCode = 1; };
const settle = (ms = 400) => new Promise((r) => setTimeout(r, ms));
(async () => {
  const b = await puppeteer.launch({ executablePath: '/usr/bin/google-chrome', headless: 'new', args: ['--no-sandbox'] });
  const errs = [];
  async function open(path, w = 1280, h = 900) {
    const p = await b.newPage(); p.on('pageerror', (e) => errs.push(e.message));
    await p.setViewport({ width: w, height: h });
    await p.setRequestInterception(true);
    p.on('request', (r) => (/google-analytics|googletagmanager|\/_vercel\/|\/api\//.test(r.url()) ? r.abort() : r.continue()));
    await p.evaluateOnNewDocument(() => {
      window.__cls = 0; window.__shifts = [];
      new PerformanceObserver((l) => { for (const e of l.getEntries()) { window.__shifts.push([Math.round(e.startTime), e.value, e.hadRecentInput]); if (!e.hadRecentInput) window.__cls += e.value; } }).observe({ type: 'layout-shift', buffered: true });
    });
    await p.goto(new URL(path, BASE).href, { waitUntil: 'networkidle0' }); await settle();
    return p;
  }
  const n = (p, s = '#results .card') => p.$$eval(s, (x) => x.length);
  const bots = await (await fetch(new URL('/bots.json', BASE))).json().catch(() => null);

  // 1. First load builds a slice; the count and the rail cover everything
  let p = await open('/');
  const first = { cards: await n(p), groups: await n(p, '#results .group'), count: await p.$eval('#count', (e) => e.textContent), nodes: await p.evaluate(() => document.getElementsByTagName('*').length) };
  const rail0 = await p.$$eval('.rail button:not(.off)', (x) => x.map((e) => e.dataset.l).join(''));
  ok(first.cards < 80 && first.groups < 20, `first load builds a slice: ${first.cards} cards in ${first.groups} groups (${first.nodes} DOM nodes)`);
  ok(/^\d+ bots$/.test(first.count) && parseInt(first.count) >= 519, `the count still covers the whole shelf (${first.count})`);
  await scrollAll(p);
  const full = { cards: await n(p), groups: await n(p, '#results .group') };
  const rail1 = await p.$$eval('.rail button:not(.off)', (x) => x.map((e) => e.dataset.l).join(''));
  ok(full.groups > 100 && full.cards > first.cards * 3, `scrolling down builds the rest: ${full.cards} cards in ${full.groups} groups`);
  ok(rail0 === rail1 && rail0.length > 15, `the A-Z rail shows every letter from the start (${rail0} = ${rail1})`);
  await p.close();

  // 1b. Wheeling past the first slice keeps you where you scrolled: appends must not drag the page down to the footer
  //     (scroll anchoring used to pin the form below #results, which pulled every group in and ended at the bottom)
  for (const w of [1280, 390]) {
    p = await open('/', w, w === 390 ? 844 : 800);
    await p.mouse.move(w / 2, 300); await p.mouse.wheel({ deltaY: 2400 }); await settle(1200);
    const r = await p.evaluate(() => ({ y: Math.round(scrollY), cards: document.querySelectorAll('#results .card').length, inView: [...document.querySelectorAll('#results .card a[href^="/bot/"]')].filter((a) => { const b = a.getBoundingClientRect(); return b.top > 120 && b.bottom < innerHeight - 40 && b.width > 0; }).length }));
    ok(r.y < 3200 && r.inView > 0, `${w}: a 2400px wheel stays at ${r.y}px with ${r.inView} bot links in view (${r.cards} cards built)`);
    await p.close();
  }

  // 2. Rail jump to a letter whose group is not built yet lands exactly
  p = await open('/');
  const last = rail0.slice(-2, -1);
  await p.click(`.rail button[data-l="${last}"]`); await settle(1700);
  const land = await p.evaluate((L) => { const h = document.querySelector(`.group h2[data-letter="${L}"]`); if (!h) return null; const pad = document.getElementById('dock').offsetHeight + 12, off = Math.round(h.closest('.group').getBoundingClientRect().top - pad), bottom = scrollY + innerHeight >= document.documentElement.scrollHeight - 2; return { off, bottom }; }, last);
  ok(land && (Math.abs(land.off) <= 2 || land.bottom), `rail jump to ${last} before its group was built lands on it (${JSON.stringify(land)})`);
  await p.close();
  // ...and builds only up to that letter (plus what the sentinel adds under it), not the whole shelf
  p = await open('/');
  const mid = rail0[Math.floor(rail0.length / 2)];
  await p.click(`.rail button[data-l="${mid}"]`); await settle(1700);
  const midR = await p.evaluate((L) => ({ groups: document.querySelectorAll('#results .group').length, cards: document.querySelectorAll('#results .card').length, has: !!document.querySelector(`.group h2[data-letter="${L}"]`) }), mid);
  ok(midR.has && midR.groups < full.groups && midR.cards < full.cards, `rail jump to ${mid} builds up to its group, not the shelf (${midR.groups} of ${full.groups} groups, ${midR.cards} of ${full.cards} cards)`);
  await p.close();

  // 3. Deep link to a card in a late group, and "Add your bot"
  const lateSlug = await (async () => { const q = await open('/'); await scrollAll(q); const id = await q.$eval('#results .group:last-of-type .card', (e) => e.id); await q.close(); return id; })();
  p = await open('/#' + lateSlug);
  const dl = await p.evaluate((id) => { const e = document.getElementById(id); if (!e) return null; const r = e.getBoundingClientRect(); return { inView: r.top >= 0 && r.bottom <= innerHeight, flash: e.classList.contains('flash') }; }, lateSlug);
  ok(dl && dl.inView && dl.flash, `deep link #${lateSlug} (last group) scrolls to and highlights it (${JSON.stringify(dl)})`);
  await p.close();
  // a deep link to a card halfway down builds up to its group, not the whole shelf
  const midSlug = await (async () => { const q = await open('/'); await scrollAll(q); const id = await q.evaluate(() => { const g = document.querySelectorAll('#results .group'); return g[Math.floor(g.length / 2)].querySelector('.card').id; }); await q.close(); return id; })();
  p = await open('/#' + midSlug); await settle(600);
  const dm = await p.evaluate((id) => { const e = document.getElementById(id); if (!e) return null; const r = e.getBoundingClientRect(); return { inView: r.top >= 0 && r.bottom <= innerHeight, flash: e.classList.contains('flash'), cards: document.querySelectorAll('#results .card').length }; }, midSlug);
  ok(dm && dm.inView && dm.flash && dm.cards < full.cards * 0.8, `deep link #${midSlug} (middle group) lands without building the shelf (${dm && dm.cards} of ${full.cards} cards)`);
  await p.close();
  for (const how of ['hash']) { // the header button now opens /add (test/addpage.js)
    p = await open(how === 'hash' ? '/#add' : '/');
    if (how === 'click') { await p.click('.add-top'); }
    await settle(1800);
    const a = await p.evaluate(() => { const add = document.getElementById('add'), d = document.getElementById('dock'); return { top: Math.round(add.getBoundingClientRect().top), dock: Math.round(d.getBoundingClientRect().bottom), bottom: scrollY + innerHeight >= document.documentElement.scrollHeight - 2 }; });
    ok(Math.abs(a.top - a.dock - 20) <= 2 || a.bottom, `"Add your bot" (${how}) lands on the form 20px under the dock (scroll padding 12 + margin 8) (${JSON.stringify(a)})`);
    // nothing is built above the form while it is on screen; scrolling back up lets the shelf continue
    const c0 = await p.$$eval('#results .card', (c) => c.length); await settle(1000);
    const a2 = await p.evaluate(() => ({ cards: document.querySelectorAll('#results .card').length, top: Math.round(document.getElementById('add').getBoundingClientRect().top) }));
    ok(c0 < full.cards / 2 && a2.cards === c0 && a2.top === a.top, `"Add your bot" (${how}) builds no more cards while the form is on screen (${c0}, then ${a2.cards}; form at ${a.top}, then ${a2.top})`);
    for (let i = 0; i < 6; i++) { await p.evaluate(() => window.scrollBy(0, -innerHeight / 2)); await settle(250); }
    const c2 = await p.$$eval('#results .card', (c) => c.length);
    ok(c2 > c0, `scrolling back up from the form builds more of the shelf (${c0} to ${c2})`);
    await p.close();
  }

  // 4. Show more: no layout shift, on a first-slice group and on a group built by scrolling
  p = await open('/');
  for (const where of ['first slice', 'scrolled in']) {
    if (where === 'scrolled in') { await p.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight * 0.6)); await settle(600); }
    const key = await p.evaluate(async (where) => {
      // The first creator with more than 3 bots is not always in the first slice as the catalog grows: scroll until one is built
      for (let i = 0; where === 'first slice' && i < 40 && !document.querySelector('#results [data-more]'); i++) { window.scrollBy(0, innerHeight); await new Promise((r) => setTimeout(r, 150)); }
      const all = [...document.querySelectorAll('#results [data-more]')];
      const mb = where === 'first slice' ? all[0] : all.find((e) => e.getBoundingClientRect().top > 0);
      if (!mb) return null;
      mb.scrollIntoView({ block: 'center' }); await new Promise((r) => setTimeout(r, 500));
      window.__y0 = mb.closest('.group').getBoundingClientRect().top; window.__c0 = window.__cls;
      return mb.dataset.more;
    }, where);
    let r = null;
    if (key) {
      await p.click(`[data-more="${key}"]`); await settle(1500); // a real click: shifts right after it are the reader's own
      r = await p.evaluate((key) => { const sec = document.querySelector(`[aria-labelledby="g-${key}"]`); return { key, moved: Math.round(sec.getBoundingClientRect().top - window.__y0), cls: +(window.__cls - window.__c0).toFixed(4), cards: sec.querySelectorAll('.card').length }; }, key);
    }
    ok(r && r.moved === 0 && r.cls === 0 && r.cards > 3, `Show more (${where}): 0 CLS and the group stays put (${JSON.stringify(r)})`);
  }
  await p.close();

  // 5. Flat views: 48 at a time
  for (const path of ['/?sort=az', '/?sort=newest', '/?q=k']) {
    p = await open(path);
    const c0 = await n(p), total = parseInt(await p.$eval('#count', (e) => e.textContent));
    await scrollAll(p);
    const c1 = await n(p);
    ok(c0 === Math.min(48, total) && c1 === total, `${path}: builds ${c0} cards, then all ${total} as you scroll (${c1})`);
    await p.close();
  }
  // Keyboard: arrows walk every card (finishTail), Enter from search opens the first
  p = await open('/?sort=az');
  await p.focus('#q'); await p.keyboard.press('ArrowDown'); await settle(200);
  ok(await n(p) === parseInt(await p.$eval('#count', (e) => e.textContent)), 'arrow keys build every card before moving');
  await p.close();

  // Ctrl/Cmd+F (round 2 #9): find-in-page sees every card. The rest is built in idle chunks, the key is not swallowed,
  // and the page does not move.
  for (const [path, want, key] of [['/', () => full.cards, 'Control'], ['/?sort=az', null, 'Meta']]) {
    p = await open(path);
    await p.evaluate(() => { window.__long = 0; new PerformanceObserver((l) => { for (const e of l.getEntries()) window.__long = Math.max(window.__long, e.duration); }).observe({ type: 'longtask' });
      window.__prevented = null; window.addEventListener('keydown', (e) => { if (e.key === 'f') window.__prevented = e.defaultPrevented; }); });
    const total = want ? want() : parseInt(await p.$eval('#count', (e) => e.textContent));
    const c0 = await n(p), y0 = await p.evaluate(() => scrollY);
    await p.keyboard.down(key); await p.keyboard.press('f'); await p.keyboard.up(key);
    const c1 = await n(p);
    let c2 = c1; for (let i = 0; i < 60 && c2 < total; i++) { await settle(200); c2 = await n(p); }
    const r = await p.evaluate(() => ({ long: Math.round(window.__long), prevented: window.__prevented, y: scrollY }));
    ok(c0 < total && c2 === total && r.prevented === false && r.y === y0, `${key}+F on ${path} builds every card (${c0} to ${c2} of ${total}) without preventDefault (${JSON.stringify(r)})`);
    ok(c1 - c0 <= 48 && r.long < 250, `${key}+F on ${path} builds in chunks: ${c1 - c0} cards in the keydown task, longest task ${r.long}ms`);
    await p.close();
  }

  // 6. Reload / back-forward: everything renders so scroll restoration works
  p = await open('/');
  await p.reload({ waitUntil: 'networkidle0' }); await settle(800);
  ok(await n(p) === full.cards, `a reload builds every card without scrolling (${await n(p)} of ${full.cards})`);
  await p.close();
  ok(errs.length === 0, 'no page errors' + (errs.length ? ': ' + errs.join(' | ') : ''));
  await b.close();
})().catch((e) => { console.error(e); process.exit(1); });
