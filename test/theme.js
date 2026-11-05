const puppeteer = require('puppeteer-core');
const BASE = process.argv[2] || 'http://localhost:8765/';
const SHOTS = process.argv[3]; // optional folder for header screenshots
const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) process.exitCode = 1; };
(async () => {
  const TOTAL = (await (await fetch(new URL('bots.json', BASE))).json()).length;
  const b = await puppeteer.launch({ executablePath: process.env.CHROME || '/usr/bin/google-chrome', headless: 'new', args: ['--no-sandbox'] });
  const ctx = await b.createBrowserContext(); const p = await ctx.newPage();
  await p.setViewport({ width: 390, height: 844, deviceScaleFactor: 3 });
  await p.emulateMediaFeatures([{ name: 'prefers-color-scheme', value: 'light' }]);
  const st = () => p.evaluate(() => ({ theme: document.documentElement.dataset.theme, bg: getComputedStyle(document.body).backgroundColor,
    meta: document.querySelector('meta[name="theme-color"]').content, cs: document.querySelector('meta[name="color-scheme"]').content,
    pressed: document.querySelector('#theme').getAttribute('aria-pressed'), cards: document.querySelectorAll('#results .card:not([id^="f-"])').length, count: document.querySelector('#count').textContent }));
  // First visit (nothing saved) follows the OS scheme, before first paint: system light -> light, system dark -> dark
  await p.goto(BASE + '?t=' + Date.now(), { waitUntil: 'networkidle0' });
  let s = await st();
  ok(s.theme === 'light' && s.bg === 'rgb(255, 255, 255)' && s.meta === '#ffffff' && s.cs === 'light' && s.pressed === 'false', 'first load with system light is light: ' + JSON.stringify(s));
  ok(await p.evaluate(() => localStorage.getItem('theme')) === null, 'following the OS saves nothing');
  await p.emulateMediaFeatures([{ name: 'prefers-color-scheme', value: 'dark' }]);
  await new Promise(r => setTimeout(r, 200));
  s = await st();
  ok(s.theme === 'dark' && s.bg === 'rgb(0, 0, 0)' && s.meta === '#000000' && s.cs === 'dark' && s.pressed === 'true', 'an OS change to dark is followed while nothing is saved: ' + JSON.stringify(s));
  await p.reload({ waitUntil: 'networkidle0' });
  s = await st();
  ok(s.theme === 'dark' && s.bg === 'rgb(0, 0, 0)' && s.meta === '#000000' && s.cs === 'dark' && s.pressed === 'true', 'first load with system dark is dark: ' + JSON.stringify(s));
  // the home view caps long creator groups at 3 cards (Featured), so check the count line and that nothing is missing beyond the cap
  ok(s.cards > 0 && s.cards <= TOTAL && s.count === `${TOTAL} bots`, `${TOTAL} bots (${s.cards} cards on the home view)`);
  if (SHOTS) await p.screenshot({ path: SHOTS + '/header-390-dark.png', clip: { x: 0, y: 0, width: 390, height: 260 } });
  await p.click('#theme'); await new Promise(r => setTimeout(r, 400));
  s = await st();
  ok(s.theme === 'light' && s.bg === 'rgb(255, 255, 255)' && s.meta === '#ffffff' && s.cs === 'light' && s.pressed === 'false', 'toggle -> light: ' + JSON.stringify(s));
  ok(await p.evaluate(() => localStorage.getItem('theme')) === 'light', 'the toggle saves theme=light as before');
  await p.reload({ waitUntil: 'networkidle0' });
  s = await st();
  ok(s.theme === 'light' && s.bg === 'rgb(255, 255, 255)', 'reload stays light (saved choice beats system dark): ' + JSON.stringify(s));
  await p.emulateMediaFeatures([{ name: 'prefers-color-scheme', value: 'light' }]);
  await new Promise(r => setTimeout(r, 200));
  if (SHOTS) await p.screenshot({ path: SHOTS + '/header-390-light.png', clip: { x: 0, y: 0, width: 390, height: 260 } });
  await p.click('#theme'); await new Promise(r => setTimeout(r, 300));
  await p.reload({ waitUntil: 'networkidle0' });
  ok((await st()).theme === 'dark', 'toggle back to dark persists (saved choice beats system light)');
  await p.emulateMediaFeatures([{ name: 'prefers-color-scheme', value: 'dark' }]);
  await new Promise(r => setTimeout(r, 200));
  ok((await st()).theme === 'dark', 'an OS change is ignored once a choice is saved');
  await p.emulateMediaFeatures([{ name: 'prefers-color-scheme', value: 'light' }]);
  // Bot, creator and 404 pages have the same toggle, sharing the saved choice with the home page (round 2 #3)
  for (const path of ['bot/archivist', '@phil_holland', 'bot/no-such-bot-zz']) {
    await p.goto(BASE + path, { waitUntil: 'networkidle0' });
    const sub = () => p.evaluate(() => ({ theme: document.documentElement.dataset.theme, meta: document.querySelector('meta[name="theme-color"]').content,
      pressed: (document.querySelector('#theme') || { getAttribute: () => null }).getAttribute('aria-pressed') }));
    const a = await sub();
    await p.click('#theme'); await new Promise(r => setTimeout(r, 200));
    const c = await sub();
    await p.reload({ waitUntil: 'networkidle0' });
    const d = await sub();
    await p.click('#theme'); await new Promise(r => setTimeout(r, 200));
    ok(a.theme === 'dark' && a.pressed === 'true' && c.theme === 'light' && c.meta === '#ffffff' && c.pressed === 'false' && d.theme === 'light', `/${path}: theme toggle switches and persists (${JSON.stringify([a, c, d])})`);
  }
  await b.close();
})();
