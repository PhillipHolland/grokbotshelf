const puppeteer = require('puppeteer-core');
const BASE = process.argv[2] || 'http://localhost:8765/';
const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) process.exitCode = 1; };
(async () => {
  const b = await puppeteer.launch({ executablePath: '/usr/bin/google-chrome', headless: 'new', args: ['--no-sandbox'] });
  const p = await (await b.createBrowserContext()).newPage();
  await p.setViewport({ width: 390, height: 844, deviceScaleFactor: 3 });
  await p.goto(BASE + '?f=' + Date.now(), { waitUntil: 'networkidle0' });
  const g = () => p.evaluate(() => { const f = document.querySelector('#botface'), r = f.getBoundingClientRect();
    return { eyes: f.querySelector('.eyes').getAttribute('transform'), body: f.querySelector('.bf-body').getAttribute('transform'), w: Math.round(r.width), cx: f.querySelector('.bf-body').getAttribute('r') }; });
  const seen = new Set(); let blinked = false, body = null;
  for (let i = 0; i < 60; i++) { const s = await g(); seen.add(s.eyes); if (/scale/.test(s.eyes || '')) blinked = true; body = s.body; await new Promise(r => setTimeout(r, 100)); }
  ok(seen.size > 5, 'eyes move: ' + seen.size + ' distinct transforms in 6s');
  ok(blinked, 'eyes blink (scaleY seen)');
  ok(body === null, 'body has no transform (stays still)');
  const sz = await p.evaluate(() => document.querySelector('#botface').getAttribute('width'));
  ok(sz === '36', 'face markup size 36 (CSS 28 on mobile like the old mark)');
  await p.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'reduce' }]);
  await new Promise(r => setTimeout(r, 1500));
  const a = await g(); await new Promise(r => setTimeout(r, 1500)); const c = await g();
  ok(a.eyes === c.eyes && /translate\(0 0\)/.test(c.eyes), 'reduced motion: eyes rest at center ' + c.eyes);
  await b.close();
})();
