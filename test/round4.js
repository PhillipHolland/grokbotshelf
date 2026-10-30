// Round-4 items: the home "Just added" strip and the net score on creator page tiles. Usage: NODE_PATH=/path/to/node_modules node test/round4.js [base-url]
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

  // #2 creator page tiles: a quiet 0 in a fixed slot from the server; the real net score lands in the same place
  const path = '/@phil_holland';
  const html = await (await fetch(new URL(path, BASE))).text();
  const tiles = (html.match(/<li><a href="\/bot\//g) || []).length, zeros = (html.match(/<span class="cp-sc zero" data-score="bot-[^"]+"/g) || []).length;
  ok(tiles > 1 && zeros === tiles && /bot-page\.js\?v=[0-9a-f]+/.test(html), `#2 server HTML: ${zeros} of ${tiles} tiles carry a quiet 0, bot-page.js is versioned`);
  const slugs = [...html.matchAll(/data-score="(bot-[^"]+)"/g)].map((m) => m[1]);
  {
    const p = await open(path, { w: 390 });
    const r = await p.evaluate(() => [...document.querySelectorAll('.cp-sc')].map((e) => e.querySelector('.n').textContent + (e.classList.contains('zero') ? 'z' : '')));
    ok(r.every((x) => x === '0z'), `#2 API down: every tile keeps the quiet 0 (${[...new Set(r)]})`);
    await p.close();
  }
  const scores = { [slugs[0]]: { up: 130, down: 7, score: 123 }, [slugs[1]]: { up: 1, down: 4, score: -3 } };
  for (const w of [390, 1280]) {
    const p = await open(path, { w, votes: { global: true, scores }, delay: 800, wait: 'domcontentloaded' });
    const rect = () => p.evaluate(() => [...document.querySelectorAll('.cp-list li')].map((li) => { const a = li.getBoundingClientRect(), s = li.querySelector('.cp-sc').getBoundingClientRect(); return [a.top, a.height, Math.round(s.left), Math.round(s.width)].join(); }));
    const before = await rect();
    await p.waitForFunction(() => document.querySelector('.cp-sc .n').textContent !== '0', { timeout: 6000 }).catch(() => {});
    await new Promise((x) => setTimeout(x, 200));
    const after = await rect();
    const r = await p.evaluate(() => { const e = [...document.querySelectorAll('.cp-sc')]; return { a: [e[0].querySelector('.n').textContent, e[0].classList.contains('zero'), e[0].dataset.tip, e[0].scrollWidth <= e[0].clientWidth + 1],
      b: [e[1].querySelector('.n').textContent, e[1].classList.contains('neg'), getComputedStyle(e[1].querySelectorAll('svg')[1]).display], rest: e.slice(2).every((x) => x.querySelector('.n').textContent === '0' && x.classList.contains('zero')), cls: window.__cls }; });
    ok(r.a[0] === '123' && !r.a[1] && r.a[2] === '130 up · 7 down' && r.a[3], `#2 ${w}: tile 1 shows 123, not quiet, tooltip "${r.a[2]}", fits (${r.a})`);
    ok(r.b[0] === '-3' && r.b[1] && r.b[2] !== 'none' && r.rest, `#2 ${w}: tile 2 shows -3 with the down arrow; bots without votes stay a quiet 0 (${r.rest})`);
    ok(before.join('|') === after.join('|') && r.cls < 0.001, `#2 ${w}: tiles and score slots do not move when votes land, CLS ${r.cls.toFixed(4)}`);
    await p.close();
  }

  ok(errs.length === 0, 'no page errors' + (errs.length ? ': ' + errs.join(' | ') : ''));
  await b.close();
})().catch((e) => { console.error(e); process.exit(1); });
