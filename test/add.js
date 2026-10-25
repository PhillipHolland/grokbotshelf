const puppeteer = require('puppeteer-core');
const BASE = process.argv[2] || 'http://localhost:8765/';
const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) process.exitCode = 1; };
const wait = (ms) => new Promise(r => setTimeout(r, ms));
(async () => {
  const b = await puppeteer.launch({ executablePath: '/usr/bin/google-chrome', headless: 'new', args: ['--no-sandbox'] });
  for (const vp of [{ width: 390, height: 844, isMobile: true, hasTouch: true }, { width: 1360, height: 900 }]) {
    const p = await b.newPage(); await p.setViewport(vp);
    const pos = () => p.evaluate(() => ({ add: Math.round(document.getElementById('add').getBoundingClientRect().top), dock: Math.round(document.getElementById('dock').getBoundingClientRect().bottom), hash: location.hash, y: scrollY, max: document.documentElement.scrollHeight - innerHeight }));
    const check = (d, m) => ok(d.hash === '#add' && (d.add >= d.dock && d.add <= d.dock + 40 || (d.y >= d.max - 1 && d.add >= d.dock)), `${vp.width}px ${m}: ${JSON.stringify(d)}`);
    await p.goto(BASE, { waitUntil: 'networkidle0' });
    await p.click('.add-top'); await wait(1600); check(await pos(), 'click from top');
    await p.evaluate(() => scrollTo(0, 0)); await wait(200);
    await p.evaluate(() => document.querySelector('.add-top').click()); await wait(1600); check(await pos(), 're-click when already #add');
    await p.goto(BASE + '#add', { waitUntil: 'networkidle0' }); await wait(1600); check(await pos(), 'load with #add');
    await p.goto(BASE + '#bot-x', { waitUntil: 'networkidle0' });
    await p.close();
  }
  await b.close();
})();
