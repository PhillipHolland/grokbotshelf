const puppeteer = require('puppeteer-core');
const BASE = process.argv[2] || 'http://localhost:8765/';
const SHOTS = process.argv[3]; // optional folder for header screenshots
const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) process.exitCode = 1; };
(async () => {
  const TOTAL = (await (await fetch(new URL('bots.json', BASE))).json()).length;
  const b = await puppeteer.launch({ executablePath: '/usr/bin/google-chrome', headless: 'new', args: ['--no-sandbox'] });
  const ctx = await b.createBrowserContext(); const p = await ctx.newPage();
  await p.setViewport({ width: 390, height: 844, deviceScaleFactor: 3 });
  await p.emulateMediaFeatures([{ name: 'prefers-color-scheme', value: 'light' }]);
  const st = () => p.evaluate(() => ({ theme: document.documentElement.dataset.theme, bg: getComputedStyle(document.body).backgroundColor,
    meta: document.querySelector('meta[name="theme-color"]').content, cs: document.querySelector('meta[name="color-scheme"]').content,
    pressed: document.querySelector('#theme').getAttribute('aria-pressed'), cards: document.querySelectorAll('#results .card:not([id^="f-"])').length, count: document.querySelector('#count').textContent }));
  await p.goto(BASE + '?t=' + Date.now(), { waitUntil: 'networkidle0' });
  let s = await st();
  ok(s.theme === 'dark' && s.bg === 'rgb(0, 0, 0)' && s.meta === '#000000' && s.cs === 'dark' && s.pressed === 'true', 'first load is dark even with system light: ' + JSON.stringify(s));
  // the home view caps long creator groups at 3 cards (Featured), so check the count line and that nothing is missing beyond the cap
  ok(s.cards > 0 && s.cards <= TOTAL && s.count === `${TOTAL} bots`, `${TOTAL} bots (${s.cards} cards on the home view)`);
  if (SHOTS) await p.screenshot({ path: SHOTS + '/header-390-dark.png', clip: { x: 0, y: 0, width: 390, height: 260 } });
  await p.click('#theme'); await new Promise(r => setTimeout(r, 400));
  s = await st();
  ok(s.theme === 'light' && s.bg === 'rgb(255, 255, 255)' && s.meta === '#ffffff' && s.cs === 'light' && s.pressed === 'false', 'toggle -> light: ' + JSON.stringify(s));
  await p.reload({ waitUntil: 'networkidle0' });
  s = await st();
  ok(s.theme === 'light' && s.bg === 'rgb(255, 255, 255)', 'reload stays light: ' + JSON.stringify(s));
  if (SHOTS) await p.screenshot({ path: SHOTS + '/header-390-light.png', clip: { x: 0, y: 0, width: 390, height: 260 } });
  await p.click('#theme'); await new Promise(r => setTimeout(r, 300));
  await p.reload({ waitUntil: 'networkidle0' });
  ok((await st()).theme === 'dark', 'toggle back to dark persists');
  // The swap is instant: no CSS transitions start on the click, and the helper class is gone a few frames later
  const swap = await p.evaluate(() => new Promise((res) => {
    const tr = () => document.getAnimations().filter((a) => a instanceof CSSTransition).length;
    document.querySelector('#theme').click();
    const now = { n: tr(), bg: getComputedStyle(document.body).backgroundColor };
    requestAnimationFrame(() => requestAnimationFrame(() => requestAnimationFrame(() => res({ ...now, later: tr(), swapClass: document.documentElement.classList.contains('theme-swap') }))));
  }));
  ok(swap.n === 0 && swap.later === 0 && swap.bg === 'rgb(255, 255, 255)' && !swap.swapClass, 'theme swap runs no transitions and lands in one frame: ' + JSON.stringify(swap));
  await p.click('#theme');
  await b.close();
})();
