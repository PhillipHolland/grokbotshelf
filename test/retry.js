// The shelf failed to load (round 2 #10): the empty-state card says so, with "Try again" that re-runs the fetch.
// Usage: NODE_PATH=/path/to/node_modules node test/retry.js [base-url]
const puppeteer = require('puppeteer-core');
const BASE = process.argv[2] || 'http://localhost:8765/';
const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) process.exitCode = 1; };
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
(async () => {
  const b = await puppeteer.launch({ executablePath: '/usr/bin/google-chrome', headless: 'new', args: ['--no-sandbox'] });
  for (const vp of [{ width: 390, height: 844, isMobile: true, hasTouch: true }, { width: 1280, height: 900 }]) {
    const p = await b.newPage(); await p.setViewport(vp);
    if (vp.isMobile) await p.setUserAgent('Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1');
    const errs = []; p.on('pageerror', (e) => errs.push(e.message));
    let fail = true, hits = 0;
    await p.setRequestInterception(true);
    p.on('request', (r) => {
      if (/\/shelf-data\.json/.test(r.url())) { hits++; if (fail) return r.respond({ status: 503, body: '' }); }
      if (/google-analytics|googletagmanager|\/_vercel\//.test(r.url())) return r.abort();
      r.continue();
    });
    await p.goto(BASE, { waitUntil: 'networkidle0' });
    const e = await p.evaluate(() => {
      const c = document.querySelector('#results .empty'), btn = c && c.querySelector('button');
      return c && { role: c.getAttribute('role'), t: c.querySelector('.empty-t').textContent, s: c.querySelector('.empty-s').textContent, btn: btn && btn.textContent, busy: document.getElementById('results').getAttribute('aria-busy'), h: Math.round(btn.getBoundingClientRect().height), tap: Math.round(btn.getBoundingClientRect().height - 2 * parseFloat(getComputedStyle(btn, '::after').top || 0)) };
    });
    ok(e && e.role === 'alert' && e.t === 'The shelf did not load' && e.s === 'Check your connection, then try again.' && e.btn === 'Try again' && e.busy === null, `${vp.width}px failed load shows the retry card (${JSON.stringify(e)})`);
    ok(e && e.h === 34 && (!vp.isMobile || e.tap >= 44), `${vp.width}px "Try again" keeps the 34px button look${vp.isMobile ? ', with a 44px tap' : ''} (${JSON.stringify(e && [e.h, e.tap])})`);
    await p.screenshot({ path: `/tmp/retry-${vp.width}.png` });
    fail = false;
    await p.click('#results .empty button');
    await p.waitForFunction(() => document.querySelectorAll('#results .card').length > 0, { timeout: 10000 }).catch(() => {});
    const r = await p.evaluate(() => ({ cards: document.querySelectorAll('#results .card').length, empty: !!document.querySelector('#results .empty'), count: document.getElementById('count').textContent, busy: document.getElementById('results').getAttribute('aria-busy') }));
    ok(hits === 2 && r.cards > 0 && !r.empty && /^\d+ bots$/.test(r.count) && r.busy === null, `${vp.width}px "Try again" loads the shelf (${hits} requests, ${JSON.stringify(r)})`);
    // the Add form's duplicate check uses the fresh data after a retry
    const dup = await p.evaluate(async () => { const d = await shelfData; return Array.isArray(d) && d.length; });
    ok(dup > 0, `${vp.width}px shelfData resolves with the bots after a retry (${dup})`);
    ok(errs.length === 0, `${vp.width}px no page errors ${errs.join(' | ')}`);
    await p.close();
  }
  await b.close();
})();
