// Round 4 #2: the bot page header has a Share pill (x.com post intent, page link as the url param) and the old
// "Share on X" text link is gone. Desktop shows icon + "Share"; phones show the icon alone with a 44px hit area.
// Usage: NODE_PATH=/path/to/node_modules node test/sharepill.js [base-url]
const puppeteer = require('puppeteer-core');
const BASE = process.argv[2] || 'http://localhost:8765/';
const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) process.exitCode = 1; };
const UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1';
const lum = (c) => { const m = c.match(/[\d.]+/g).map(Number).slice(0, 3).map((v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }); return 0.2126 * m[0] + 0.7152 * m[1] + 0.0722 * m[2]; };
const ratio = (a, b) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
(async () => {
  const b = await puppeteer.launch({ executablePath: '/usr/bin/google-chrome', headless: 'new', args: ['--no-sandbox'] });
  const errs = [];
  const bots = await (await fetch(new URL('/bots.json', BASE))).json();
  const slug = (s) => String(s).toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/&/g, ' and ').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  const longest = bots.filter((x) => x.creator_handle).reduce((m, x) => (x.name.length + x.creator_name.length > m.name.length + m.creator_name.length ? x : m));
  const pick = [bots.find((x) => x.creator_handle === '@Phil_Holland'), longest, bots.find((x) => !x.creator_handle) || longest];
  for (const theme of ['light', 'dark']) for (const w of [1280, 390]) for (const bot of pick) {
    const p = await b.newPage(); p.on('pageerror', (e) => errs.push(e.message));
    const mob = w < 700;
    await p.setViewport({ width: w, height: mob ? 844 : 900, isMobile: mob, hasTouch: mob });
    if (mob) await p.setUserAgent(UA);
    await p.evaluateOnNewDocument((t) => { localStorage.setItem('theme', t); window.__cls = 0; new PerformanceObserver((l) => l.getEntries().forEach((e) => { if (!e.hadRecentInput) window.__cls += e.value; })).observe({ type: 'layout-shift', buffered: true }); }, theme);
    await p.setRequestInterception(true);
    p.on('request', (r) => (/google-analytics|googletagmanager|\/_vercel\/|\/api\//.test(r.url()) ? r.abort() : r.continue()));
    const s = slug(bot.name);
    await p.goto(new URL('/bot/' + s, BASE).href, { waitUntil: 'networkidle0' });
    const r = await p.evaluate(() => {
      const a = document.querySelector('.bp-head > .bp-share'), h1 = document.querySelector('.bp-head h1'), sub = document.querySelector('.bp-head .sub');
      if (!a) return null;
      const ar = a.getBoundingClientRect(), hr = h1.getBoundingClientRect(), before = getComputedStyle(a, '::before');
      const bg = (e) => { for (; e; e = e.parentElement) { const c = getComputedStyle(e).backgroundColor; if (!/rgba\(0, 0, 0, 0\)|transparent/.test(c)) return c; } return 'rgb(255,255,255)'; };
      return { href: a.href, label: a.getAttribute('aria-label'), lbl: getComputedStyle(a.querySelector('.lbl')).display, w: ar.width, h: ar.height, right: ar.right, vw: innerWidth,
        hit: before.content !== 'none' ? [ar.width + 4, ar.height + 4] : [ar.width, ar.height], overlap: !(ar.left >= hr.right || ar.bottom <= hr.top || ar.top >= hr.bottom),
        subLines: Math.round(sub.getBoundingClientRect().height / parseFloat(getComputedStyle(sub).lineHeight || 20)),
        color: getComputedStyle(a).color, bg: bg(a), old: [...document.querySelectorAll('.bp-links a')].some((x) => /share on x/i.test(x.textContent) || /intent\/tweet/.test(x.href)), cls: window.__cls };
    });
    const tag = `${theme} ${w} ${bot.name}`;
    ok(!!r, `${tag}: Share pill in the header`);
    if (!r) { await p.close(); continue; }
    const u = new URL(r.href), by = bot.name.toLowerCase().endsWith((' by ' + bot.creator_name).toLowerCase()) ? bot.name : `${bot.name} by ${bot.creator_handle || bot.creator_name}`;
    ok(u.origin + u.pathname === 'https://x.com/intent/post' && u.searchParams.get('url') === `https://grokbotshelf.com/bot/${s}` && u.searchParams.get('text') === `${by} on Grok Bot Shelf`,
      `${tag}: x.com post intent with the page link and "${u.searchParams.get('text')}"`);
    ok(r.label === `Share ${bot.name} on X` && !r.old, `${tag}: named for screen readers; the old "Share on X" text link is gone`);
    ok(mob ? r.lbl === 'none' && r.hit[0] >= 44 && r.hit[1] >= 44 : r.lbl !== 'none' && r.h === 32, `${tag}: ${mob ? `icon only, ${r.hit.join('x')} hit area` : `icon + "Share", ${r.w}x${r.h}`}`);
    ok(!r.overlap && r.right <= r.vw, `${tag}: clear of the title, inside the screen`);
    ok(ratio(r.color, r.bg) >= 4.5 && r.cls === 0, `${tag}: contrast ${ratio(r.color, r.bg).toFixed(2)}, CLS ${r.cls}`);
    await p.close();
  }
  ok(!errs.length, `no page errors (${errs.slice(0, 3).join(' | ')})`);
  await b.close();
})().catch((e) => { console.error(e); process.exit(1); });
