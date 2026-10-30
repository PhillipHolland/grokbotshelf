// Round 4 #1: votes are "votes", never "score", and the real up/down split shows in a tooltip on hover or focus
// (cards, Top voted, bot page, creator tiles). The tooltip is absolutely placed, so showing it moves nothing.
// Usage: NODE_PATH=/path/to/node_modules node test/votewords.js [base-url]
const puppeteer = require('puppeteer-core');
const BASE = process.argv[2] || 'http://localhost:8765/';
const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) process.exitCode = 1; };
const UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1';
(async () => {
  const b = await puppeteer.launch({ executablePath: '/usr/bin/google-chrome', headless: 'new', args: ['--no-sandbox'] });
  const errs = [];
  const bots = await (await fetch(new URL('/bots.json', BASE))).json();
  const slug = (s) => String(s).toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/&/g, ' and ').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  const phil = bots.filter((x) => x.creator_handle === '@Phil_Holland'), s0 = 'bot-' + slug(phil[0].name), s1 = 'bot-' + slug(phil[1].name);
  const scores = { [s0]: { up: 130, down: 7, score: 123 }, [s1]: { up: 1, down: 0, score: 1 } };
  async function open(path, { w = 1280 } = {}) {
    const p = await b.newPage(); p.on('pageerror', (e) => errs.push(path + ': ' + e.message));
    p.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errs.push(path + ' console: ' + m.text()); });
    const mob = w < 700;
    await p.setViewport({ width: w, height: mob ? 844 : 900, isMobile: mob, hasTouch: mob });
    if (mob) await p.setUserAgent(UA);
    await p.evaluateOnNewDocument(() => { try { localStorage.setItem('shelfer-sheet', '{"v":1,"how":"test"}'); } catch (e) {}
      window.__cls = 0; new PerformanceObserver((l) => l.getEntries().forEach((e) => { if (!e.hadRecentInput) window.__cls += e.value; })).observe({ type: 'layout-shift', buffered: true }); });
    await p.setRequestInterception(true);
    p.on('request', (r) => {
      if (/google-analytics|googletagmanager|\/_vercel\//.test(r.url())) return r.abort();
      if (/\/api\/votes/.test(r.url()) && r.method() === 'GET') return r.respond({ status: 200, contentType: 'application/json', body: JSON.stringify({ global: true, scores }) });
      if (/\/api\//.test(r.url())) return r.abort();
      r.continue();
    });
    await p.goto(new URL(path, BASE).href, { waitUntil: 'networkidle0' });
    await new Promise((x) => setTimeout(x, 300));
    return p;
  }
  const tipOf = (p, sel) => p.evaluate((sel) => { const e = document.querySelector(sel); if (!e) return null; const cs = getComputedStyle(e, '::after');
    return { tip: e.dataset.tip, title: e.getAttribute('title'), op: cs.opacity, vis: cs.visibility, content: cs.content, sr: (e.querySelector('.sr') || {}).textContent, r: e.getBoundingClientRect().toJSON() }; }, sel);
  const noScoreWords = (p) => p.evaluate(() => !/\bscore\b|net votes/i.test(document.body.innerText + [...document.querySelectorAll('[title],[aria-label]')].map((e) => e.title + ' ' + e.getAttribute('aria-label')).join(' ')));

  // Home: a card's vote and the Top voted row
  for (const w of [1280, 390]) {
    const p = await open('/?q=' + encodeURIComponent(phil[0].name), { w });
    const sel = `#${s0} .vote`;
    const t0 = await tipOf(p, sel);
    ok(t0 && t0.tip === '130 up · 7 down' && !t0.title && t0.op === '0' && /votes, 130 up, 7 down/.test(t0.sr), `${w} card: tooltip text is the real split, hidden until hover, no native title, sr "${t0 && t0.sr}"`);
    const cardR = await p.$eval('#' + s0, (e) => e.getBoundingClientRect().toJSON());
    await p.hover(sel + ' .vn');
    await new Promise((x) => setTimeout(x, 250));
    const t1 = await tipOf(p, sel);
    const tip = await p.$eval(sel, (e) => { const a = getComputedStyle(e, '::after'); return { op: a.opacity, h: a.height, w: a.width, bg: a.backgroundColor, c: a.color }; });
    const cardR2 = await p.$eval('#' + s0, (e) => e.getBoundingClientRect().toJSON());
    ok(t1.op === '1' && t1.vis === 'visible', `${w} card: hovering the count shows the tooltip (${tip.w} x ${tip.h})`);
    ok(JSON.stringify(cardR) === JSON.stringify(cardR2) && JSON.stringify(t0.r) === JSON.stringify(t1.r), `${w} card: showing the tooltip moves nothing`);
    ok(await noScoreWords(p), `${w} home search: no "score" or "net votes" wording on the page`);
    await p.close();
    const h = await open('/', { w });
    const top = await tipOf(h, '.topvotes .tlist .sc');
    ok(top && top.tip === '130 up · 7 down' && /^ votes, 130 up, 7 down$/.test(top.sr) && !(await h.$eval('.topvotes .tlist a', (a) => a.title)), `${w} Top voted: tooltip "${top && top.tip}", sr "${top && top.sr}", no title on the row`);
    const one = await h.$$eval('.topvotes .tlist .sc', (e) => e.map((x) => x.querySelector('.sr').textContent));
    ok(one.includes(' vote, 1 up, 0 down'), `${w} Top voted: 1 reads "1 vote", not "1 votes" (${one.join('|')})`);
    ok(await noScoreWords(h), `${w} home: no "score" or "net votes" wording`);
    await h.close();
  }
  // Bot page and creator page
  for (const w of [1280, 390]) {
    const p = await open('/bot/' + s0.slice(4), { w });
    const t = await tipOf(p, '.bp-vote');
    ok(t && t.tip === '130 up · 7 down' && !t.title && /^ votes, 130 up, 7 down$/.test(t.sr), `${w} bot page: tooltip "${t && t.tip}", sr "${t && t.sr}"`);
    await p.hover('.bp-vote .vn'); await new Promise((x) => setTimeout(x, 250));
    const t2 = await tipOf(p, '.bp-vote'), vw = await p.evaluate(() => innerWidth);
    const box = await p.$eval('.bp-vote', (e) => { const r = e.getBoundingClientRect(), a = getComputedStyle(e, '::after'), tx = a.transform === 'none' ? 0 : new DOMMatrix(a.transform).m41, l = r.left + parseFloat(a.left) + tx; return { l, r: l + parseFloat(a.width), mid: Math.abs(l + parseFloat(a.width) / 2 - (r.left + r.width / 2)) }; });
    ok(t2.op === '1' && box.l >= 0 && box.r <= vw && box.mid < 2, `${w} bot page: hover shows it, centred on the pill, inside the screen (${Math.round(box.l)}..${Math.round(box.r)} of ${vw}, off-centre ${box.mid.toFixed(1)}px)`);
    ok(await noScoreWords(p), `${w} bot page: no "score" or "net votes" wording`);
    await p.close();
    const c = await open('/@phil_holland', { w });
    const ct = await tipOf(c, `.cp-sc[data-score="${s0}"]`);
    ok(ct && ct.tip === '130 up · 7 down' && /^ votes, 130 up, 7 down$/.test(ct.sr), `${w} creator tile: tooltip "${ct && ct.tip}", sr "${ct && ct.sr}"`);
    const rest = await c.$$eval('.cp-sc', (e) => e.filter((x) => x.querySelector('.n').textContent === '0').every((x) => x.dataset.tip === 'No votes yet' && x.querySelector('.sr').textContent === ' votes'));
    ok(rest, `${w} creator tiles with no votes say "No votes yet"`);
    ok(await noScoreWords(c), `${w} creator page: no "score" or "net votes" wording`);
    await c.close();
  }
  ok(!errs.length, `no page errors (${errs.slice(0, 3).join(' | ')})`);
  await b.close();
})().catch((e) => { console.error(e); process.exit(1); });
