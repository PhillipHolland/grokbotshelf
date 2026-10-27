// Round-3 design items on bot, creator, 404 and home pages (see each section). Usage: NODE_PATH=/path/to/node_modules node test/round3.js [base-url]
const puppeteer = require('puppeteer-core');
const BASE = process.argv[2] || 'http://localhost:8765/';
const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) process.exitCode = 1; };
const UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
(async () => {
  const b = await puppeteer.launch({ executablePath: '/usr/bin/google-chrome', headless: 'new', args: ['--no-sandbox'] });
  const errs = [];
  // votes: null = the API is down (local server), otherwise the GET /api/votes answer; theme: localStorage before load
  async function open(path, { w = 1280, votes = null, theme = 'dark' } = {}) {
    const p = await b.newPage(); p.on('pageerror', (e) => errs.push(path + ': ' + e.message));
    const mob = w < 700;
    await p.setViewport({ width: w, height: mob ? 844 : 900, isMobile: mob, hasTouch: mob });
    if (mob) await p.setUserAgent(UA);
    await p.evaluateOnNewDocument((t) => { try { localStorage.setItem('theme', t); localStorage.setItem('shelfer-sheet', '{"v":1,"how":"test"}'); } catch (e) {} }, theme);
    await p.setRequestInterception(true);
    p.on('request', (r) => {
      if (/google-analytics|googletagmanager|\/_vercel\//.test(r.url())) return r.abort();
      if (/\/api\/votes/.test(r.url()) && r.method() === 'GET') return votes ? setTimeout(() => r.respond({ status: 200, contentType: 'application/json', body: JSON.stringify(votes) }).catch(() => {}), 300) : r.respond({ status: 503, body: '{}' });
      if (/\/api\//.test(r.url())) return r.abort();
      r.continue();
    });
    await p.goto(new URL(path, BASE).href, { waitUntil: 'networkidle0' });
    return p;
  }

  // #1 bot page vote count: a quiet 0 before and without the API, the real score in the same slot, no shift, 3 digits fit
  {
    let p = await open('/bot/archivist');
    const z = await p.evaluate(() => { const v = document.querySelector('.bp-vote .vn'), cs = getComputedStyle(v), t2 = getComputedStyle(document.documentElement).getPropertyValue('--text2').trim();
      const tmp = document.createElement('i'); tmp.style.color = t2; document.body.appendChild(tmp); const want = getComputedStyle(tmp).color; tmp.remove();
      return { t: v.textContent, zero: v.classList.contains('zero'), quiet: cs.color === want }; });
    ok(z.t === '0' && z.zero && z.quiet, `#1 no tally: the count reads a quiet 0 (${JSON.stringify(z)})`);
    const html = await (await fetch(new URL('/bot/archivist', BASE))).text();
    ok(/<span class="vn zero">0<\/span>/.test(html), '#1 the server-rendered page already has the quiet 0 before any script runs');
    await p.close();
    for (const score of [21, 123]) {
      p = await b.newPage(); await p.setViewport({ width: 1280, height: 900 });
      await p.setRequestInterception(true);
      p.on('request', (r) => /\/api\/votes/.test(r.url()) ? setTimeout(() => r.respond({ status: 200, contentType: 'application/json', body: JSON.stringify({ global: true, scores: { 'bot-archivist': { up: score + 1, down: 1, score } } }) }).catch(() => {}), 600) : /google|_vercel/.test(r.url()) ? r.abort() : r.continue());
      await p.evaluateOnNewDocument(() => { window.__shift = 0; new PerformanceObserver((l) => l.getEntries().forEach((e) => { window.__shift += e.value; })).observe({ type: 'layout-shift', buffered: true }); });
      await p.goto(new URL('/bot/archivist', BASE).href, { waitUntil: 'domcontentloaded' });
      const before = await p.evaluate(() => { const r = document.querySelector('.bp-actions').getBoundingClientRect(); return [r.top, r.height, document.querySelector('.bp-vote .vn').textContent]; });
      await p.waitForFunction((s) => document.querySelector('.bp-vote .vn').textContent === String(s), { timeout: 5000 }, score).catch(() => {});
      const after = await p.evaluate(() => { const v = document.querySelector('.bp-vote .vn'), r = document.querySelector('.bp-actions').getBoundingClientRect(); return [r.top, r.height, v.textContent, v.classList.contains('zero'), v.scrollWidth <= v.clientWidth + 1, window.__shift]; });
      ok(after[2] === String(score) && !after[3] && after[4] && before[0] === after[0] && before[1] === after[1] && after[5] < 0.001,
        `#1 score ${score} lands in the slot: ${before[2]} -> ${after[2]}, not quiet, not clipped (${after[4]}), action row still (${before.slice(0, 2)} -> ${after.slice(0, 2)}), CLS ${after[5].toFixed(4)}`);
      await p.close();
    }
  }

  // #2 bot, creator and 404 pages at 1280: header, content column and footer share the 720px column; the theme toggle is there and works
  for (const path of ['/bot/archivist', '/@phil_holland', '/@nobodyhere']) {
    const p = await open(path);
    const r = await p.evaluate(() => { const R = (s) => { const e = document.querySelector(s), r = e.getBoundingClientRect(), cs = getComputedStyle(e); return [Math.round(r.left + parseFloat(cs.paddingLeft)), Math.round(r.right - parseFloat(cs.paddingRight))]; };
      return { main: R('main.bp'), head: R('.hero'), foot: R('.site-foot'), rule: Math.round(document.querySelector('.site-foot').getBoundingClientRect().width) }; });
    ok(r.head.join() === r.main.join() && r.foot.join() === r.main.join() && r.rule <= 760, `#2 1280 ${path}: header ${r.head}, footer ${r.foot} line up with the column ${r.main} (footer rule ${r.rule}px)`);
    await p.click('#theme'); await sleep(100);
    const t = await p.evaluate(() => [document.documentElement.dataset.theme, localStorage.getItem('theme'), document.getElementById('theme').getAttribute('aria-pressed')]);
    ok(t.join() === 'light,light,false', `#2 ${path}: theme toggle switches to light and saves it (${t})`);
    await p.close();
  }

  ok(errs.length === 0, 'no page errors' + (errs.length ? ': ' + errs.join(' | ') : ''));
  await b.close();
})().catch((e) => { console.error(e); process.exit(1); });
