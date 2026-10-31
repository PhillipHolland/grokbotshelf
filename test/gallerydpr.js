// Perf round 6 #1: gallery tiles pick a WebP thumbnail at every screen density, never the 1200px PNG share card.
// srcset offers the 480px and 720px WebPs; sizes is the tile's real width, so a 390px phone at 3x and a laptop at 2x
// pick the 720, a phone at 2x and a laptop at 1x the 480. A bot whose 720 is missing falls back to the 480 alone.
// Usage: NODE_PATH=/path/to/node_modules node test/gallerydpr.js [base-url]
const fs = require('fs');
const puppeteer = require('puppeteer-core'), tempSite = require('./tempsite');
const BASE = process.argv[2] || 'http://localhost:8765/';
const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) process.exitCode = 1; };
const wait = (ms) => new Promise((x) => setTimeout(x, ms));
(async () => {
  const b = await puppeteer.launch({ executablePath: '/usr/bin/google-chrome', headless: 'new', args: ['--no-sandbox'] });
  async function gallery(base, w, dpr) {
    const ctx = await b.createBrowserContext(), p = await ctx.newPage(), reqs = [];
    await p.setViewport({ width: w, height: w < 700 ? 844 : 900, deviceScaleFactor: dpr, isMobile: w < 700, hasTouch: w < 700 });
    await p.evaluateOnNewDocument(() => localStorage.setItem('gbs_view', 'gallery'));
    await p.setRequestInterception(true);
    p.on('request', (r) => { if (/\/og\//.test(r.url())) reqs.push(r.url()); return /google-analytics|googletagmanager|\/_vercel\/|\/api\//.test(r.url()) ? r.abort() : r.continue(); });
    await p.goto(base, { waitUntil: 'networkidle0' }); await wait(300);
    const r = await p.evaluate(() => { const im = [...document.querySelectorAll('.gtile img')].filter((i) => i.complete && i.currentSrc);
      return { n: im.length, src: im.map((i) => new URL(i.currentSrc).pathname.split('/').slice(0, 3).join('/')), tile: document.querySelector('.gtile .gi').getBoundingClientRect().width, set: document.querySelector('.gtile img').getAttribute('srcset') }; });
    await ctx.close(); return { ...r, reqs };
  }
  for (const [w, dpr, want] of [[390, 3, 720], [390, 2, 480], [1280, 1, 480], [1280, 2, 720], [1024, 3, 720], [360, 1, 480]]) {
    const r = await gallery(BASE, w, dpr), dir = want === 720 ? '/og/thumb720' : '/og/thumb';
    ok(r.n > 0 && r.src.every((s) => s === dir), `${w}px @${dpr}x (tile ${Math.round(r.tile)}px): ${r.n} tiles load the ${want}px WebP (${[...new Set(r.src)].join(',')})`);
    ok(r.reqs.length && r.reqs.every((u) => /\.webp\?v=[0-9a-f]+$/.test(u)) && !/\.png/.test(r.set), `${w}px @${dpr}x: ${r.reqs.length} image requests, all WebP, no PNG in srcset`);
  }
  // sizes matches the rendered tile within a few px at the breakpoints, so the browser's pick is the right one
  const sizes = (vw) => vw <= 699 ? vw / 2 - 20 : vw <= 1119 ? vw * 0.333 - 20 : 354;
  for (const w of [320, 390, 699, 700, 1024, 1119, 1199, 1280, 1600]) {
    const r = await gallery(BASE, w, 1);
    ok(Math.abs(r.tile - sizes(w)) <= 6, `${w}px: sizes says ${Math.round(sizes(w))}px, the tile is ${Math.round(r.tile)}px`);
  }
  // No 720 for a bot: "no720", its srcset has the 480 alone
  const slug = JSON.parse(fs.readFileSync(require('path').join(__dirname, '..', 'public', 'shelf-data.json'), 'utf8')).bots[0].name.toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/&/g, ' and ').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  const site = await tempSite(({ pub }) => fs.rmSync(pub('og', 'thumb720', slug + '.webp')), { images: true });
  try {
    const sd = JSON.parse(fs.readFileSync(site.pub('shelf-data.json'), 'utf8'));
    const r = await gallery(site.base, 390, 3);
    ok(sd.bots[0].no720 === true && sd.bots[0].og && !sd.bots[1].no720 && /^[0-9a-f]{10}$/.test(sd.og2) && !sd.bots.some((x) => 'og2' in x) && /^\/og\/thumb\/[a-z0-9-]+\.webp\?v=[0-9a-f]+ 480w$/.test(r.set) && r.src[0] === '/og/thumb', `no 720 for a bot: "no720", srcset is the 480 alone (${r.set})`);
  } finally { site.close(); }
  await b.close();
})();
