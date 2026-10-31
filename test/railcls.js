// Perf round 6 #3: the A-Z rail never shifts layout while you scroll. Its box is fixed under the stuck dock; at the top
// of the page (dock lower down) a transform moves and squeezes the column to fit under the dock, with each letter scaled
// back to its normal size. Usage: NODE_PATH=/path/to/node_modules node test/railcls.js [base-url]
const puppeteer = require('puppeteer-core');
const BASE = process.argv[2] || 'http://localhost:8765/';
const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) process.exitCode = 1; };
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
(async () => {
  const b = await puppeteer.launch({ executablePath: '/usr/bin/google-chrome', headless: 'new', args: ['--no-sandbox'] });
  const errs = [];
  for (const [label, vp] of [['390 @3x', { width: 390, height: 844, deviceScaleFactor: 3, isMobile: true, hasTouch: true }], ['1280', { width: 1280, height: 800 }], ['320', { width: 320, height: 568, deviceScaleFactor: 2, isMobile: true, hasTouch: true }]]) {
    const p = await b.newPage(); p.on('pageerror', (e) => errs.push(e.message));
    await p.setViewport(vp);
    await p.evaluateOnNewDocument(() => { window.__cls = 0; window.__shifts = []; new PerformanceObserver((l) => l.getEntries().forEach((e) => { if (!e.hadRecentInput) { window.__cls += e.value; window.__shifts.push(e.sources.map((s) => s.node && (s.node.id || s.node.className || s.node.nodeName)).join()); } })).observe({ type: 'layout-shift', buffered: true }); });
    await p.setRequestInterception(true);
    p.on('request', (r) => /google-analytics|googletagmanager|\/_vercel\/|\/api\//.test(r.url()) ? r.abort() : r.continue());
    await p.goto(BASE, { waitUntil: 'networkidle0' }); await wait(300);
    const geo = () => p.evaluate(() => { const bs = [...document.querySelectorAll('#rail button')], d = document.getElementById('dock').getBoundingClientRect(), cs = getComputedStyle(document.getElementById('rail'));
      const r = bs.map((x) => x.getBoundingClientRect()), sp = (bs[1].querySelector('span') || bs[1]).getBoundingClientRect();
      return { first: r[0].top, last: r[r.length - 1].bottom, dock: d.bottom, bottom: document.documentElement.clientHeight - parseFloat(cs.bottom), even: r.slice(1).every((x, i) => Math.abs((x.top - r[i].top) - (r[1].top - r[0].top)) < 0.2), glyph: sp.height, tf: document.getElementById('rail').style.transform }; });
    const g0 = await geo();
    ok(g0.first >= g0.dock + 9.5 && g0.last <= g0.bottom + 0.5 && g0.even, `${label}: at the top, the letters sit evenly between the dock (${Math.round(g0.dock)}) and the bottom margin (${Math.round(g0.first)}-${Math.round(g0.last)})`);
    // read down slowly from the top past the hero, like a thumb would
    await p.evaluate(() => { window.__cls = 0; window.__shifts = []; });
    for (let y = 0; y <= 700; y += 12) { await p.evaluate((y) => scrollTo(0, y), y); await wait(20); }
    await wait(200);
    const g1 = await geo(), cls = await p.evaluate(() => [window.__cls, window.__shifts.slice(0, 3)]);
    ok(cls[0] === 0, `${label}: scrolling from the top past the hero shifts nothing (CLS ${cls[0]}${cls[1].length ? ', ' + cls[1].join(' | ') : ''})`);
    ok(g1.tf === '' && g1.first >= g1.dock + 9.5 && g1.last <= g1.bottom + 0.5, `${label}: docked, the rail has no transform and starts under the dock (+${Math.round(g1.first - g1.dock)}px)`);
    ok(Math.abs(g0.glyph - g1.glyph) < 0.6, `${label}: letters keep their size when the column is squeezed (${g0.glyph.toFixed(1)}px at the top, ${g1.glyph.toFixed(1)}px docked)`);
    // and back up again
    await p.evaluate(() => { window.__cls = 0; });
    for (let y = 700; y > -12; y -= 12) { await p.evaluate((y) => scrollTo(0, Math.max(0, y)), y); await wait(20); }
    await wait(200);
    const g2 = await geo();
    ok(await p.evaluate(() => window.__cls) === 0 && Math.abs(g2.first - g0.first) < 0.5 && Math.abs(g2.last - g0.last) < 0.5, `${label}: back at the top, same layout as on load (${g2.first.toFixed(1)}-${g2.last.toFixed(1)} vs ${g0.first.toFixed(1)}-${g0.last.toFixed(1)}), CLS ${await p.evaluate(() => window.__cls)}`);
    await p.close();
  }
  ok(!errs.length, 'no page errors' + (errs.length ? ': ' + errs.join(' | ') : ''));
  await b.close();
})();
