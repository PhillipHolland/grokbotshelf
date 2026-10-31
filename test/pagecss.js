// Perf round 6 #5: bot and creator pages inline a pruned copy of styles.css instead of linking it. The pruned CSS must
// style every element exactly like the full stylesheet: same computed style for every element and ::before/::after,
// in dark and light, at 390 and 1280, on load, scrolled (back-to-top pill), with a toast up and a hovered button.
// Usage: NODE_PATH=/path/to/node_modules node test/pagecss.js [base-url]
const puppeteer = require('puppeteer-core');
const fs = require('fs'), path = require('path');
const BASE = process.argv[2] || 'http://localhost:8765/';
const PUB = path.join(__dirname, '..', 'public');
const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) process.exitCode = 1; };
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const bots = fs.readdirSync(path.join(PUB, 'bot')).sort();
const creators = fs.readdirSync(PUB).filter((f) => f.startsWith('@') && !f.endsWith('.html')).sort();
const size = (f) => fs.statSync(path.join(PUB, f)).size;
const bigC = creators.slice().sort((a, b) => fs.readFileSync(path.join(PUB, b, 'index.html')).length - fs.readFileSync(path.join(PUB, a, 'index.html')).length)[0];
const pages = process.env.ONLY ? process.env.ONLY.split(',') : [...new Set(['bot/' + bots[0], 'bot/' + bots[bots.length - 1], 'bot/' + bots[Math.floor(bots.length / 2)], 'bot/' + bots[Math.floor(bots.length / 3)], bigC, creators[0], creators[creators.length - 1],
  ...fs.readdirSync(PUB).filter((f) => /^@.*\.html$/.test(f)).slice(0, 1).map((f) => f.replace(/\.html$/, ''))])];
(async () => {
  // static checks: inlined, no stylesheet request, smaller than styles.css
  const full = fs.readFileSync(path.join(PUB, 'styles.css'), 'utf8');
  for (const pg of pages.slice(0, 3).concat(bigC)) {
    const h = fs.readFileSync(path.join(PUB, pg, 'index.html'), 'utf8');
    const m = h.match(/<style>([^<]{1000,})<\/style>/);
    ok(m && !/rel="stylesheet"/.test(h) && m[1].length < full.length * 0.6, `/${pg}: CSS inlined (${m && m[1].length} B vs ${full.length} B styles.css), no stylesheet link`);
  }
  for (const f of ['index.html', '404.html', 'add/index.html']) ok(/<link rel="stylesheet" href="\/styles\.css\?v=/.test(fs.readFileSync(path.join(PUB, f), 'utf8')), `/${f} still links the full stylesheet`);
  const b = await puppeteer.launch({ executablePath: '/usr/bin/google-chrome', headless: 'new', args: ['--no-sandbox'] });
  const errs = [];
  const snap = (p) => p.evaluate(() => {
    const out = [], els = [document.documentElement, ...document.querySelectorAll('body, body *')];
    for (const [i, e] of els.entries()) for (const ps of [null, '::before', '::after']) {
      const s = getComputedStyle(e, ps); if (ps && s.content === 'none') continue;
      const t = []; for (let k = 0; k < s.length; k++) t.push(s[k] + ':' + s.getPropertyValue(s[k]));
      t.sort(); // custom properties come back in no fixed order
      out.push(i + (ps || '') + ' ' + e.nodeName + '.' + (e.getAttribute('class') || '') + ' ' + t.join(';'));
    }
    return out;
  });
  const states = async (p, vp) => {
    const r = { load: await snap(p) };
    await p.evaluate(() => scrollTo(0, document.documentElement.scrollHeight)); await wait(500);
    r.scrolled = await snap(p);
    const btn = await p.$('[data-copy]');
    if (btn) { await p.evaluate((x) => x.click(), btn); await wait(150); r.toast = await snap(p); }
    await p.evaluate(() => scrollTo(0, 0)); await wait(300);
    if (!vp.isMobile) { const a = await p.$('.bp-actions a, .cp-cats a, .bp-links a'); if (a) { await a.hover(); await wait(300); r.hover = await snap(p); } }
    return r;
  };
  let n = 0;
  for (const theme of ['dark', 'light']) for (const [label, vp] of [['390', { width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true }], ['1280', { width: 1280, height: 800 }]]) for (const pg of pages) {
    const res = [];
    for (const variant of ['inline', 'full']) {
      const p = await b.newPage(); p.on('pageerror', (e) => errs.push(pg + ': ' + e.message));
      await p.setViewport(vp);
      await p.evaluateOnNewDocument((t) => { try { localStorage.setItem('theme', t); } catch (e) {} document.addEventListener('copy', (e) => e.preventDefault()); }, theme);
      await p.setRequestInterception(true);
      p.on('request', async (r) => {
        if (/google-analytics|googletagmanager|\/_vercel\/|\/api\//.test(r.url())) return r.abort();
        if (variant === 'full' && r.isNavigationRequest()) {
          const resp = await fetch(r.url()); const h = await resp.text();
          return r.respond({ status: resp.status, contentType: 'text/html', body: h.replace(/<style>[^<]{1000,}<\/style>/, '<link rel="stylesheet" href="/styles.css">') });
        }
        r.continue();
      });
      await p.goto(BASE + pg, { waitUntil: 'networkidle0' }); await wait(200);
      res.push(await states(p, vp));
      await p.close();
    }
    const [a, f] = res; let diffs = [];
    for (const k of Object.keys(f)) { if (!a[k]) { diffs.push(k + ': missing'); continue; } for (let i = 0; i < Math.max(a[k].length, f[k].length); i++) if (a[k][i] !== f[k][i]) { const A = new Set((a[k][i] || '').split(';')), F = (f[k][i] || '').split(';'); diffs.push(k + ': [' + (f[k][i] || '').split(' ').slice(0, 2).join(' ') + '|' + (a[k][i] || '').split(' ').slice(0, 2).join(' ') + '] ' + F.filter((x) => !A.has(x)).join(';').slice(0, 160) + ' vs ' + [...A].filter((x) => !F.includes(x)).join(';').slice(0, 160)); break; } }
    n += Object.values(a).reduce((s, x) => s + x.length, 0);
    ok(!diffs.length, `${theme} ${label} /${pg}: computed styles identical to the full stylesheet (${Object.keys(f).join(', ')})${diffs.length ? ' — ' + diffs.join(' | ') : ''}`);
  }
  console.log(`(${n} element styles compared)`);
  ok(!errs.length, 'no page errors' + (errs.length ? ': ' + errs.join(' | ') : ''));
  await b.close();
})();
