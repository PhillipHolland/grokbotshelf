// Back to top: hidden at the top and on short pages, shows after ~500px of scroll on home, bot and creator pages,
// scrolls to the top (instantly with reduced motion), keyboard focus lands on the h1, and it clears the A-Z rail.
// Usage: NODE_PATH=/path/to/node_modules node test/totop.js [base-url]
const puppeteer = require('puppeteer-core');
const BASE = process.argv[2] || 'http://localhost:8765/';
const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) process.exitCode = 1; };
const settle = (ms = 400) => new Promise(r => setTimeout(r, ms));
const state = (p) => p.evaluate(() => { const b = document.querySelector('.to-top'); if (!b) return null; const s = getComputedStyle(b), r = b.getBoundingClientRect();
  return { shown: b.classList.contains('show') && s.visibility === 'visible', tab: b.tabIndex, label: b.getAttribute('aria-label'), r: { l: r.left, t: r.top, b: r.bottom, ri: r.right }, y: scrollY, vw: innerWidth, vh: innerHeight }; });
(async () => {
  const b = await puppeteer.launch({ executablePath: '/usr/bin/google-chrome', headless: 'new', args: ['--no-sandbox'] });
  const p = await b.newPage();
  for (const [name, vp] of [['desktop', { width: 1280, height: 800 }], ['phone', { width: 390, height: 844, isMobile: true, hasTouch: true }]]) {
    await p.setViewport(vp);
    for (const path of ['', 'bot/3d-maker', '@poteto']) {
      await p.goto(new URL(path, BASE).href, { waitUntil: 'networkidle0' }); await settle();
      const tall = await p.evaluate(() => document.documentElement.scrollHeight - innerHeight);
      let s = await state(p);
      ok(s && !s.shown && s.tab === -1 && s.label === 'Back to top', `${name} /${path}: present, hidden and unfocusable at the top`);
      if (tall < 520) { await p.evaluate(() => scrollTo(0, 1e6)); await settle(); s = await state(p); ok(!s.shown, `${name} /${path}: short page (${tall}px) never shows it`); continue; }
      await p.evaluate(() => scrollTo(0, 600)); await settle();
      s = await state(p);
      ok(s.shown && s.tab === 0, `${name} /${path}: shows after 600px`);
      ok(s.r.ri <= s.vw - 4 && s.r.b <= s.vh - 12 && s.r.l > s.vw / 2, `${name} /${path}: bottom-right (${Math.round(s.r.l)},${Math.round(s.r.t)})`);
      const rail = await p.evaluate(() => { const r = document.querySelector('.rail:not([hidden])'); return r && r.getBoundingClientRect().bottom; });
      if (rail != null) ok(rail <= s.r.t, `${name} /${path}: A-Z rail ends above the button (${Math.round(rail)} <= ${Math.round(s.r.t)})`);
      await p.click('.to-top'); await settle(1200);
      s = await state(p);
      ok(s.y === 0 && !s.shown, `${name} /${path}: click scrolls to top and hides it`);
    }
  }
  await p.setViewport({ width: 1280, height: 800 });
  await p.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'reduce' }]);
  await p.goto(new URL('@poteto', BASE).href, { waitUntil: 'networkidle0' });
  await p.goto(BASE, { waitUntil: 'networkidle0' }); await settle();
  await p.evaluate(() => scrollTo(0, 2000)); await settle();
  await p.focus('.to-top'); await p.keyboard.press('Enter');
  const y = await p.evaluate(() => scrollY), focus = await p.evaluate(() => document.activeElement && document.activeElement.tagName);
  ok(y === 0, `reduced motion: Enter jumps to the top at once (scrollY ${y})`);
  ok(focus === 'H1', `keyboard: focus moves to the h1 (${focus})`);
  for (const theme of ['dark', 'light']) {
    await p.evaluate((t) => { localStorage.setItem('theme', t); }, theme);
    await p.goto(new URL('bot/3d-maker', BASE).href, { waitUntil: 'networkidle0' });
    await p.evaluate(() => scrollTo(0, 1e6)); await settle();
    const tall = await p.evaluate(() => document.documentElement.scrollHeight - innerHeight);
    if (tall > 520) await p.screenshot({ path: `/tmp/totop-${theme}.png` });
  }
  await b.close();
})();
