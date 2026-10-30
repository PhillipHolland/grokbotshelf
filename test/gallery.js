// Round 4 #7: List / Gallery view on the home page. The choice is kept in localStorage (gbs_view) only, never in the URL.
// Gallery tiles are each bot's share card (a lazy 480x252 WebP drawn by scripts/og.js, the full card for 2x screens)
// with a fixed 1200:630 box, so images never shift the page; a bot without a card gets an emoji tile that says
// "No share card yet". Usage: NODE_PATH=/path/to/node_modules node test/gallery.js [base-url]
const fs = require('fs'), path = require('path');
const puppeteer = require('puppeteer-core'), tempSite = require('./tempsite');
const BASE = process.argv[2] || 'http://localhost:8765/';
const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) process.exitCode = 1; };
const UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1';
const wait = (ms) => new Promise((x) => setTimeout(x, ms));
(async () => {
  const b = await puppeteer.launch({ executablePath: '/usr/bin/google-chrome', headless: 'new', args: ['--no-sandbox'] });
  const errs = [];
  async function open(base, p0, { w = 1280, ctx = b, votes = null, reqs = [] } = {}) {
    const p = await ctx.newPage(); p.on('pageerror', (e) => errs.push(e.message));
    p.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errs.push('console: ' + m.text()); });
    p.on('response', (r) => { if (r.status() === 404 && /\/og\//.test(r.url())) errs.push('404 ' + r.url()); });
    const mob = w < 700;
    await p.setViewport({ width: w, height: mob ? 844 : 900, isMobile: mob, hasTouch: mob });
    if (mob) await p.setUserAgent(UA);
    await p.evaluateOnNewDocument(() => { window.__cls = 0; new PerformanceObserver((l) => l.getEntries().forEach((e) => { if (!e.hadRecentInput) window.__cls += e.value; })).observe({ type: 'layout-shift', buffered: true }); });
    await p.setRequestInterception(true);
    p.on('request', (r) => {
      if (/\/og\/(thumb|bot)\//.test(r.url())) reqs.push(r.url());
      if (/\/api\/votes/.test(r.url()) && r.method() === 'GET' && votes) return r.respond({ status: 200, contentType: 'application/json', body: JSON.stringify(votes) });
      return /google-analytics|googletagmanager|\/_vercel\/|\/api\//.test(r.url()) ? r.abort() : r.continue();
    });
    await p.goto(new URL(p0, base).href, { waitUntil: 'networkidle0' });
    return p;
  }
  const data = await (await fetch(new URL('/shelf-data.json', BASE))).json();
  const slugs = data.bots.map((x) => 'bot-' + x.name.toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/&/g, ' and ').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''));
  ok(data.bots.length === 710, `710 bots in shelf-data (${data.bots.length})`);
  const withCard = data.bots.filter((x) => x.og).length;
  ok(withCard === data.bots.length, `every bot has a share card thumbnail (${withCard} of ${data.bots.length})`);
  const scores = { [slugs[0]]: { up: 9, down: 2, score: 7 }, [slugs[1]]: { up: 1, down: 3, score: -2 } };
  for (const w of [1280, 390]) {
    const ctx = await b.createBrowserContext(), reqs = [];
    const p = await open(BASE, '/', { w, ctx, votes: { global: true, scores }, reqs });
    const l = await p.evaluate(() => ({ pressed: [...document.querySelectorAll('[data-view]')].map((x) => x.dataset.view + ':' + x.getAttribute('aria-pressed')).join(), cards: document.querySelectorAll('#results .card').length,
      group: document.querySelector('.view').getAttribute('role') + '/' + document.querySelector('.view').getAttribute('aria-label'), h: document.querySelector('[data-view="gallery"]').getBoundingClientRect().height }));
    ok(l.pressed === 'list:true,gallery:false' && l.cards > 0 && l.group === 'group/View' && (w < 700 ? l.h >= 40 : l.h >= 28), `${w}: list is the default (${l.pressed}), a labelled View group, ${l.h}px buttons`);
    await p.click('[data-view="gallery"]'); await wait(500);
    const g = await p.evaluate(() => { const t = [...document.querySelectorAll('#results .gtile')], im = t.map((x) => x.querySelector('img')).filter(Boolean), gi = t[0].querySelector('.gi').getBoundingClientRect();
      return { url: location.href, ls: localStorage.getItem('gbs_view'), tiles: t.length, cards: document.querySelectorAll('#results .card, #results .topvotes, #results .group').length, rail: document.documentElement.classList.contains('has-rail'),
        lazy: im.every((i) => i.loading === 'lazy' && i.getAttribute('width') === '480' && i.getAttribute('height') === '252' && i.alt === '' && /\/og\/thumb\/[a-z0-9-]+\.webp\?v=[0-9a-f]+$/.test(i.getAttribute('src'))),
        ratio: Math.abs(gi.width / gi.height - 1200 / 630) < 0.02, cols: getComputedStyle(document.querySelector('.gal')).gridTemplateColumns.split(' ').length,
        names: t.slice(0, 3).map((x) => x.querySelector('.t').textContent), href: t[0].getAttribute('href'),
        sc: t.slice(0, 3).map((x) => x.querySelector('.sc').textContent + '|' + x.querySelector('.sc').dataset.tip), pressed: document.querySelector('[data-view="gallery"]').getAttribute('aria-pressed') }; });
    ok(g.tiles === 48 && g.cards === 0 && !g.rail && g.pressed === 'true', `${w}: Gallery shows 48 tiles first, no cards, strips or A-Z rail`);
    ok(g.lazy && g.ratio && g.cols === (w < 700 ? 2 : 3), `${w}: thumbnails lazy with width/height set, a 1200:630 box, ${g.cols} columns`);
    ok(g.names[0] === data.bots[0].name && g.href === '/' + slugs[0].replace(/^bot-/, 'bot/'), `${w}: tiles in shelf order, linking to the bot page (${g.names.join(', ')})`);
    ok(g.sc[0] === '7 votes, 9 up, 2 down|9 up · 2 down' && g.sc[1] === '-2 votes, 1 up, 3 down|1 up · 3 down' && g.sc[2] === '0 votes|No votes yet', `${w}: tile scores are the shared tally with the up/down split (${g.sc.join(' / ')})`);
    ok(g.ls === 'gallery' && !/view|gallery/.test(g.url), `${w}: the choice is in localStorage only (${g.ls}), not the URL (${g.url})`);
    const before = reqs.length;
    ok(before > 0 && before < 48, `${w}: only tiles near the screen load images (${before} of 48)`);
    // read down the page a screen at a time (a programmatic jump to the very bottom moves Phil's #all crawl list on
    // master too, in every flat view, so it is not what this checks)
    for (let i = 0; i < 400 && (await p.evaluate(() => document.querySelectorAll('#results .gtile').length < 710 || scrollY + innerHeight < document.documentElement.scrollHeight - 2)); i++) { await p.evaluate(() => window.scrollBy(0, innerHeight * 0.9)); await wait(50); }
    await wait(800);
    const end = await p.evaluate(() => ({ tiles: document.querySelectorAll('#results .gtile').length, cls: window.__cls, broken: [...document.querySelectorAll('.gtile img')].filter((i) => i.complete && !i.naturalWidth).length }));
    ok(end.tiles === 710 && end.cls === 0 && end.broken === 0, `${w}: scrolling down adds the rest (${end.tiles} tiles), CLS ${end.cls}, ${end.broken} broken images`);
    await p.select('#roles', 'coach'); await wait(400);
    const f = await p.evaluate(() => ({ tiles: document.querySelectorAll('#results .gtile').length, count: document.querySelector('#count').textContent }));
    ok(f.tiles === 44 && f.count === '44 bots that say \u201ccoach\u201d', `${w}: filters work in the gallery (${f.count}, ${f.tiles} tiles)`);
    await p.click('#reset'); await wait(300); await p.close();
    const r = await open(BASE, '/', { w, ctx });
    const rr = await r.evaluate(() => ({ tiles: document.querySelectorAll('#results .gtile').length, pressed: document.querySelector('[data-view="gallery"]').getAttribute('aria-pressed'), cls: window.__cls }));
    ok(rr.tiles === 48 && rr.pressed === 'true' && rr.cls === 0, `${w}: a reload remembers Gallery (${rr.tiles} tiles), CLS ${rr.cls}`);
    // A shared #bot- link lands on the card: the list for this visit, the saved choice stays
    const h = await open(BASE, '/#' + slugs[300], { w, ctx }); await wait(500);
    const hh = await h.evaluate((id) => ({ card: !!document.getElementById(id), tiles: document.querySelectorAll('.gtile').length, ls: localStorage.getItem('gbs_view'), pressed: document.querySelector('[data-view="list"]').getAttribute('aria-pressed') }), slugs[300]);
    ok(hh.card && !hh.tiles && hh.ls === 'gallery' && hh.pressed === 'true', `${w}: a #bot- link opens the list on that card, Gallery stays saved`);
    await h.close(); await r.bringToFront();
    await r.click('[data-view="list"]'); await wait(400);
    const back = await r.evaluate(() => ({ cards: document.querySelectorAll('#results .card').length, strips: document.querySelectorAll('#results .topvotes').length, ls: localStorage.getItem('gbs_view') }));
    ok(back.cards > 0 && back.strips > 0 && back.ls === 'list', `${w}: List brings back the cards and strips, saved as list`);
    await ctx.close();
  }
  // A bot without a share card: the emoji tile with "No share card yet", same size as the others, no request for an image
  const site = await tempSite(({ pub }) => { fs.rmSync(pub('og', 'thumb', slugs[1].replace(/^bot-/, '') + '.webp')); }, { images: true });
  try {
    const sd = JSON.parse(fs.readFileSync(site.pub('shelf-data.json'), 'utf8'));
    ok(!sd.bots[1].og && sd.bots[0].og, 'build: no "og" hash for a bot whose thumbnail is missing');
    const z = await open(site.base, '/');
    await z.click('[data-view="gallery"]'); await wait(400);
    const n = await z.evaluate(() => { const t = [...document.querySelectorAll('.gtile')], a = t[0].getBoundingClientRect(), c = t[1].getBoundingClientRect();
      return { img: !!t[1].querySelector('img'), none: t[1].querySelector('.gi.none') && t[1].querySelector('.nocard').textContent, em: t[1].querySelector('.gi .em').getAttribute('aria-hidden'), same: Math.abs(a.height - c.height) < 0.5, cls: window.__cls }; });
    ok(!n.img && n.none === 'No share card yet' && n.em === 'true' && n.same && n.cls === 0, `fallback tile: "${n.none}", same height as a card tile, CLS ${n.cls}`);
    await z.close();
    // Contrast in both themes: the "No share card yet" note and the tile name 4.5:1, the unpressed view icon 3:1
    for (const theme of ['dark', 'light']) {
      const c = await open(site.base, '/');
      await c.evaluate((t) => { localStorage.setItem('theme', t); localStorage.setItem('gbs_view', 'gallery'); }, theme);
      await c.reload({ waitUntil: 'networkidle0' }); await wait(300);
      const k = await c.evaluate(() => {
        const rgb = (s) => s.match(/[\d.]+/g).slice(0, 3).map(Number), lum = (c) => { const [r, g, b] = c.map((v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
        const ratio = (a, b) => { const x = lum(rgb(a)), y = lum(rgb(b)); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
        const bg = getComputedStyle(document.body).backgroundColor, cs = (sel, p) => getComputedStyle(document.querySelector(sel))[p];
        return { theme: document.documentElement.dataset.theme, note: ratio(cs('.gi.none .nocard', 'color'), cs('.gi.none', 'backgroundColor')), name: ratio(cs('.gtile .t', 'color'), bg),
          icon: ratio(cs('.view button[aria-pressed="false"]', 'color'), bg), score: ratio(cs('.gtile .sc', 'color'), bg) };
      });
      ok(k.theme === theme && k.note >= 4.5 && k.name >= 4.5 && k.score >= 4.5 && k.icon >= 3, `${theme}: contrast note ${k.note.toFixed(2)}, name ${k.name.toFixed(2)}, score ${k.score.toFixed(2)}, view icon ${k.icon.toFixed(2)}`);
      await c.close();
    }
  } finally { site.close(); }
  // og.js keeps the thumbnails next to the cards and is not part of the Vercel build
  const og = fs.readFileSync(path.join(__dirname, '..', 'scripts', 'og.js'), 'utf8'), vj = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'vercel.json'), 'utf8'));
  ok(/og\/thumb|"thumb"/.test(og) && !/og\.js/.test(vj.buildCommand || ''), 'scripts/og.js draws the thumbnails; the Vercel build does not run it');
  const pub = path.join(__dirname, '..', 'public');
  const thumbs = fs.readdirSync(path.join(pub, 'og', 'thumb')), cards = new Set(fs.readdirSync(path.join(pub, 'og', 'bot')).map((f) => f.replace(/\.png$/, '')));
  ok(thumbs.length === 710 && thumbs.every((t) => cards.has(t.replace(/\.webp$/, ''))), `${thumbs.length} thumbnails, each next to its share card`);
  ok(!errs.length, `no page or console errors, no missing images (${errs.slice(0, 3).join(' | ')})`);
  await b.close();
})();
