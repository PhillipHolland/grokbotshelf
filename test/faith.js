// Round 4 #3: the Faith category is data-driven like every other category. With no Faith bots there is no Faith
// option and /?cat=faith falls back to the whole shelf; with Faith bots the option lists them and the filter shows
// exactly those. The shelf data is rewritten in the browser, so this runs against any catalog.
// Usage: NODE_PATH=/path/to/node_modules node test/faith.js [base-url]
const puppeteer = require('puppeteer-core');
const BASE = process.argv[2] || 'http://localhost:8765/';
const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) process.exitCode = 1; };
(async () => {
  const b = await puppeteer.launch({ executablePath: '/usr/bin/google-chrome', headless: 'new', args: ['--no-sandbox'] });
  const errs = [];
  const real = await (await fetch(new URL('/shelf-data.json', BASE))).json();
  const total = real.bots.length;
  async function open(path, edit) {
    const p = await b.newPage(); p.on('pageerror', (e) => errs.push(e.message));
    await p.setViewport({ width: 1280, height: 900 });
    await p.setRequestInterception(true);
    p.on('request', (r) => {
      if (/google-analytics|googletagmanager|\/_vercel\/|\/api\//.test(r.url())) return r.abort();
      if (/\/shelf-data\.json/.test(r.url())) { const d = JSON.parse(JSON.stringify(real)); edit(d.bots); return r.respond({ status: 200, contentType: 'application/json', body: JSON.stringify(d) }); }
      r.continue();
    });
    await p.goto(new URL(path, BASE).href, { waitUntil: 'networkidle0' });
    return p;
  }
  const state = (p) => p.evaluate(() => ({ opts: [...document.querySelectorAll('#cats option')].map((o) => o.value), val: document.querySelector('#cats').value, count: document.querySelector('#count').textContent, search: location.search,
    cards: [...document.querySelectorAll('#results .card')].map((c) => c.id) }));
  const none = await open('/?cat=faith', (bots) => bots.forEach((x) => { if (x.category === 'Faith') x.category = 'Lifestyle'; }));
  const n = await state(none);
  ok(!n.opts.includes('Faith') && n.val === '' && n.count === `${total} bots` && n.search === '', `no Faith bots: no option; /?cat=faith shows the whole shelf (${n.count}, url "${n.search}")`);
  await none.close();
  let picked = [];
  const some = await open('/?cat=faith', (bots) => { picked = []; bots.filter((x) => x.category !== 'Faith').slice(0, 3).forEach((x) => { x.category = 'Faith'; }); bots.forEach((x) => { if (x.category === 'Faith') picked.push(x.name); }); });
  const s = await state(some);
  ok(s.opts.includes('Faith') && s.val === 'Faith' && s.count === `${picked.length} ${picked.length === 1 ? 'bot' : 'bots'}` && s.cards.length === picked.length, `Faith bots: option shown, /?cat=faith keeps it and shows exactly ${picked.length} (${s.count})`);
  await some.select('#cats', ''); await new Promise((x) => setTimeout(x, 300));
  ok((await state(some)).count === `${total} bots`, 'clearing the category shows every bot again');
  await some.close();
  ok(!errs.length, `no page errors (${errs.slice(0, 3).join(' | ')})`);
  await b.close();
})().catch((e) => { console.error(e); process.exit(1); });
