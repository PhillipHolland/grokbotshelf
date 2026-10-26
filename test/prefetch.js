// Prefetch of bot and creator pages: Speculation Rules in Chrome, <link rel=prefetch> on hover elsewhere.
// Starts its own copy of test/serve.js so it can see each request and its Sec-Purpose header.
// Usage: node test/prefetch.js   (the base-url argument from test/run.js is ignored)
const puppeteer = require('puppeteer-core'), http = require('http');
const { handler } = require('./serve');
const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) process.exitCode = 1; };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const seen = []; let slow = 0;
const server = http.createServer((req, res) => {
  const purpose = req.headers['sec-purpose'] || '';
  if (purpose) seen.push({ host: req.headers.host, url: req.url, purpose });
  if (slow && purpose) setTimeout(() => handler(req, res), slow); else handler(req, res);
});
(async () => {
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const port = server.address().port, BASE = `http://localhost:${port}`, OTHER = `http://127.0.0.1:${port}`;
  const b = await puppeteer.launch({ executablePath: '/usr/bin/google-chrome', headless: 'new', args: ['--no-sandbox'] });
  const errs = [];
  async function open(path, { saveData, effectiveType, noRules } = {}) {
    const p = await b.newPage();
    p.on('pageerror', (e) => errs.push(e.message));
    await p.setViewport({ width: 1280, height: 900 });
    await p.evaluateOnNewDocument((sd, et, nr) => {
      if (sd !== undefined || et) Object.defineProperty(navigator, 'connection', { get: () => ({ saveData: !!sd, effectiveType: et || '4g' }) });
      if (nr) { const s = HTMLScriptElement.supports; HTMLScriptElement.supports = (t) => t !== 'speculationrules' && s.call(HTMLScriptElement, t); }
    }, saveData, effectiveType, noRules);
    await p.goto(BASE + path, { waitUntil: 'networkidle0' });
    // Links the shelf never prints, to prove they are out of scope: a query string, /api, another origin, an outbound link
    await p.evaluate((other) => {
      const box = document.createElement('div'); box.id = 'pf-test'; box.style.cssText = 'position:fixed;left:0;top:0;z-index:99999;background:#fff';
      box.innerHTML = ['/bot/archivist?x=1', '/@phil_holland?y=2', '/api/votes', other + '/bot/archivist', 'https://x.ai/bot/abc'].map((h, i) => `<a id="pf${i}" href="${h}" style="display:block;padding:4px">t${i}</a>`).join('');
      document.body.appendChild(box);
    }, OTHER);
    return p;
  }
  const hover = async (p, sel) => { await p.hover(sel); await sleep(500); await p.mouse.move(1270, 890); await sleep(100); };
  const got = (path, host = `localhost:${port}`) => seen.filter((s) => s.url === path && s.host === host).length;
  const outOfScope = async (p, label) => {
    const before = seen.length;
    for (let i = 0; i < 5; i++) await hover(p, '#pf' + i);
    ok(seen.length === before, `${label}: no prefetch for query-string, /api, other-origin or outbound links (${seen.slice(before).map((s) => s.url).join(', ') || 'none'})`);
  };

  // Chrome: Speculation Rules, prefetch only
  let p = await open('/');
  const rules = await p.$$eval('script[type=speculationrules]', (s) => s.map((x) => JSON.parse(x.textContent)));
  ok(rules.length === 1 && rules[0].prefetch && !rules[0].prerender && rules[0].prefetch[0].eagerness === 'moderate', 'home adds one speculationrules script: prefetch only, moderate');
  const card = await p.$eval('#results .card h3 a', (a) => a.getAttribute('href'));
  ok(got(card) === 0, 'nothing is prefetched before a hover');
  await hover(p, `#results .card h3 a[href="${card}"]`);
  ok(got(card) === 1 && seen.find((s) => s.url === card).purpose.startsWith('prefetch') && !/prerender/.test(seen.find((s) => s.url === card).purpose), `hovering a card title prefetches ${card} (Sec-Purpose: ${(seen.find((s) => s.url === card) || {}).purpose})`);
  await outOfScope(p, 'speculation rules');
  await p.close();
  p = await open('/bot/archivist');
  const more = await p.$eval('.bp-more a[href^="/bot/"]', (a) => a.getAttribute('href'));
  await hover(p, `.bp-more a[href="${more}"]`);
  await hover(p, '.bp-head .sub a[href^="/@"]');
  ok(got(more) === 1 && got('/@phil_holland') === 1, `bot page prefetches a related bot (${more}) and the creator page on hover`);
  await p.close();
  p = await open('/@phil_holland');
  const cb = await p.$eval('.cp-list a', (a) => a.getAttribute('href'));
  await hover(p, `.cp-list a[href="${cb}"]`);
  ok(got(cb) >= 1, `creator page prefetches a bot on hover (${cb})`);
  await p.close();

  // Save-Data and 2g: no rules, no hover prefetch
  for (const [label, o] of [['Save-Data', { saveData: true }], ['2g', { effectiveType: '2g' }], ['slow-2g', { effectiveType: 'slow-2g' }]]) {
    p = await open('/bot/archivist', o);
    const n = await p.$$eval('script[type=speculationrules]', (s) => s.length), before = seen.length;
    await hover(p, '.bp-more a[href^="/bot/"]');
    ok(n === 0 && seen.length === before, `${label}: no speculation rules and no prefetch`);
    await p.close();
  }

  // Browsers without Speculation Rules: <link rel=prefetch> on hover, same scope, each URL once, at most 2 in flight
  p = await open('/@phil_holland', { noRules: true });
  const links = await p.$$eval('.cp-list a', (a) => a.slice(0, 4).map((x) => x.getAttribute('href')));
  ok((await p.$$eval('script[type=speculationrules]', (s) => s.length)) === 0, 'fallback: no speculationrules script when unsupported');
  const once = got(links[0]);
  await hover(p, `.cp-list a[href="${links[0]}"]`); await sleep(300);
  await hover(p, `.cp-list a[href="${links[0]}"]`); await sleep(300);
  ok(got(links[0]) - once === 1, `fallback: hover prefetches ${links[0]} once, a second hover does not repeat it`);
  await outOfScope(p, 'fallback');
  slow = 3000; const before = seen.length;
  for (const h of links.slice(1)) await hover(p, `.cp-list a[href="${h}"]`);
  ok(seen.length - before === 2, `fallback: at most 2 prefetches in flight (${seen.length - before} of 3 hovered while slow)`);
  await sleep(3500); slow = 0;
  await hover(p, `.cp-list a[href="${links[3]}"]`); await sleep(300);
  ok(got(links[3]) === 1, 'fallback: a link skipped while busy is prefetched on a later hover');
  const tp = await b.newPage(); await tp.emulate(puppeteer.KnownDevices['iPhone 13']);
  await tp.evaluateOnNewDocument(() => { const s = HTMLScriptElement.supports; HTMLScriptElement.supports = (t) => t !== 'speculationrules' && s.call(HTMLScriptElement, t); });
  await tp.goto(BASE + '/bot/archivist', { waitUntil: 'networkidle0' });
  const t1 = await tp.$eval('.bp-more a[href^="/bot/"]', (a) => a.getAttribute('href'));
  await tp.$eval('.bp-more a[href^="/bot/"]', (a) => a.scrollIntoView());
  const box = await (await tp.$('.bp-more a[href^="/bot/"]')).boundingBox();
  const t0 = got(t1);
  await tp.touchscreen.touchStart(box.x + 5, box.y + 5); await sleep(400); await tp.touchscreen.touchEnd().catch(() => {});
  ok(got(t1) - t0 === 1, `fallback: touchstart prefetches ${t1}`);
  const heads = await p.$$eval('link[rel=prefetch]', (l) => l.every((x) => x.parentNode === document.head));
  ok(heads, 'fallback: prefetch links go in <head>, nothing is added to the page body');
  await b.close(); server.close();
  ok(!errs.length, 'no page errors' + (errs.length ? ': ' + errs.join(' | ') : ''));
})().catch((e) => { console.log('FAIL crashed: ' + e.stack); process.exitCode = 1; server.close(); process.exit(1); });
