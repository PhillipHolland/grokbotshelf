// Creator names link to their on-site /@handle page: each named group header (the X handle link stays beside it) and
// the creator name on each card. Anonymous creators stay plain text. Every linked page exists.
// Usage: NODE_PATH=/path/to/node_modules node test/creatorlinks.js [base-url]
const puppeteer = require('puppeteer-core');
const BASE = process.argv[2] || 'http://localhost:8765/';
const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) process.exitCode = 1; };
(async () => {
  const b = await puppeteer.launch({ executablePath: '/usr/bin/google-chrome', headless: 'new', args: ['--no-sandbox'] });
  const p = await b.newPage(), errs = []; p.on('pageerror', (e) => errs.push(e.message));
  await p.setViewport({ width: 1280, height: 900 });
  await p.setRequestInterception(true);
  p.on('request', (r) => (/google-analytics|googletagmanager|\/_vercel\/|\/api\//.test(r.url()) ? r.abort() : r.continue()));
  await p.goto(BASE, { waitUntil: 'networkidle0' });
  const r = await p.evaluate(async () => {
    const bots = await (await fetch('/bots.json')).json(), list = Array.isArray(bots) ? bots : bots.bots;
    const byName = new Map(list.map((x) => [x.name, x]));
    const groups = [...document.querySelectorAll('#results section.group')];
    const out = { groups: groups.length, anon: 0, gBad: [], cards: 0, linked: 0, cBad: [], hrefs: new Set() };
    for (const g of groups) {
      const h2 = g.querySelector('h2'), key = h2.id.slice(2), nm = h2.querySelector('.nm'), x = h2.querySelector('a.handle');
      if (g.classList.contains('anon')) { out.anon++; if (nm.tagName !== 'SPAN' || x) out.gBad.push(key); continue; }
      if (nm.tagName !== 'A' || nm.getAttribute('href') !== '/@' + key || !x || !/^https:\/\/x\.com\//.test(x.href) || x.target !== '_blank') out.gBad.push(key);
      out.hrefs.add('/@' + key);
    }
    for (const c of document.querySelectorAll('#results .card')) {
      out.cards++;
      const bot = byName.get(c.querySelector('h3').textContent), cn = c.querySelector('.sub .cn');
      const want = bot && bot.creator_handle ? '/@' + bot.creator_handle.replace(/^@/, '').toLowerCase() : null;
      if (want) { out.linked++; out.hrefs.add(want); if (cn.tagName !== 'A' || cn.getAttribute('href') !== want) out.cBad.push(c.id); }
      else if (cn.tagName !== 'SPAN') out.cBad.push(c.id);
    }
    const hrefs = [...out.hrefs], st = await Promise.all(hrefs.map((h) => fetch(h, { method: 'HEAD' }).then((x) => x.status, () => 0)));
    out.missing = hrefs.filter((h, i) => st[i] !== 200); out.n = hrefs.length; delete out.hrefs;
    return out;
  });
  ok(r.groups > 20 && r.gBad.length === 0, `${r.groups - r.anon} named group headers link to /@handle with the X link beside them; ${r.anon} anonymous stay text (${r.gBad.length} off${r.gBad.length ? ': ' + r.gBad.slice(0, 5).join(', ') : ''})`);
  ok(r.linked > 100 && r.cBad.length === 0, `${r.linked} of ${r.cards} card creator names link to /@handle, the rest stay text (${r.cBad.length} off${r.cBad.length ? ': ' + r.cBad.slice(0, 5).join(', ') : ''})`);
  ok(r.missing.length === 0, `all ${r.n} linked creator pages exist (${r.missing.join(', ') || 'none missing'})`);
  await Promise.all([p.waitForNavigation(), p.click('#results section.group:not(.anon) h2 a.nm')]);
  ok(/\/@[a-z0-9_]+\/?$/.test(new URL(p.url()).pathname), `clicking a group name opens its creator page (${new URL(p.url()).pathname})`);
  ok(errs.length === 0, 'no page errors' + (errs.length ? ': ' + errs.join(' | ') : ''));
  await b.close();
})().catch((e) => { console.error(e); process.exit(1); });
