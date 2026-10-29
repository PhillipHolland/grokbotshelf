// Vote counts look the same quiet way everywhere: Top voted, creator tiles, shelf cards and the bot page show muted text
// (--vmuted) with a thin arrow and no fill, pass 4.5:1 in both themes, sit in fixed-width slots that do not move when the
// counts land (inside their card or row: the home Top voted strip itself still arrives with the scores), and the vote buttons stay at least 24px to tap. /api/votes is mocked in the browser.
// Usage: NODE_PATH=/path/to/node_modules node test/votestyle.js [base-url]
const puppeteer = require('puppeteer-core');
const BASE = process.argv[2] || 'http://localhost:8765/';
const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) process.exitCode = 1; };
const UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1';
const VOTES = { global: true, scores: { 'bot-archivist': { up: 130, down: 7, score: 123 }, 'bot-security-audit-bot': { up: 4, down: 1, score: 3 }, 'bot-coach': { up: 1, down: 4, score: -3 },
  'bot-terminal-boss': { up: 9, down: 0, score: 9 }, 'bot-imessage-relay': { up: 12, down: 0, score: 12 }, 'bot-botbagger': { up: 1, down: 0, score: 1 } } };
// Where each count lives: the selector, the slot width it keeps, and whether it carries the 12px arrow
const SPOTS = { top: ['.topvotes:not(.newv) .tlist .sc', 48, true], tile: ['.cp-sc', 44, true], card: ['.card .vote .vn', 24, false], bot: ['.bp-vote .vn', 30, false] };
(async () => {
  const b = await puppeteer.launch({ executablePath: '/usr/bin/google-chrome', headless: 'new', args: ['--no-sandbox'] });
  const errs = [];
  async function open(path, w, theme) {
    const p = await b.newPage(); p.on('pageerror', (e) => errs.push(path + ': ' + e.message));
    const mob = w < 700;
    await p.setViewport({ width: w, height: mob ? 844 : 900, isMobile: mob, hasTouch: mob }); if (mob) await p.setUserAgent(UA);
    await p.evaluateOnNewDocument((t) => { try { localStorage.setItem('theme', t); localStorage.setItem('shelfer-sheet', '{"v":1,"how":"test"}'); } catch (e) {}
      window.__cls = 0; new PerformanceObserver((l) => l.getEntries().forEach((e) => { if (!e.hadRecentInput) window.__cls += e.value; })).observe({ type: 'layout-shift', buffered: true }); }, theme);
    await p.setRequestInterception(true);
    p.on('request', (r) => { const u = r.url();
      if (/google-analytics|googletagmanager|\/_vercel\//.test(u)) return r.abort();
      if (/\/api\/votes/.test(u) && r.method() === 'GET') return setTimeout(() => r.respond({ status: 200, contentType: 'application/json', body: JSON.stringify(VOTES) }).catch(() => {}), 1200);
      if (/\/api\//.test(u)) return r.abort(); r.continue(); });
    await p.goto(new URL(path, BASE).href, { waitUntil: 'domcontentloaded' });
    return p;
  }
  const look = (p, sel) => p.evaluate((sel) => {
    const rgb = (s) => { const m = s.match(/[\d.]+/g).map(Number); return { r: m[0], g: m[1], b: m[2], a: m[3] === undefined ? 1 : m[3] }; };
    const lum = (c) => [c.r, c.g, c.b].map((v) => { v /= 255; return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }).reduce((a, v, i) => a + v * [0.2126, 0.7152, 0.0722][i], 0);
    const bgOf = (e) => { const ls = []; for (let n = e; n && n.nodeType === 1; n = n.parentElement) { const c = rgb(getComputedStyle(n).backgroundColor); if (c.a > 0) { ls.push(c); if (c.a >= 1) break; } }
      let base = ls.length && ls[ls.length - 1].a >= 1 ? { r: 0, g: 0, b: 0 } : rgb(getComputedStyle(document.documentElement).backgroundColor);
      for (const c of ls.reverse()) base = { r: c.r * c.a + base.r * (1 - c.a), g: c.g * c.a + base.g * (1 - c.a), b: c.b * c.a + base.b * (1 - c.a) }; return base; };
    const ratio = (e) => { const f = rgb(getComputedStyle(e).color), bg = bgOf(e), a = lum(f), c = lum(bg); return (Math.max(a, c) + 0.05) / (Math.min(a, c) + 0.05); };
    const muted = (() => { const i = document.createElement('i'); i.style.color = 'var(--vmuted)'; document.body.appendChild(i); const c = getComputedStyle(i).color; i.remove(); return c; })();
    return [...document.querySelectorAll(sel)].filter((e) => e.offsetParent).slice(0, 12).map((e) => { const cs = getComputedStyle(e), r = e.getBoundingClientRect(), svg = e.querySelector('svg'), sv = svg && getComputedStyle(svg);
      return { t: e.textContent.replace(/\D*$/, '').trim(), cr: +ratio(e).toFixed(2), muted: cs.color === muted, fill: rgb(cs.backgroundColor).a === 0, fs: cs.fontSize, fw: cs.fontWeight, w: Math.round(r.width), pos: (() => { const box = (e.closest('.card') || e.parentElement).getBoundingClientRect(); return [Math.round(r.left - box.left), Math.round(r.top - box.top), Math.round(r.right - box.left)].join(','); })(),
        svg: sv ? [Math.round(svg.getBoundingClientRect().width), sv.strokeWidth].join('/') : '' }; }); }, sel);
  for (const [w, theme] of [[390, 'dark'], [1280, 'light'], [390, 'light'], [1280, 'dark']]) {
    for (const [path, spots] of [['/', ['top', 'card']], ['/@phil_holland', ['tile']], ['/bot/archivist', ['bot']]]) {
      const p = await open(path, w, theme);
      await new Promise((x) => setTimeout(x, 600));
      const before = {}; for (const k of spots) before[k] = await look(p, SPOTS[k][0]);
      await p.waitForFunction(() => [...document.querySelectorAll('.vn, .cp-sc .n')].some((e) => e.textContent !== '0'), { timeout: 8000 }).catch(() => {});
      await new Promise((x) => setTimeout(x, 500));
      for (const k of spots) {
        const [sel, slot, arrow] = SPOTS[k], a = await look(p, sel);
        const style = a.length > 0 && a.every((x) => x.muted && x.fill && x.fs === '13px' && x.fw === '600' && (!arrow || x.svg === '12/1.75px'));
        ok(style, `${w} ${theme} ${path} ${k}: muted 13px/600 text, no fill${arrow ? ', 12px arrow at 1.75' : ''} (${a.length} shown, e.g. ${JSON.stringify(a[0])})`);
        const minCr = Math.min(...a.map((x) => x.cr));
        ok(a.length > 0 && minCr >= 4.5, `${w} ${theme} ${path} ${k}: counts pass 4.5:1 (lowest ${minCr})`);
        ok(a.length > 0 && a.every((x) => x.w === slot) && a.some((x) => x.t !== '0'), `${w} ${theme} ${path} ${k}: every count sits in a ${slot}px slot (${[...new Set(a.map((x) => x.w))]}) with real scores in (${a.slice(0, 6).map((x) => x.t)})`);
        if (before[k].length) { const moved = before[k].filter((x, i) => a[i] && x.pos !== a[i].pos).length; ok(moved === 0, `${w} ${theme} ${path} ${k}: no count slot moved when the scores landed (${moved} moved)`); }
      }
      if (path !== '/') ok((await p.evaluate(() => window.__cls)) < 0.001, `${w} ${theme} ${path}: CLS ${(await p.evaluate(() => window.__cls)).toFixed(4)} while the counts land`);
      if (spots.includes('card') || spots.includes('bot')) {
        const tap = await p.evaluate(() => [...document.querySelectorAll('.vote .vb')].filter((e) => e.offsetParent).slice(0, 20).map((e) => { const r = e.getBoundingClientRect(); return Math.min(r.width, r.height); }));
        ok(tap.length > 0 && Math.min(...tap) >= 24, `${w} ${theme} ${path}: vote buttons at least 24px to tap (smallest ${Math.min(...tap)}px)`);
      }
      await p.close();
    }
  }
  ok(errs.length === 0, 'no page errors' + (errs.length ? ': ' + errs.join(' | ') : ''));
  await b.close();
})().catch((e) => { console.error(e); process.exit(1); });
