const puppeteer = require('puppeteer-core');
const BASE = process.argv[2] || 'http://localhost:8765/';
const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) process.exitCode = 1; };
(async () => {
  const b = await puppeteer.launch({ executablePath: '/usr/bin/google-chrome', headless: 'new', args: ['--no-sandbox'] });
  const p = await (await b.createBrowserContext()).newPage();
  await p.setViewport({ width: 390, height: 844, deviceScaleFactor: 3, isMobile: true });
  await p.emulateMediaFeatures([{ name: 'prefers-color-scheme', value: 'light' }]);
  const s = () => p.evaluate(() => ({ html: getComputedStyle(document.documentElement).backgroundColor, body: getComputedStyle(document.body).backgroundColor,
    rootScheme: getComputedStyle(document.documentElement).colorScheme, metas: [...document.querySelectorAll('meta[name="theme-color"]')].map(m => m.content + (m.media ? ' @' + m.media : '')),
    topEl: (() => { const e = document.elementFromPoint(5, 1); return e.tagName + '.' + e.className + ' ' + getComputedStyle(e).backgroundColor; })() }));
  await p.goto(BASE + '?c=' + Date.now(), { waitUntil: 'networkidle0' });
  let d = await s();
  ok(d.html === 'rgb(0, 0, 0)' && d.body === 'rgb(0, 0, 0)' && d.rootScheme === 'dark' && d.metas.join() === '#000000', 'dark (system light): ' + JSON.stringify(d));
  await p.evaluate(() => window.scrollTo(0, 600)); await new Promise(r => setTimeout(r, 200));
  ok(!/255, 255, 255/.test((await s()).topEl), 'element at top when scrolled is not white: ' + (await s()).topEl);
  await p.evaluate(() => window.scrollTo(0, 0));
  await p.click('#theme'); await new Promise(r => setTimeout(r, 400));
  d = await s();
  ok(d.html === 'rgb(255, 255, 255)' && d.body === 'rgb(255, 255, 255)' && d.rootScheme === 'light' && d.metas.join() === '#ffffff', 'light after toggle: ' + JSON.stringify(d));
  await p.click('#theme'); await new Promise(r => setTimeout(r, 400));
  d = await s();
  ok(d.html === 'rgb(0, 0, 0)' && d.metas.join() === '#000000' && d.rootScheme === 'dark', 'back to dark: ' + JSON.stringify(d));
  await b.close();
})();
