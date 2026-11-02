// Shelf Serif really loads and really paints. A dropped @font-face raises no error: the computed font-family still says
// Shelf Serif while the page draws the fallback, so this asks document.fonts and measures the text. Usage: node test/font.js [base-url]
const puppeteer = require('puppeteer-core');
const BASE = process.argv[2] || 'http://localhost:8765/';
const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) process.exitCode = 1; };
(async () => {
  const b = await puppeteer.launch({ executablePath: '/usr/bin/google-chrome', headless: 'new', args: ['--no-sandbox'] });
  for (const path of ['', 'bot/archivist', '@phil_holland', 'stacks', 'collections', 'category/design', 'add', 'lab/desk', 'no-such-page']) {
    const p = await (await b.createBrowserContext()).newPage();
    await p.setViewport({ width: 1280, height: 800 });
    const fonts = [];
    p.on('response', (r) => { if (/\.woff2/.test(r.url())) fonts.push(r.status()); });
    await p.goto(BASE + path, { waitUntil: 'load' });
    const r = await p.evaluate(async () => {
      await document.fonts.ready;
      const faces = [...document.fonts].filter((f) => f.family.replace(/"/g, '') === 'Shelf Serif');
      const h = document.querySelector('h1'), cs = getComputedStyle(h);
      const m = document.createElement('span'); m.textContent = 'Grok Bot Shelf 913'; m.style.cssText = 'position:absolute;visibility:hidden;font-size:40px;font-weight:400;white-space:nowrap';
      document.body.append(m);
      m.style.fontFamily = cs.fontFamily; const w = m.getBoundingClientRect().width;
      m.style.fontFamily = cs.fontFamily.split(',').slice(1).join(','); const fb = m.getBoundingClientRect().width;
      m.remove();
      return { loaded: faces.map((f) => f.status).join(), family: cs.fontFamily.split(',')[0].replace(/"/g, ''), w, fb, btn: [...document.querySelectorAll('button')].filter((e) => !getComputedStyle(e).fontFamily.includes('Shelf Serif')).length };
    });
    const tag = '/' + path;
    ok(r.loaded === 'loaded', `${tag}: the Shelf Serif face loaded (${r.loaded || 'no face'})`);
    ok(fonts.length === 1 && fonts[0] === 200, `${tag}: one font request, 200 (${fonts.join() || 'none'})`);
    ok(r.family === 'Shelf Serif' && Math.abs(r.w - r.fb) > 1, `${tag}: h1 paints in Shelf Serif, not the fallback (${r.w.toFixed(1)} vs ${r.fb.toFixed(1)}px)`);
    ok(r.btn === 0, `${tag}: every button inherits the font (${r.btn} do not)`);
    await p.close();
  }
  await b.close();
})();
