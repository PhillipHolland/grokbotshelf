// Light/dark contrast of the vote score badge and snippet Copy buttons, and 44px tap targets
// under 500px (card app link, crawl links, A-Z rail). /api/votes is mocked in the browser, so nothing is sent anywhere.
// Usage: NODE_PATH=/path/to/node_modules node test/targets.js [base-url]
const puppeteer = require('puppeteer-core');
const BASE = process.argv[2] || 'http://localhost:8765/';
const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) process.exitCode = 1; };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const PHONE_UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1';
// WCAG contrast of an element's text against what is painted behind it (semi-transparent fills composited down to the page)
function contrastOf(el) {
  const rgba = (s) => { const m = s.match(/[\d.]+/g).map(Number); return [m[0], m[1], m[2], m.length > 3 ? m[3] : 1]; };
  const over = (top, bot) => [0, 1, 2].map((i) => top[i] * top[3] + bot[i] * (1 - top[3])).concat(1);
  const layers = []; for (let n = el; n; n = n.parentElement) { const c = rgba(getComputedStyle(n).backgroundColor); if (c[3] > 0) layers.push(c); if (c[3] === 1) break; }
  let bg = [255, 255, 255, 1]; for (const c of layers.reverse()) bg = over(c, bg);
  const fg = over(rgba(getComputedStyle(el).color), bg);
  const L = (c) => { const [r, g, b] = c.slice(0, 3).map((v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
  const [a, b] = [L(fg), L(bg)].sort((x, y) => y - x);
  return +((a + 0.05) / (b + 0.05)).toFixed(2);
}
(async () => {
  const BOTS = await (await fetch(new URL('bots.json', BASE))).json();
  const top = BOTS.slice(0, 3).map((x) => 'bot-' + x.name.toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/&/g, ' and ').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''));
  const b = await puppeteer.launch({ executablePath: '/usr/bin/google-chrome', headless: 'new', args: ['--no-sandbox'] });
  const errs = [];
  async function open(path, { width, theme = 'dark', ua } = {}) {
    const p = await b.newPage();
    p.on('pageerror', (e) => errs.push(e.message));
    if (ua) await p.setUserAgent(ua);
    await p.setViewport({ width, height: width < 500 ? 844 : 900, isMobile: !!ua, hasTouch: !!ua });
    await p.setRequestInterception(true);
    p.on('request', (req) => {
      const u = req.url();
      if (/google-analytics|googletagmanager|\/_vercel\//.test(u)) return req.abort();
      if (/\/api\/votes/.test(u) && req.method() === 'GET') return req.respond({ status: 200, contentType: 'application/json', body: JSON.stringify({ global: true, scores: Object.fromEntries(top.map((s, i) => [s, { up: 5 - i, down: 0, score: 5 - i }])) }) });
      if (/\/api\//.test(u)) return req.respond({ status: 400, contentType: 'application/json', body: '{}' });
      return req.continue();
    });
    await p.evaluateOnNewDocument((t) => { try { localStorage.setItem('shelfer-sheet', '1'); localStorage.setItem('theme', t); } catch (e) {} }, theme);
    await p.goto(new URL(path, BASE).href, { waitUntil: 'networkidle0' }); await sleep(300);
    return p;
  }

  // Contrast: score badge (home Top voted) and snippet Copy (bot page), both themes, AA 4.5:1
  for (const theme of ['light', 'dark']) {
    const p = await open('/', { width: 1280, theme });
    const sc = await p.$$eval('.tlist .sc', (els, f) => els.map((e) => new Function('return ' + f)()(e)), contrastOf.toString());
    ok(sc.length > 0 && sc.every((x) => x >= 4.5), `${theme}: Top voted score badges pass 4.5:1 (${sc.join(', ') || 'none shown'})`);
    await p.close();
    const q = await open('/bot/archivist', { width: 1280, theme });
    const cp = await q.$$eval('.snip-h .clear', (els, f) => els.map((e) => new Function('return ' + f)()(e)), contrastOf.toString());
    ok(cp.length === 2 && cp.every((x) => x >= 4.5), `${theme}: snippet Copy buttons pass 4.5:1 (${cp.join(', ')})`);
    await q.close();
  }

  // Tap targets: 44px under 500px with a phone UA and with a narrow desktop window; desktop sizes unchanged
  for (const ua of [PHONE_UA, null]) {
    const p = await open('/', { width: 390, ua });
    const where = ua ? '390 phone' : '390 narrow window';
    const r = await p.evaluate(async () => {
      const wait = (ms) => new Promise((r) => setTimeout(r, ms));
      const box = (e) => { const r = e.getBoundingClientRect(); return [r.width, r.height]; };
      const app = document.querySelector('#results .card a.app'); app.scrollIntoView({ block: 'center' }); await wait(100);
      const d = document.querySelector('.crawl details'); d.open = true;
      const crawl = [...document.querySelectorAll('.crawl nav a')].map((e) => box(e)[1]);
      scrollTo(0, 3000); await wait(300);
      const rb = [...document.querySelectorAll('.rail button')];
      // Hit area width: how far left of the letter's box a tap still lands on the button (its ::before)
      const hitW = rb.map((e) => { const r = e.getBoundingClientRect(), y = r.top + r.height / 2; let x = r.right - 1; while (x > 0 && e.contains(document.elementFromPoint(x - 1, y))) x--; return Math.round(r.right - x); });
      const hs = rb.map((e) => box(e)[1]);
      const railLeft = Math.min(...rb.map((e) => e.getBoundingClientRect().right)) - Math.min(...hitW);
      const under = [...document.querySelectorAll('#results .card :is(a,button)')].filter((e) => { const r = e.getBoundingClientRect(); return r.bottom > 0 && r.top < innerHeight && r.width && r.right > railLeft; }).length;
      return { app: box(app), crawlMin: Math.min(...crawl), n: rb.length, hitW: Math.min(...hitW), hMin: Math.min(...hs), hMax: Math.max(...hs), stripH: rb[rb.length - 1].getBoundingClientRect().bottom - rb[0].getBoundingClientRect().top, under, overflow: document.documentElement.scrollWidth > innerWidth };
    });
    ok(r.app[0] >= 44 && r.app[1] >= 44, `${where}: card "Add to Bot app" link is at least 44x44 (${r.app.map(Math.round).join('x')})`);
    ok(r.crawlMin >= 44, `${where}: crawl list links are at least 44px tall (${Math.round(r.crawlMin)})`);
    ok(r.n > 1 && r.hitW >= 44, `${where}: A-Z rail letters take a 44px-wide tap (${r.hitW}px, ${r.n} letters)`);
    ok(r.hMin >= Math.min(44, Math.floor(r.stripH / r.n) - 1) && r.hMax <= 44.5, `${where}: rail letters fill the strip up to 44px each (${r.hMin.toFixed(1)}-${r.hMax.toFixed(1)}px)`);
    ok(r.under === 0, `${where}: no card control sits under the rail's tap area`);
    ok(!r.overflow, `${where}: no horizontal overflow`);
    await p.close();
  }
  {
    const p = await open('/', { width: 1280 });
    const r = await p.evaluate(() => { const d = document.querySelector('.crawl details'); d.open = true; const h = (s) => Math.round(document.querySelector(s).getBoundingClientRect().height); const w = (s) => Math.round(document.querySelector(s).getBoundingClientRect().width); return { crawl: h('.crawl nav a'), app: [w('#results .card a.app'), h('#results .card a.app')], rail: w('.rail button') }; });
    // App link is 32x34 on desktop since the one-row card footer (approved card mock, 10/26); phones keep 44px
    ok(r.crawl < 30 && r.app.join('x') === '32x34' && r.rail === 26, `1280: desktop sizes unchanged (crawl link ${r.crawl}px, app link ${r.app.join('x')}, rail ${r.rail}px wide)`);
    await p.close();
  }
  ok(!errs.length, 'no page errors' + (errs.length ? ': ' + errs.slice(0, 3).join(' | ') : ''));
  await b.close();
})().catch((e) => { console.log('FAIL crashed: ' + e.message); process.exit(1); });
