// Round-4 items: the home "Just added" strip. Usage: NODE_PATH=/path/to/node_modules node test/round4.js [base-url]
const puppeteer = require('puppeteer-core');
const BASE = process.argv[2] || 'http://localhost:8765/';
const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) process.exitCode = 1; };
const UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1';
const fmtDay = (d) => new Date(d + 'T12:00:00Z').toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
(async () => {
  const b = await puppeteer.launch({ executablePath: '/usr/bin/google-chrome', headless: 'new', args: ['--no-sandbox'] });
  const errs = [];
  // votes: null = the API is down, otherwise the GET /api/votes answer (after delay ms)
  async function open(path, { w = 1280, votes = null, delay = 300, wait = 'networkidle0' } = {}) {
    const p = await b.newPage(); p.on('pageerror', (e) => errs.push(path + ': ' + e.message));
    const mob = w < 700;
    await p.setViewport({ width: w, height: mob ? 844 : 900, isMobile: mob, hasTouch: mob });
    if (mob) await p.setUserAgent(UA);
    await p.evaluateOnNewDocument(() => { try { localStorage.setItem('shelfer-sheet', '{"v":1,"how":"test"}'); } catch (e) {}
      window.__cls = 0; new PerformanceObserver((l) => l.getEntries().forEach((e) => { if (!e.hadRecentInput) window.__cls += e.value; })).observe({ type: 'layout-shift', buffered: true }); });
    await p.setRequestInterception(true);
    p.on('request', (r) => {
      if (/google-analytics|googletagmanager|\/_vercel\//.test(r.url())) return r.abort();
      if (/\/api\/votes/.test(r.url()) && r.method() === 'GET') return votes ? setTimeout(() => r.respond({ status: 200, contentType: 'application/json', body: JSON.stringify(votes) }).catch(() => {}), delay) : r.respond({ status: 503, body: '{}' });
      if (/\/api\//.test(r.url())) return r.abort();
      r.continue();
    });
    await p.goto(new URL(path, BASE).href, { waitUntil: wait });
    return p;
  }
  const bots = await (await fetch(new URL('/bots.json', BASE))).json();
  const added = new Map(bots.map((x) => [x.name + '\u0000' + (x.creator_name || ''), x.added]));
  const d6 = new Date(Date.now() - 6 * 864e5), wk = d6.getFullYear() + '-' + String(d6.getMonth() + 1).padStart(2, '0') + '-' + String(d6.getDate()).padStart(2, '0'); // same local-day window as app.js weekAgo
  const recent = bots.filter((x) => x.added >= wk), newest = bots.reduce((m, x) => (x.added > m ? x.added : m), '');

  // #1 home Featured view: the strip lists the newest bots with their real added date, at most 2 per creator
  for (const w of [390, 1280]) {
    const p = await open('/', { w });
    const r = await p.evaluate(() => { const s = document.querySelector('.newv'); if (!s) return null;
      return { h: s.querySelector('h2').textContent, href: s.querySelector('.tall').getAttribute('href'), all: s.querySelector('.tall').textContent,
        rows: [...s.querySelectorAll('.tlist li')].map((li) => ({ name: li.querySelector('.nm').firstChild.textContent, by: li.querySelector('.nm small').textContent, d: li.querySelector('.sc.dt').firstChild.textContent, shown: li.offsetParent !== null, href: li.querySelector('a').getAttribute('href') })) }; });
    ok(!!r, `#1 ${w}: the strip is on the home Featured view`);
    if (!r) { await p.close(); continue; }
    const wantH = recent.length === bots.length ? 'Just added' : 'New this week';
    ok(r.h === wantH && r.href === '/?sort=newest' + (wantH === 'Just added' ? '' : '&new=1') && r.all.includes(recent.length.toLocaleString('en-US')),
      `#1 ${w}: heading "${r.h}" (want "${wantH}"), link ${r.href} "${r.all}" (${recent.length} added since ${wk})`);
    const real = r.rows.every((x) => fmtDay(added.get(x.name + '\u0000' + x.by) || '') === x.d && /^\/bot\//.test(x.href));
    const per = {}; r.rows.forEach((x) => { per[x.by] = (per[x.by] || 0) + 1; });
    const order = r.rows.every((x, i) => i === 0 || added.get(x.name + '\u0000' + x.by) <= added.get(r.rows[i - 1].name + '\u0000' + r.rows[i - 1].by));
    ok(r.rows.length === Math.min(6, recent.length) && real && order && Math.max(...Object.values(per)) <= 2 && r.rows[0].d === fmtDay(newest),
      `#1 ${w}: ${r.rows.length} rows, each date is that bot's own added date (${real}), newest first (${order}), <=2 per creator (${JSON.stringify(per)})`);
    const shown = r.rows.filter((x) => x.shown).length;
    ok(shown === (w < 700 ? Math.min(4, r.rows.length) : r.rows.length), `#1 ${w}: ${shown} rows visible`);
    await p.close();
  }
  for (const q of ['/?q=news', '/?sort=newest', '/?new=1']) {
    const p = await open(q, { w: 1280 });
    ok(!(await p.$('.newv')), `#1 ${q}: no strip once searching, sorting or filtering`);
    await p.close();
  }

  ok(errs.length === 0, 'no page errors' + (errs.length ? ': ' + errs.join(' | ') : ''));
  await b.close();
})().catch((e) => { console.error(e); process.exit(1); });
