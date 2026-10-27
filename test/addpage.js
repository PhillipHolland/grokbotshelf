// /add (round 2 #11): the "Add your bot" form on its own light page. Same form and /api/submit behavior as /#add,
// no shelf and no shelf data until you type; every "Add your bot" link points at it, and /#add still works.
// Usage: NODE_PATH=/path/to/node_modules node test/addpage.js [base-url]
const puppeteer = require('puppeteer-core');
const BASE = process.argv[2] || 'http://localhost:8765/';
const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) process.exitCode = 1; };
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
(async () => {
  const bots = (await (await fetch(new URL('shelf-data.json', BASE))).json()).bots;
  const known = bots.find((b) => /^https:\/\/x\.ai\/bot\/[A-Za-z0-9_-]+$/.test(b.url));
  const b = await puppeteer.launch({ executablePath: '/usr/bin/google-chrome', headless: 'new', args: ['--no-sandbox'] });
  const errs = [];
  for (const vp of [{ width: 390, height: 844, isMobile: true, hasTouch: true, deviceScaleFactor: 2 }, { width: 1280, height: 900 }]) {
    const W = vp.width + 'px: ';
    const p = await b.newPage(); await p.setViewport(vp);
    p.on('pageerror', (e) => errs.push(e.message));
    const reqs = []; p.on('request', (r) => reqs.push(r.url()));
    await p.setRequestInterception(true);
    p.on('request', (r) => {
      if (r.isInterceptResolutionHandled()) return;
      if (/\/api\/submit$/.test(r.url())) return r.respond({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, message: 'Thanks! It is in the review queue.' }) });
      r.continue();
    });
    const res = await p.goto(new URL('/add', BASE).href, { waitUntil: 'networkidle0' });
    const d = await p.evaluate(() => ({ h1: document.querySelector('h1').textContent, title: document.title, canon: document.querySelector('link[rel=canonical]').href,
      form: !!document.querySelector('#sub-form #sub-bot'), shelfer: !!document.querySelector('.get-shelfer'), api: (document.getElementById('add-text') || {}).textContent || '',
      results: !!document.getElementById('results'), nodes: document.querySelectorAll('*').length, cur: document.querySelector('.add-top').getAttribute('aria-current'),
      overflow: document.documentElement.scrollWidth > innerWidth }));
    ok([200, 304].includes(res.status()) && d.h1 === 'Add your bot' && d.title === 'Add your bot · Grok Bot Shelf' && d.canon === 'https://grokbotshelf.com/add', W + `/add: ${res.status()} "${d.h1}"`);
    ok(d.form && d.shelfer && /POST/.test(d.api) && /api\/submit/.test(d.api), W + 'same form, Shelfer pill and API text as /#add');
    ok(!d.results && d.nodes < 250 && !d.overflow, W + `light page: no shelf, ${d.nodes} nodes, no sideways scroll`);
    ok(d.cur === 'page', W + 'the header button marks the current page');
    ok(!reqs.some((u) => /shelf-data\.json|\/app\.js/.test(u)), W + 'no shelf data or app.js on load');
    await p.type('#sub-bot', known.url); await wait(1500);
    const dupe = await p.evaluate(() => { const e = document.getElementById('sub-dupe'); const a = e.querySelector('a'); return { text: e.textContent, href: a && a.getAttribute('href') }; });
    ok(/^Already on the shelf/.test(dupe.text) && /^\/bot\/[a-z0-9-]+$/.test(dupe.href || '') && reqs.some((u) => /shelf-data\.json\?v=/.test(u)), W + `typing a listed template finds it (${dupe.text} -> ${dupe.href})`);
    await p.$eval('#sub-bot', (e) => { e.value = ''; }); await p.type('#sub-bot', 'https://x.ai/bot/NotListedYetZZ9'); await p.click('#sub-go'); await wait(800);
    const msg = await p.$eval('#sub-msg', (e) => e.textContent);
    ok(msg === 'Thanks! It is in the review queue.', W + `submit posts to /api/submit and shows the reply ("${msg}")`);
    await p.evaluate(() => localStorage.clear());
    await p.close();
  }
  // every Add link goes to /add
  const p = await b.newPage(); await p.setViewport({ width: 1280, height: 900 });
  for (const path of ['/', '/bot/archivist', '/@thecsguy', '/bot/no-such-bot-zz']) {
    await p.goto(new URL(path, BASE).href, { waitUntil: 'domcontentloaded' });
    const hrefs = await p.evaluate(() => [...document.querySelectorAll('a')].filter((a) => /^Add (your|a) bot$/.test(a.textContent.trim())).map((a) => a.getAttribute('href')));
    ok(hrefs.length >= 1 && hrefs.every((h) => h === '/add'), `${path}: Add links point to /add (${hrefs.join(', ')})`);
  }
  // old /#add links still land on the form
  await p.goto(new URL('/#add', BASE).href, { waitUntil: 'networkidle0' }); await wait(1600);
  const a = await p.evaluate(() => { const r = document.getElementById('add').getBoundingClientRect(); return { top: Math.round(r.top), dock: Math.round(document.getElementById('dock').getBoundingClientRect().bottom) }; });
  ok(a.top >= a.dock && a.top <= a.dock + 40, `/#add still lands on the home form (${JSON.stringify(a)})`);
  ok(errs.length === 0, 'no page errors' + (errs.length ? ': ' + errs.join(' | ') : ''));
  await b.close();
})();
