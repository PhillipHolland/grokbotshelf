const puppeteer = require('puppeteer-core');
const BASE = process.argv[2] || 'http://localhost:8765/';
const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) process.exitCode = 1; };
(async () => {
  const b = await puppeteer.launch({ executablePath: '/usr/bin/google-chrome', headless: 'new', args: ['--no-sandbox'] });
  const p = await (await b.createBrowserContext()).newPage();
  await p.setViewport({ width: 390, height: 844, deviceScaleFactor: 3 });
  await p.goto(BASE + '?f=' + Date.now(), { waitUntil: 'networkidle0' });
  const s = await p.evaluate(() => {
    const f = document.querySelector('h1 .mark');
    const a = f ? f.getAttribute('transform') : null;
    const c = f ? getComputedStyle(f).transform : '';
    return {
      n: document.querySelectorAll('.mark').length,
      face: document.querySelectorAll('.eyes,.bf-eye,.bf-body,#botface,.botface').length,
      w: f && f.getAttribute('width'),
      rects: f ? f.querySelectorAll('rect').length : 0,
      fill: f && f.getAttribute('fill'),
      still: !a && (c === 'none' || c === ''),
    };
  });
  ok(s.n === 1, 'one shelf mark');
  ok(s.face === 0, 'no face, eyes, or eye classes');
  ok(s.w === '36', 'mark markup size 36');
  ok(s.rects === 3, 'three stacked bars');
  ok(s.fill === 'currentColor', 'mark uses currentColor');
  ok(s.still, 'mark has no transform');
  await b.close();
})();
