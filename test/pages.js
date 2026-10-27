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
    st = await go('/@' + other); await p.waitForFunction((k) => location.pathname === '/@' + k && document.readyState === 'complete', { timeout: 10000 }, key).catch(() => {}); d = await info();
    ok(d.path === '/@' + key && d.canonical === 'https://grokbotshelf.com/@' + key && !/not found/i.test(d.title), `/@${other} lands on /@${key}: "${d.title}"`);
    ok(await p.$$eval('.cp-list li', (l) => l.length) === BOTS.filter((x) => ckey(x) === key).length, `/@${key} lists every bot across casings`);
  }

  // the creator's display casing (/@Phil_Holland): the same server-rendered page with status 200, address bar swapped to lowercase;
  // any other casing (/@PHIL_HOLLAND) gets the 404 page, which sends it on to the lowercase URL
  const dispKey = casings.has('phil_holland') ? 'phil_holland' : ([...casings].find(([k, s]) => [...s].some((h) => h !== k)) || [])[0];
  if (dispKey) {
    const key = dispKey, shown = await p.goto(new URL('/@' + key, BASE).href, { waitUntil: 'networkidle0' }).then(() => p.$eval('.bp-head .sub a', (e) => e.textContent.replace(/^@| on X$/g, '')));
    const r = await fetch(new URL('/@' + shown, BASE), { redirect: 'manual' }), body = await r.text();
    ok(r.status === 200 && body.includes(`<link rel="canonical" href="https://grokbotshelf.com/@${key}">`) && !/Page not found/.test(body), `GET /@${shown} (no JS): ${r.status}, server-rendered creator page, canonical /@${key}`);
    st = await go('/@' + shown); d = await info();
    ok(st === 200 && d.path === '/@' + key && d.canonical === 'https://grokbotshelf.com/@' + key && !/not found/i.test(d.title), `/@${shown} in a browser: ${st}, address bar /@${key}, "${d.title}"`);
    st = (await fetch(new URL('/@' + key.toUpperCase(), BASE), { redirect: 'manual' })).status;
    await go('/@' + key.toUpperCase()); await p.waitForFunction((k) => location.pathname === '/@' + k && document.readyState === 'complete', { timeout: 10000 }, key).catch(() => {}); d = await info();
    ok(st === 404 && d.path === '/@' + key && !/not found/i.test(d.title), `/@${key.toUpperCase()}: ${st} then lands on /@${key}: "${d.title}"`);
  }

  // unknown bot: branded 404 with status 404
  st = await go('/bot/does-not-exist'); d = await info();
  ok(st === 404 && d.h1 === 'Page not found' && d.robots === 'noindex', `/bot/does-not-exist: ${st} "${d.h1}"`);
  ok(await p.$eval('#nf-search', (e) => !e.hidden && e.getAttribute('href') === '/?q=does%20not%20exist'), '404 offers a search for the slug words');

  // unknown creator: the 404 page (status 404, noindex) says Creator not found, with a search for the handle and the creator list
  st = await go('/@nobodyhere'); d = await info();
  ok(st === 404 && d.path === '/@nobodyhere' && d.robots === 'noindex' && d.title === 'Creator not found · Grok Bot Shelf' && d.h1 === 'Creator not found', `/@nobodyhere: ${st} "${d.title}" robots=${d.robots}`);
  const nf = await p.evaluate(() => [...document.querySelectorAll('.bp-actions a')].filter((a) => !a.hidden).map((a) => a.textContent + ' ' + a.getAttribute('href')).sort());
  ok(nf.join('|') === 'Browse creators /?sort=creator|Search for @nobodyhere /?q=nobodyhere', 'Creator not found offers a search and the creator list: ' + nf.join(' | '));
  ok(!(await p.$('#results')) && await p.evaluate(() => performance.getEntriesByType('resource').every((r) => !/shelf-data\.json/.test(r.name))), 'no home page or shelf data behind an unknown creator');
  // a mixed-case unknown handle goes to the lowercase URL first
  st = await go('/@NobodyHere'); await p.waitForFunction(() => location.pathname === '/@nobodyhere' && document.readyState === 'complete', { timeout: 10000 }).catch(() => {}); d = await info();
  ok(d.path === '/@nobodyhere' && d.h1 === 'Creator not found', `/@NobodyHere goes to /@nobodyhere: "${d.h1}"`);
  // /u/<handle> is a permanent redirect to /@<handle>
  const ru = await fetch(new URL('/u/thecsguy', BASE), { redirect: 'manual' });
  ok(ru.status === 308 && new URL(ru.headers.get('location'), BASE).pathname === '/@thecsguy', `/u/thecsguy: ${ru.status} to ${ru.headers.get('location')}`);
  st = await go('/u/thecsguy'); d = await info();
  ok((st === 200 || st === 304) && d.path === '/@thecsguy' && d.canonical === 'https://grokbotshelf.com/@thecsguy', `/u/thecsguy lands on the creator page (${st} ${d.path})`);
  // /?q= filters the shelf on load (the home page WebSite JSON-LD advertises it as a SearchAction)
  await go('/?q=archivist');
  const q = await p.evaluate(() => ({ box: (document.querySelector('input[type=search]') || {}).value, names: [...document.querySelectorAll('#results .card h3')].map((h) => h.textContent) }));
  await go('/'); const all = await p.$$eval('#results .card', (c) => c.length);
  ok(q.box === 'archivist' && q.names.length >= 1 && q.names.length < all && q.names.includes('Archivist'), `/?q=archivist filters on load (${q.names.length} cards vs ${all}, box "${q.box}")`);
  ok(errs.length === 0, 'no console errors ' + errs.join(' | '));
  await b.close();
})();
