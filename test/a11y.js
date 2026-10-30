// Screen reader and keyboard basics on the home page and a bot page: no vote count is a live region (tallies arriving
// used to read out as ~260 numbers), a vote is announced once through the #toast status region without showing the
// toast, and a "Skip to results" link is the first Tab stop, hidden until focused, landing focus on the results so
// the next Tab is in the results. /api/votes is mocked. Usage: NODE_PATH=/path/to/node_modules node test/a11y.js [base-url]
const puppeteer = require('puppeteer-core');
const scrollAll = require('./scroll-all');
const BASE = process.argv[2] || 'http://localhost:8765/';
const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) process.exitCode = 1; };
const settle = (ms = 400) => new Promise((r) => setTimeout(r, ms));
(async () => {
  const b = await puppeteer.launch({ executablePath: '/usr/bin/google-chrome', headless: 'new', args: ['--no-sandbox'] });
  const errs = [];
  async function open(path) {
    const p = await b.newPage(); p.on('pageerror', (e) => errs.push(e.message));
    await p.setViewport({ width: 1280, height: 900 });
    await p.setRequestInterception(true);
    p.on('request', (req) => {
      const u = req.url();
      if (/google-analytics|googletagmanager|\/_vercel\//.test(u)) return req.abort();
      if (/\/api\/votes/.test(u) && req.method() === 'POST') { const v = JSON.parse(req.postData()).value; return req.respond({ status: 200, contentType: 'application/json', body: JSON.stringify({ global: true, up: 4 + (v === 1), down: 1 + (v === -1), score: 3 + v }) }); }
      if (/\/api\/votes/.test(u)) return req.respond({ status: 200, contentType: 'application/json', body: JSON.stringify({ global: true, scores: { 'bot-coach': { up: 4, down: 1, score: 3 } } }) });
      if (/\/api\//.test(u)) return req.respond({ status: 503, contentType: 'application/json', body: '{}' });
      return req.continue();
    });
    await p.goto(new URL(path, BASE).href, { waitUntil: 'networkidle0' }); await settle();
    await scrollAll(p);
    return p;
  }
  const p = await open('/');
  const live = await p.evaluate(() => ({ vn: document.querySelectorAll('.vn[aria-live]').length, inRes: document.querySelectorAll('#results [aria-live]').length, all: document.querySelectorAll('[aria-live]').length, cards: document.querySelectorAll('#results .card').length }));
  ok(live.cards > 100 && live.vn === 0 && live.inRes === 0, `home: no vote count is a live region (${live.vn} .vn, ${live.inRes} in results, ${live.cards} cards)`);
  ok(live.all <= 6, `home: only the page-level live regions remain (${live.all})`);

  // Skip link
  const hidden = await p.$eval('.skip', (e) => { const r = e.getBoundingClientRect(); return r.bottom <= 0 || getComputedStyle(e).clipPath !== 'none'; });
  ok(hidden, 'skip link is hidden until focused');
  ok(await p.evaluate(() => document.body.firstElementChild.matches('a.skip')), 'skip link is the first element in body');
  await p.keyboard.press('Tab');
  const f = await p.evaluate(() => { const e = document.activeElement, r = e.getBoundingClientRect(); return { skip: e.matches('.skip'), text: e.textContent, vis: r.top >= 0 && r.bottom <= innerHeight && r.width > 60 && getComputedStyle(e).clipPath === 'none' }; });
  ok(f.skip && f.text === 'Skip to results' && f.vis, `first Tab focuses a visible "Skip to results" (${JSON.stringify(f)})`);
  await p.keyboard.press('Enter'); await settle(200);
  const g = await p.evaluate(() => ({ id: document.activeElement.id, hash: location.hash }));
  ok(g.id === 'results' && g.hash === '', `Enter moves focus to the results, no hash in the URL (${JSON.stringify(g)})`);
  await p.keyboard.press('Tab');
  ok(await p.evaluate(() => !!document.activeElement.closest('#results')), 'the next Tab lands on the first card or group in the results');

  // One announcement per vote, toast stays hidden
  await p.$eval('#f-bot-coach .vb.up', (e) => e.click()); await settle(300);
  const t = await p.$eval('#toast', (e) => ({ text: e.textContent, shown: e.classList.contains('show'), role: e.getAttribute('role') }));
  ok(t.role === 'status' && t.text === 'Upvoted Coach, 4 votes' && !t.shown, `a vote is announced once through #toast, not shown (${JSON.stringify(t)})`);
  await p.$eval('#f-bot-coach .vb.up', (e) => e.click()); await settle(300);
  ok(await p.$eval('#toast', (e) => e.textContent) === 'Vote removed from Coach, 3 votes', 'undoing the vote is announced too');
  await p.close();

  const q = await open('/bot/coach/');
  ok(await q.evaluate(() => document.querySelectorAll('.vn[aria-live]').length === 0), 'bot page: the vote count is not a live region');
  await q.$eval('.bp-vote .vb.dn', (e) => e.click()); await settle(300);
  const bt = await q.evaluate(() => { const t = [...document.querySelectorAll('.toast')].pop(); return { text: t.textContent, shown: t.classList.contains('show') }; });
  ok(bt.text === 'Downvoted Coach, 2 votes' && !bt.shown, `bot page: a vote is announced once through the status toast (${JSON.stringify(bt)})`);
  await q.close();
  ok(errs.length === 0, 'no page errors' + (errs.length ? ': ' + errs.join(' | ') : ''));
  await b.close();
})().catch((e) => { console.error(e); process.exit(1); });
