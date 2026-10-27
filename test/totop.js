// Jump to top (public/shelf-up.js, .gbs-up): hidden at the top and on short pages, shows after ~500px of scroll on home, bot and creator pages,
// scrolls to the top (instantly with reduced motion), keyboard focus lands on the h1, and it clears the A-Z rail
// (on phones it sits left of the letter strip, well above iOS Safari's floating URL bar).
// Usage: NODE_PATH=/path/to/node_modules node test/totop.js [base-url]
const puppeteer = require('puppeteer-core');
const BASE = process.argv[2] || 'http://localhost:8765/';
const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) process.exitCode = 1; };
const settle = (ms = 400) => new Promise(r => setTimeout(r, ms));
const state = (p) => p.evaluate(() => { const b = document.querySelector('.gbs-up'); if (!b) return null; const s = getComputedStyle(b), r = b.getBoundingClientRect();
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
      ok(s && !s.shown && s.tab === -1 && s.label === 'Jump to top', `${name} /${path}: present, hidden and unfocusable at the top`);
      if (tall < 520) { await p.evaluate(() => scrollTo(0, 1e6)); await settle(); s = await state(p); ok(!s.shown, `${name} /${path}: short page (${tall}px) never shows it`); continue; }
      if (name === 'phone') {
        // touch: hidden while scrolling down, shown after a scroll back up (round 3 #4), hidden again on the next scroll down
        await p.evaluate(() => scrollTo(0, 700)); await settle(); s = await state(p);
        ok(!s.shown, `${name} /${path}: still hidden after scrolling down 700px`);
        await p.evaluate(() => scrollTo(0, 600)); await settle(); s = await state(p);
        ok(s.shown && s.tab === 0, `${name} /${path}: shows after a 100px scroll back up`);
        if (tall > 900) { await p.evaluate(() => scrollTo(0, 800)); await settle(); const h = await state(p); ok(!h.shown, `${name} /${path}: hides again on the next scroll down`);
          await p.evaluate(() => scrollTo(0, 600)); await settle(); s = await state(p); }
      } else { await p.evaluate(() => scrollTo(0, 600)); await settle(); s = await state(p); }
      ok(s.shown && s.tab === 0, `${name} /${path}: shows after 600px`);
      ok(s.r.ri <= s.vw - 4 && s.r.b <= s.vh - 12 && s.r.l > s.vw / 2, `${name} /${path}: bottom-right (${Math.round(s.r.l)},${Math.round(s.r.t)})`);
      const rail = await p.evaluate(() => { const r = document.querySelector('.rail:not([hidden])'); if (!r) return null; const bs = [...r.querySelectorAll('button')].map(x => x.getBoundingClientRect()); return { l: Math.min(...bs.map(x => x.left)), b: r.getBoundingClientRect().bottom }; });
      if (rail != null && name === 'phone') ok(s.r.ri <= rail.l, `${name} /${path}: sits left of the A-Z rail (button right ${Math.round(s.r.ri)} <= rail left ${Math.round(rail.l)})`);
      if (rail != null && name === 'desktop') ok(rail.b <= s.r.t, `${name} /${path}: A-Z rail ends above the button (${Math.round(rail.b)} <= ${Math.round(s.r.t)})`);
      if (name === 'phone') ok(s.vh - s.r.b >= 118, `${name} /${path}: lifted clear of iOS Safari's floating URL bar (${Math.round(s.vh - s.r.b)}px >= 118)`);
      if (name === 'phone') ok(await p.evaluate(() => { const b = document.querySelector('.gbs-up'); return b.style.opacity === '1' && b.style.visibility === 'visible' && /px/.test(b.style.bottom) && document.documentElement.dataset.totop === '1'; }), `${name} /${path}: inline opacity/visibility/bottom set by place(), html[data-totop=1]`);
      const top = await p.evaluate(() => { const r = document.querySelector('.gbs-up').getBoundingClientRect(); const e = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2); return e && e.closest('.gbs-up') ? 1 : 0; });
      ok(top === 1, `${name} /${path}: nothing paints over the button (hit test lands on it)`);
      ok(await p.evaluate(() => !document.querySelector('.gbs-up').hasAttribute('hidden')), `${name} /${path}: no hidden attribute (visibility is .show only)`);
      const z = await p.evaluate(() => { const r = document.querySelector('.rail'); return [+getComputedStyle(document.querySelector('.gbs-up')).zIndex, r ? +getComputedStyle(r).zIndex : 0]; });
      ok(z[0] > z[1] && z[0] < 50, `${name} /${path}: z-index ${z[0]} above the rail (${z[1]}), below the toast (50)`);
      await p.click('.gbs-up'); await settle(1200);
      s = await state(p);
      ok(s.y === 0 && !s.shown, `${name} /${path}: click scrolls to top and hides it`);
    }
  }
  // Simulated iOS content blocker: every generic top/scroll rule from Fanboy's Annoyance List as display:none.
  // The old .to-top / aria-label="Back to top" button was hidden by these on Phillip's iPhone.
  const sels = require('fs').readFileSync(require('path').join(__dirname, 'blocker-annoyances.txt'), 'utf8').split('\n').filter(l => l.startsWith('##')).map(l => l.slice(2));
  await p.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true });
  await p.goto(BASE, { waitUntil: 'networkidle0' }); await settle();
  const blocked = await p.evaluate((sels) => { const st = document.createElement('style'); let bad = 0;
    st.textContent = sels.map(x => { try { document.querySelector(x); return x + '{display:none!important}'; } catch (_) { bad++; return ''; } }).join('\n'); document.head.appendChild(st);
    scrollTo(0, 1600); return new Promise(r => setTimeout(() => { scrollTo(0, 1500); setTimeout(r, 300); })).then(() => new Promise(r => setTimeout(() => { const b = document.querySelector('.gbs-up'), cs = getComputedStyle(b), rc = b.getBoundingClientRect();
      const ac = getComputedStyle(b, '::after'), tap = ac.content === 'none' ? rc.width : rc.width - parseFloat(ac.left) - parseFloat(ac.right), tapH = ac.content === 'none' ? rc.height : rc.height - parseFloat(ac.top) - parseFloat(ac.bottom);
      r({ n: sels.length - bad, disp: cs.display, vis: cs.visibility, w: Math.round(tap), h: Math.round(tapH), hit: (document.elementFromPoint(rc.left + rc.width / 2, rc.top + rc.height / 2) || {}).closest?.('.gbs-up') ? 1 : 0 }); }, 500))); }, sels);
  ok(blocked.disp !== 'none' && blocked.vis === 'visible' && blocked.w >= 44 && blocked.h >= 44 && blocked.hit, `content blocker (${blocked.n} Fanboy annoyance rules): button still shown with a 44px tap (${blocked.disp}, ${blocked.vis}, ${blocked.w}x${blocked.h}px tap, hit ${blocked.hit})`);
  await p.setViewport({ width: 1280, height: 800 });
  await p.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'reduce' }]);
  await p.goto(new URL('@poteto', BASE).href, { waitUntil: 'networkidle0' });
  await p.goto(BASE, { waitUntil: 'networkidle0' }); await settle();
  await p.evaluate(() => scrollTo(0, 2000)); await settle();
  await p.focus('.gbs-up'); await p.keyboard.press('Enter');
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
