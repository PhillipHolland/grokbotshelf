// Deep links without layout shift (round 2 follow-up). /#add goes straight to /add (head script, before any paint);
// /#bot-<slug> keeps the Add form and footer out of the layout while the shelf is partial (.tailing) and renders the
// landing group's cards at their real size, so nothing on screen moves after the jump.
// Phone profile with a 4x CPU throttle, which is where the shifts showed (CLS 0.52 on /#add, 0.36 on /#bot-3d-maker).
// Usage: NODE_PATH=/path/to/node_modules node test/cls.js [base-url]
const puppeteer = require('puppeteer-core');
const BASE = process.argv[2] || 'http://localhost:8765/';
const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) process.exitCode = 1; };
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1';
(async () => {
  const b = await puppeteer.launch({ executablePath: '/usr/bin/google-chrome', headless: 'new', args: ['--no-sandbox'] });
  const errs = [];
  async function open(path, w = 390) {
    const p = await b.newPage(); p.on('pageerror', (e) => errs.push(e.message));
    await p.setViewport(w === 390 ? { width: 390, height: 844, isMobile: true, hasTouch: true } : { width: w, height: 900 });
    if (w === 390) await p.setUserAgent(UA);
    await p.setRequestInterception(true);
    p.on('request', (r) => (/google-analytics|googletagmanager|\/_vercel\//.test(r.url()) ? r.abort() : r.continue()));
    await p.evaluateOnNewDocument(() => { window.__cls = 0; window.__src = [];
      new PerformanceObserver((l) => { for (const e of l.getEntries()) if (!e.hadRecentInput) { window.__cls += e.value; window.__src.push(e.value.toFixed(3) + ':' + (e.sources || []).map((s) => s.node && (s.node.id || s.node.className || s.node.nodeName)).join(',')); } }).observe({ type: 'layout-shift', buffered: true }); });
    const cdp = await p.target().createCDPSession(); await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
    await p.goto(new URL(path, BASE).href, { waitUntil: 'networkidle0' }); await wait(2500);
    return p;
  }
  const cls = (p) => p.evaluate(() => ({ cls: +window.__cls.toFixed(3), src: window.__src }));

  // /#add: replaced by /add before the home page paints; no home history entry
  let p = await open('/#add');
  const a = await p.evaluate(() => ({ path: location.pathname, hash: location.hash, form: !!document.getElementById('sub-form'), len: history.length }));
  ok(a.path === '/add' && a.hash === '' && a.form, `/#add lands on /add (${JSON.stringify(a)})`);
  const ac = await cls(p); ok(ac.cls === 0, `/#add: CLS 0 (${JSON.stringify(ac)})`);
  await p.close();
  // other hashes are untouched
  p = await open('/#nothing-here');
  ok(await p.evaluate(() => location.pathname === '/' && location.hash === '#nothing-here'), 'other hashes stay on home');
  await p.close();

  // /#bot-<slug>: late and middle groups, phone and desktop
  const dirs = require('fs').readdirSync(require('path').join(__dirname, '../public/bot'));
  for (const slug of ['3d-maker', dirs[Math.floor(dirs.length / 2)]]) for (const w of [390, 1280]) {
    p = await open('/#bot-' + slug, w);
    const r = await p.evaluate((id) => { const el = document.getElementById(id), r = el && el.getBoundingClientRect(); return { inView: !!r && r.top >= 0 && r.bottom <= innerHeight + 2, tailing: document.documentElement.classList.contains('tailing'), addShown: getComputedStyle(document.getElementById('add')).display !== 'none' }; }, 'bot-' + slug);
    const c = await cls(p);
    ok(r.inView && c.cls < 0.05, `${w}px /#bot-${slug} lands in view with CLS ${c.cls} (< 0.05) ${JSON.stringify(c.src)}`);
    ok(r.tailing === !r.addShown, `${w}px /#bot-${slug}: the Add form is out of the layout exactly while the shelf is partial (${JSON.stringify(r)})`);
    await p.close();
  }

  // Plain home: the form and footer are back once the whole shelf is built (End key)
  p = await open('/');
  const h0 = await p.evaluate(() => document.documentElement.classList.contains('tailing'));
  for (let i = 0; i < 40; i++) { await p.keyboard.press('End'); await wait(300); if (!(await p.evaluate(() => document.documentElement.classList.contains('tailing')))) break; }
  const h1 = await p.evaluate(() => ({ tailing: document.documentElement.classList.contains('tailing'), add: getComputedStyle(document.getElementById('add')).display, foot: getComputedStyle(document.querySelector('.site-foot')).display }));
  ok(h0 && !h1.tailing && h1.add !== 'none' && h1.foot !== 'none', `home: form and footer hidden while partial (${h0}), shown when complete (${JSON.stringify(h1)})`);
  await p.close();

  ok(errs.length === 0, 'no page errors' + (errs.length ? ': ' + errs.join(' | ') : ''));
  await b.close();
})();
