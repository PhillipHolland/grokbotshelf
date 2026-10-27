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

  // 2. Rail jump to a letter whose group is not built yet lands exactly
  p = await open('/');
  const last = rail0.slice(-2, -1);
  await p.click(`.rail button[data-l="${last}"]`); await settle(1700);
  const land = await p.evaluate((L) => { const h = document.querySelector(`.group h2[data-letter="${L}"]`); if (!h) return null; const pad = document.getElementById('dock').offsetHeight + 12, off = Math.round(h.closest('.group').getBoundingClientRect().top - pad), bottom = scrollY + innerHeight >= document.documentElement.scrollHeight - 2; return { off, bottom }; }, last);
  ok(land && (Math.abs(land.off) <= 2 || land.bottom), `rail jump to ${last} before its group was built lands on it (${JSON.stringify(land)})`);
  await p.close();

  // 3. Deep link to a card in a late group, and "Add your bot"
  const lateSlug = await (async () => { const q = await open('/'); await scrollAll(q); const id = await q.$eval('#results .group:last-of-type .card', (e) => e.id); await q.close(); return id; })();
  p = await open('/#' + lateSlug);
  const dl = await p.evaluate((id) => { const e = document.getElementById(id); if (!e) return null; const r = e.getBoundingClientRect(); return { inView: r.top >= 0 && r.bottom <= innerHeight, flash: e.classList.contains('flash') }; }, lateSlug);
  ok(dl && dl.inView && dl.flash, `deep link #${lateSlug} (last group) scrolls to and highlights it (${JSON.stringify(dl)})`);
  await p.close();
  for (const how of ['click', 'hash']) {
    p = await open(how === 'hash' ? '/#add' : '/');
    if (how === 'click') { await p.click('.add-top'); }
    await settle(1800);
    const a = await p.evaluate(() => { const add = document.getElementById('add'), d = document.getElementById('dock'); return { top: Math.round(add.getBoundingClientRect().top), dock: Math.round(d.getBoundingClientRect().bottom), bottom: scrollY + innerHeight >= document.documentElement.scrollHeight - 2 }; });
    ok(Math.abs(a.top - a.dock - 20) <= 2 || a.bottom, `"Add your bot" (${how}) lands on the form 20px under the dock (scroll padding 12 + margin 8) (${JSON.stringify(a)})`);
    await p.close();
  }

  // 4. Show more: no layout shift, on a first-slice group and on a group built by scrolling
  p = await open('/');
  for (const where of ['first slice', 'scrolled in']) {
    if (where === 'scrolled in') { await p.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight * 0.6)); await settle(600); }
    const key = await p.evaluate(async (where) => {
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

  // 6. Reload / back-forward: everything renders so scroll restoration works
  p = await open('/');
  await p.reload({ waitUntil: 'networkidle0' }); await settle(800);
  ok(await n(p) === full.cards, `a reload builds every card without scrolling (${await n(p)} of ${full.cards})`);
  await p.close();
  ok(errs.length === 0, 'no page errors' + (errs.length ? ': ' + errs.join(' | ') : ''));
  await b.close();
})().catch((e) => { console.error(e); process.exit(1); });
