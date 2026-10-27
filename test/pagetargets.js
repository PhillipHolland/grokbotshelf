// Bot and creator pages on a phone: the header line links (.sub), the page links (.bp-links), the badge Copy buttons, the
// Get / Add buttons and the similar-bot links are all at least 44px tall, the header line wraps instead of clipping, and
// nothing overflows sideways. Desktop keeps its compact links. Usage: NODE_PATH=/path/to/node_modules node test/pagetargets.js [base-url]
const puppeteer = require('puppeteer-core');
const BASE = process.argv[2] || 'http://localhost:8765/';
const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) process.exitCode = 1; };
const UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1';
const SEL = '.bp .sub a, .bp-links a, .snip-h .clear, .bp-actions .get, .bp-actions .app, .bp-more a';
(async () => {
  const b = await puppeteer.launch({ executablePath: '/usr/bin/google-chrome', headless: 'new', args: ['--no-sandbox'] });
  const errs = [];
  async function measure(path, w) {
    const p = await b.newPage(); p.on('pageerror', (e) => errs.push(e.message));
    const mob = w < 700;
    await p.setViewport({ width: w, height: 900, isMobile: mob, hasTouch: mob });
    if (mob) await p.setUserAgent(UA);
    await p.setRequestInterception(true);
    p.on('request', (r) => (/google-analytics|googletagmanager|\/_vercel\/|\/api\//.test(r.url()) ? r.abort() : r.continue()));
    await p.goto(new URL(path, BASE).href, { waitUntil: 'networkidle0' });
    const r = await p.evaluate((SEL) => {
      const els = [...document.querySelectorAll(SEL)].filter((e) => e.checkVisibility());
      const hs = els.map((e) => [e.textContent.trim().slice(0, 24), Math.round(e.getBoundingClientRect().height)]);
      const s = document.querySelector('.bp .sub');
      return { n: els.length, small: hs.filter((h) => h[1] < 44), linkH: hs.filter((h) => h[0] && document.querySelector('.bp-links a')).map((h) => h[1]), bpl: Math.round(document.querySelector('.bp-links a').getBoundingClientRect().height), clip: s.scrollHeight - s.clientHeight, sw: document.documentElement.scrollWidth, iw: innerWidth };
    }, SEL);
    // round 2 #4: meta line flush with the title, bookmark count on its own line on phones, vote count always a number
    r.meta = await p.evaluate(() => {
      const s = document.querySelector('.bp .sub'), h = document.querySelector('.bp-head h1'), bm = s.querySelector(':scope > span[title]'), a = s.querySelector('a');
      return { flush: Math.round(s.getBoundingClientRect().left - h.getBoundingClientRect().left), bmOwnLine: bm ? bm.getBoundingClientRect().top >= a.getBoundingClientRect().bottom - 8 && Math.abs(bm.getBoundingClientRect().left - a.getBoundingClientRect().left) < 2 : null,
        vn: (document.querySelector('.bp-vote .vn') || {}).textContent };
    });
    await p.close(); return r;
  }
  for (const path of ['/bot/coach/', '/bot/cancer-caregiver-hub/', '/bot/afterglow/', '/@phil_holland/']) {
    const m = await measure(path, 390);
    ok(m.n >= 4 && m.small.length === 0, `390 ${path}: ${m.n} page links and buttons are at least 44px tall` + (m.small.length ? ` (small: ${m.small.map((x) => x.join(' ')).join('; ')})` : ''));
    ok(m.clip <= 0, `390 ${path}: the header line is not clipped (${m.clip}px hidden)`);
    ok(m.sw <= m.iw, `390 ${path}: no sideways overflow (${m.sw})`);
    ok(m.meta.flush === 0 && m.meta.bmOwnLine !== false && (path.startsWith('/@') || m.meta.vn === '0'), `390 ${path}: meta line flush with the title (${m.meta.flush}px), bookmarks on their own line (${m.meta.bmOwnLine}), vote count shown (${JSON.stringify(m.meta.vn)})`);
    const d = await measure(path, 1280);
    ok(d.bpl < 30 && d.clip <= 0, `1280 ${path}: desktop page links stay compact (${d.bpl}px) and the header line is not clipped`);
  }
  ok(errs.length === 0, 'no page errors' + (errs.length ? ': ' + errs.join(' | ') : ''));
  await b.close();
})().catch((e) => { console.error(e); process.exit(1); });
