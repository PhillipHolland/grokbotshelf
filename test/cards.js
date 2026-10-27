// Card + filter layout: every card keeps a tag line (empty without tags) pinned above a footer of fixed slots, the vote
// count is always there (0 when nobody voted) in a fixed tabular slot, descriptions clamp at three lines, cards in a row
// line up, the footer is one row at 1280, phones get 44px tool targets, and the filter row has equal heights with the
// two short selects at 190px. /api/votes is mocked in the browser.
// Usage: NODE_PATH=/path/to/node_modules node test/cards.js [base-url]
const puppeteer = require('puppeteer-core');
const BASE = process.argv[2] || 'http://localhost:8765/';
const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) process.exitCode = 1; };
const settle = (ms = 300) => new Promise((r) => setTimeout(r, ms));
(async () => {
  const b = await puppeteer.launch({ executablePath: '/usr/bin/google-chrome', headless: 'new', args: ['--no-sandbox'] });
  const errs = [];
  async function open(vp) {
    const p = await b.newPage(); p.on('pageerror', (e) => errs.push(e.message));
    await p.setViewport(vp);
    if (vp.isMobile) await p.setUserAgent('Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1');
    await p.setRequestInterception(true);
    p.on('request', (req) => {
      const u = req.url();
      if (/google-analytics|googletagmanager|\/_vercel\//.test(u)) return req.abort();
      if (/\/api\/votes/.test(u)) return req.respond({ status: 200, contentType: 'application/json', body: JSON.stringify({ global: true, scores: { 'bot-coach': { up: 1, down: 3, score: -2 } } }) });
      if (/\/api\//.test(u)) return req.respond({ status: 503, contentType: 'application/json', body: '{}' });
      return req.continue();
    });
    await p.goto(BASE, { waitUntil: 'networkidle0' }); await settle(500);
    return p;
  }
  const p = await open({ width: 1280, height: 900 });
  // Lay out every card for real (off-screen cards otherwise use content-visibility size estimates)
  await p.addStyleTag({ content: '.card{content-visibility:visible!important}' }); await settle(300);
  const c = await p.evaluate(() => {
    const cards = [...document.querySelectorAll('#results .card')];
    const r = (e) => e.getBoundingClientRect();
    const out = { n: cards.length, noBadges: 0, emptyVn: 0, slotBad: 0, clampBad: 0, footRows: 0, vnW: new Set(), coach: '' };
    for (const c of cards) {
      if (!c.querySelector('.badges')) out.noBadges++;
      const vn = c.querySelector('.vote .vn'); if (!/^-?\d+$/.test(vn.textContent)) out.emptyVn++;
      out.vnW.add(Math.round(r(vn).width));
      // Slots after the vote: copy, share, then the X post, the code link or an empty slot
      const t = [...c.querySelectorAll('.tools > .ib')];
      if (t.length < 3 || !(t[2].matches('a.ib') || t[2].matches('span.ib.slot'))) out.slotBad++;
      const d = c.querySelector('.desc'), cs = getComputedStyle(d);
      if (cs.webkitLineClamp !== '3' || d.getBoundingClientRect().height > parseFloat(cs.lineHeight) * 3 + 1) out.clampBad++;
      const tools = r(c.querySelector('.tools')), gets = r(c.querySelector('.gets'));
      if (Math.abs(tools.top + tools.height / 2 - (gets.top + gets.height / 2)) > 2) out.footRows++;
    }
    const coach = document.querySelector('#f-bot-coach .vn'); out.coach = coach ? coach.textContent : '';
    // Cards in the same row (same top) have their tag line and footer at the same height
    const rows = new Map();
    for (const c of cards) { const t = Math.round(r(c).top + scrollY); if (!rows.has(t)) rows.set(t, []); rows.get(t).push(c); }
    out.rowBad = 0; out.rows = 0;
    for (const cs of rows.values()) { if (cs.length < 2) continue; out.rows++; const bt = new Set(cs.map((c) => Math.round(r(c.querySelector('.badges')).bottom))), ft = new Set(cs.map((c) => Math.round(r(c.querySelector('.foot-row')).top))); if (bt.size > 1 || ft.size > 1) out.rowBad++; }
    const sel = [...document.querySelectorAll('.filterbar select, .filterbar .chip')].map((e) => Math.round(r(e).height));
    const sm = [...document.querySelectorAll('.filterbar .selwrap.sm')].map((e) => Math.round(r(e).width));
    out.sel = [...new Set(sel)]; out.sm = sm; out.vnW = [...out.vnW];
    return out;
  });
  ok(c.n > 100 && c.noBadges === 0, `1280: every one of ${c.n} cards has a tag line (${c.noBadges} without)`);
  ok(c.emptyVn === 0 && c.coach === '-2', `1280: every card shows a vote count, 0 when absent (${c.emptyVn} empty; Coach shows ${c.coach})`);
  ok(c.vnW.length === 1, `1280: vote counts sit in one fixed-width slot (${c.vnW.join(', ')}px)`);
  ok(c.slotBad === 0, `1280: tools are vote, copy, share, then X post / code / empty slot (${c.slotBad} off)`);
  ok(c.clampBad === 0, `1280: descriptions clamp at 3 lines (${c.clampBad} over)`);
  ok(c.footRows === 0, `1280: footer is one row on every card (${c.footRows} wrapped)`);
  ok(c.rows > 10 && c.rowBad === 0, `1280: tag lines and footers line up across ${c.rows} rows (${c.rowBad} rows off)`);
  ok(c.sel.length === 1 && c.sel[0] === 36, `1280: filter selects and chips are all 36px tall (${c.sel.join(', ')})`);
  ok(c.sm.length === 2 && c.sm.every((w) => w === 190), `1280: "Works with" and "Can it act?" are 190px (${c.sm.join(', ')})`);
  await p.close();

  const m = await open({ width: 390, height: 844, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
  await m.addStyleTag({ content: '.card{content-visibility:visible!important}' }); await settle(300);
  const mm = await m.evaluate(() => {
    const cards = [...document.querySelectorAll('#results .card')].filter((c) => c.checkVisibility()).slice(0, 40), small = [];
    for (const c of cards) for (const e of c.querySelectorAll('.tools .ib:not(.slot), .gets a')) { const r = e.getBoundingClientRect(); if (r.height < 44) small.push(c.id + ' ' + e.className + ' ' + Math.round(r.height)); }
    const sel = [...document.querySelectorAll('.filterbar select, .filterbar .chip')].map((e) => Math.round(e.getBoundingClientRect().height));
    const two = cards.every((c) => c.querySelector('.gets').getBoundingClientRect().top >= c.querySelector('.tools').getBoundingClientRect().bottom - 1);
    return { small: small.slice(0, 4), ns: small.length, sel: [...new Set(sel)], two, sw: document.documentElement.scrollWidth };
  });
  ok(mm.ns === 0, `390: card tools and actions are at least 44px tall (${mm.ns} small${mm.small.length ? ': ' + mm.small.join('; ') : ''})`);
  ok(mm.two, '390: actions sit on their own row under the tool slots');
  ok(mm.sel.length === 1 && mm.sel[0] === 44, `390: filter selects and chips are 44px tall (${mm.sel.join(', ')})`);
  ok(mm.sw <= 390, `390: no sideways overflow (${mm.sw})`);
  await m.close();
  ok(errs.length === 0, 'no page errors' + (errs.length ? ': ' + errs.join(' | ') : ''));
  await b.close();
})().catch((e) => { console.error(e); process.exit(1); });
