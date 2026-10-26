// Smoke test for the static pages: a bot page, a creator page, other-casing creator links, the 404 page,
// and an unknown creator. Usage: node test/pages.js [base-url]   (default http://localhost:8765/)
const puppeteer = require('puppeteer-core');
const BASE = process.argv[2] || 'http://localhost:8765/';
const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) process.exitCode = 1; };
const ckey = (x) => x.creator_handle.replace(/^@/, '').toLowerCase();
(async () => {
  const BOTS = await (await fetch(new URL('bots.json', BASE))).json();
  const b = await puppeteer.launch({ executablePath: '/usr/bin/google-chrome', headless: 'new', args: ['--no-sandbox'] });
  const p = await b.newPage();
  // /api/* and /_vercel/* only exist on Vercel, so the local server 404s them; any other failed request counts as an error
  const errs = []; p.on('pageerror', e => errs.push(e.message));
  p.on('console', m => m.type() === 'error' && !/^Failed to load resource/.test(m.text()) && errs.push(m.text()));
  p.on('response', r => r.status() >= 400 && !/\/(api|_vercel)\//.test(r.url()) && !(r.status() === 404 && r.request().isNavigationRequest()) && errs.push(r.status() + ' ' + r.url()));
  await p.setViewport({ width: 1280, height: 900 });
  const go = async (path) => { const r = await p.goto(new URL(path, BASE).href, { waitUntil: 'networkidle0' }); return r.status(); };
  const info = () => p.evaluate(() => ({ path: location.pathname, h1: (document.querySelector('h1') || {}).textContent, title: document.title,
    canonical: (document.querySelector('link[rel=canonical]') || {}).href || '', robots: (document.querySelector('meta[name=robots]') || {}).content || '',
    og: (document.querySelector('meta[property="og:image"]') || {}).content || '' }));

  // bot page
  const arch = BOTS.find((x) => x.name === 'Archivist');
  let st = await go('/bot/archivist'), d = await info();
  ok(st === 200 && d.h1 === 'Archivist' && d.canonical === 'https://grokbotshelf.com/bot/archivist', `bot page /bot/archivist: ${st} "${d.h1}"`);
  ok(/^https:\/\/grokbotshelf\.com\/og\/bot\/archivist\.png\?v=[0-9a-f]{10}$/.test(d.og), 'bot page has its own share image: ' + d.og);
  ok(await p.$eval('.bp-actions .get', (e) => e.href) === arch.url, 'Get this bot links to the template');
  ok(await p.$eval('.bp-head .sub a', (e) => new URL(e.href).pathname) === '/@' + ckey(arch), 'creator link uses the lowercase creator page');

  // creator page
  const nick = BOTS.filter((x) => ckey(x) === 'thecsguy');
  st = await go('/@thecsguy'); d = await info();
  ok(st === 200 && d.canonical === 'https://grokbotshelf.com/@thecsguy' && /\/og\/creator\/thecsguy\.png\?v=[0-9a-f]{10}$/.test(d.og), `creator page /@thecsguy: ${st} "${d.h1}"`);
  ok(await p.$$eval('.cp-list li', (l) => l.length) === nick.length, `creator page lists ${nick.length} bots`);

  // a creator whose handle appears in more than one casing in bots.json, if any: one page at the lowercase URL
  const casings = new Map(); for (const x of BOTS) { const k = ckey(x); casings.set(k, new Set([...(casings.get(k) || []), x.creator_handle.replace(/^@/, '')])); }
  const multi = [...casings].find(([, s]) => s.size > 1) || [...casings].find(([k, s]) => [...s][0] !== k);
  if (multi) {
    const [key, set] = multi, other = [...set].find((h) => h !== key) || key.toUpperCase();
    st = await go('/@' + other); d = await info();
    ok(d.path === '/@' + key && d.canonical === 'https://grokbotshelf.com/@' + key && !/not found/i.test(d.title), `/@${other} lands on /@${key}: "${d.title}"`);
    ok(await p.$$eval('.cp-list li', (l) => l.length) === BOTS.filter((x) => ckey(x) === key).length, `/@${key} lists every bot across casings`);
  }

  // unknown bot: branded 404 with status 404
  st = await go('/bot/does-not-exist'); d = await info();
  ok(st === 404 && d.h1 === 'Page not found' && d.robots === 'noindex', `/bot/does-not-exist: ${st} "${d.h1}"`);
  ok(await p.$eval('#nf-search', (e) => !e.hidden && e.getAttribute('href') === '/?q=does%20not%20exist'), '404 offers a search for the slug words');

  // unknown creator: home page (rewrite) says Creator not found and is noindex
  st = await go('/@nobodyhere'); d = await info();
  ok(d.path === '/@nobodyhere' && d.robots === 'noindex' && /Creator not found/.test(d.title), `/@nobodyhere: ${st} "${d.title}" robots=${d.robots}`);
  ok(await p.$eval('.notfound .empty-t', (e) => e.textContent) === 'Creator not found', 'Creator not found message shows');
  // /?q= filters the shelf on load (the home page WebSite JSON-LD advertises it as a SearchAction)
  await go('/?q=archivist');
  const q = await p.evaluate(() => ({ box: (document.querySelector('input[type=search]') || {}).value, names: [...document.querySelectorAll('#results .card h3')].map((h) => h.textContent) }));
  await go('/'); const all = await p.$$eval('#results .card', (c) => c.length);
  ok(q.box === 'archivist' && q.names.length >= 1 && q.names.length < all && q.names.includes('Archivist'), `/?q=archivist filters on load (${q.names.length} cards vs ${all}, box "${q.box}")`);
  ok(errs.length === 0, 'no console errors ' + errs.join(' | '));
  await b.close();
})();
