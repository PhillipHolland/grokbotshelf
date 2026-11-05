// The home's first screen is drawn at build time (scripts/home-strip.js into #results in index.html) so a phone paints
// the builders strip with the HTML, before shelf-data.json and app.js. app.js then keeps those nodes when they equal
// what it would draw and replaces them when they do not. Checked here: the strip is in the served HTML, it is on
// screen while shelf-data.json is still held back, app.js adopts it without a layout shift, a page served without the
// strip draws byte-identical markup (so the two templates have not drifted), a tampered strip is replaced, and a
// search, sort, filter or gallery URL never shows it. Usage: NODE_PATH=/path/to/node_modules node test/prerender.js [base-url]
const puppeteer = require('puppeteer-core');
const BASE = process.argv[2] || 'http://localhost:8765/';
const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) process.exitCode = 1; };
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1';
const STRIP = /<!-- strip:start -->[\s\S]*?<!-- strip:end -->/;
(async () => {
  const b = await puppeteer.launch({ executablePath: process.env.CHROME || '/usr/bin/google-chrome', headless: 'new', args: ['--no-sandbox'] });
  const errs = [];
  // mobile: 390px phone, 4x CPU throttle; edit(html) rewrites the served home page; hold: keep shelf-data.json back until released
  async function open(path, { mobile = false, edit = null, hold = false } = {}) {
    const p = await b.newPage(); p.on('pageerror', (e) => errs.push(e.message));
    await p.setViewport(mobile ? { width: 390, height: 844, isMobile: true, hasTouch: true } : { width: 1280, height: 900 });
    if (mobile) await p.setUserAgent(UA);
    await p.setRequestInterception(true);
    let held = null;
    p.on('request', async (r) => {
      const u = r.url();
      if (/google-analytics|googletagmanager|\/_vercel\//.test(u)) return r.abort();
      if (/\/shelf-data\.json/.test(u) && hold && !held) { held = r; return; }
      if (edit && new URL(u).pathname === '/' && r.resourceType() === 'document') {
        const res = await fetch(u); const html = await res.text();
        return r.respond({ status: 200, contentType: 'text/html; charset=utf-8', body: edit(html) });
      }
      return r.continue();
    });
    // a server-drawn section that app.js removes and puts back (a move) paints again, which on a slow link is a later LCP candidate
    await p.evaluateOnNewDocument(() => { window.__moved = []; addEventListener('DOMContentLoaded', () => { const r = document.getElementById('results'); if (r) new MutationObserver((ms) => { for (const m of ms) for (const n of m.removedNodes) if (n.nodeType === 1 && n.matches('.builders,.topvotes,.newv')) window.__moved.push(n.className); }).observe(r, { childList: true }); }); });
    await p.evaluateOnNewDocument(() => { window.__cls = 0; window.__src = [];
      new PerformanceObserver((l) => { for (const e of l.getEntries()) if (!e.hadRecentInput) { window.__cls += e.value; window.__src.push(e.value.toFixed(3) + ':' + (e.sources || []).map((s) => s.node && (s.node.closest ? (s.node.closest('.builders,.newv,.topvotes') ? 'strip/' : '') : '') + (s.node.id || s.node.className || s.node.nodeName)).join(',')); } }).observe({ type: 'layout-shift', buffered: true }); });
    if (mobile) { const cdp = await p.target().createCDPSession(); await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 }); }
    await p.goto(new URL(path, BASE).href, { waitUntil: hold ? 'domcontentloaded' : 'networkidle0' });
    return { p, release: async () => { if (held) { held.continue(); held = null; } await p.waitForFunction(() => document.querySelectorAll('#results .group').length > 0, { timeout: 30000 }).catch(() => {}); await wait(600); } };
  }
  // the nodes the server drew, marked before app.js has its data
  const mark = (p) => p.evaluate(() => { const s = [...document.querySelectorAll('#results > section')]; s.forEach((el) => { el.__srv = true; }); return s.map((el) => el.className); });
  const state = (p) => p.evaluate(() => {
    const r = document.getElementById('results'), bl = r.querySelector(':scope > .builders'), nv = r.querySelector(':scope > .newv'), tv = r.querySelector(':scope > .topvotes:not(.newv)');
    return { first: r.firstElementChild && r.firstElementChild.className, builders: !!bl, srvB: !!(bl && bl.__srv), srvN: nv ? !!nv.__srv : null, srvT: !!(tv && tv.__srv), cards: bl ? bl.querySelectorAll('.card').length : 0,
      coach: bl ? bl.querySelector('#f-bot-coach .desc') && bl.querySelector('#f-bot-coach .desc').textContent.length : 0, groups: r.querySelectorAll('.group').length, nostrip: document.documentElement.classList.contains('nostrip'),
      bHtml: bl ? bl.outerHTML : '', nHtml: nv ? nv.outerHTML : '', cls: +window.__cls.toFixed(3), src: window.__src, moved: window.__moved };
  });

  // 1. Served HTML: the strip sits inside #results, builders first, nine cards, Coach leading (config.js BUILDERS)
  const raw = await (await fetch(new URL('/', BASE).href)).text();
  const strip = (raw.match(STRIP) || [''])[0];
  const rawCards = (strip.match(/<article class="card"/g) || []).length;
  ok(/<div id="results" aria-busy="true"><!-- strip:start --><section class="builders"/.test(raw) && rawCards === 9 && strip.includes('id="f-bot-coach"') && strip.includes('<section class="topvotes" aria-labelledby="topv-h" hidden></section>'),
    `served HTML: #results opens with the builders strip (${rawCards} cards) and the hidden Top voted shell`);
  const rawNew = /<section class="topvotes newv"/.test(strip);

  // 2. Phone, shelf-data.json held: the strip is painted from the HTML; released: app.js keeps those nodes, nothing shifts
  let { p, release } = await open('/', { mobile: true, hold: true });
  await wait(800);
  const early = await p.evaluate(() => { const bl = document.querySelector('#results > .builders'), d = document.querySelector('#f-bot-coach .desc'), r = d && d.getBoundingClientRect();
    return { shown: !!bl && bl.getBoundingClientRect().height > 200, coachInView: !!r && r.top > 0 && r.bottom < innerHeight, groups: document.querySelectorAll('#results .group').length, visible: [...document.querySelectorAll('#results .builders .card')].filter((c) => c.getBoundingClientRect().height > 0).length }; });
  ok(early.shown && early.coachInView && early.groups === 0 && early.visible === 3, `390px: the builders strip is on screen before shelf-data.json arrives, Coach in view, three cards (phones) (${JSON.stringify(early)})`);
  const disc = await p.evaluate(() => { const n = document.getElementById('pairs-note'), chips = document.querySelectorAll('#results .builders a.pair-mini').length; return { chips, shown: !!n && !n.hidden && n.getBoundingClientRect().height > 0 }; });
  ok(disc.chips === 0 || disc.shown, `390px: with ${disc.chips} Pairs with chips in the strip the Amazon disclosure is shown before app.js (${JSON.stringify(disc)})`);
  const marked = await mark(p);
  await release();
  let s = await state(p);
  ok(s.first === 'builders' && s.srvB && (rawNew ? s.srvN === true : s.srvN === null) && s.srvT && s.groups > 0, `390px: app.js kept the server-drawn builders, Top voted and New this week nodes and built the groups after them (${JSON.stringify({ marked, first: s.first, srvB: s.srvB, srvN: s.srvN, srvT: s.srvT, groups: s.groups })})`);
  ok(!s.src.some((x) => x.includes('strip/')) && s.cls < 0.05, `390px: no layout shift inside the strip, CLS ${s.cls} (${JSON.stringify(s.src)})`);
  ok(s.moved.length === 0, `390px: the adopted sections were never taken out of #results and put back (moved: ${JSON.stringify(s.moved)})`);
  const mobileHtml = { b: s.bHtml, n: s.nHtml };
  await p.close();

  // 3. Desktop, strip served vs the same page served without it: app.js draws byte-identical markup, so the two templates agree
  ({ p, release } = await open('/', { hold: true })); await mark(p); await release();
  const a = await state(p); await p.close();
  ({ p } = await open('/', { edit: (h) => h.replace(STRIP, '<!-- strip:start --><!-- strip:end -->') }));
  const fresh = await state(p); await p.close();
  ok(a.srvB && a.cards === 9 && !fresh.srvB && fresh.cards === 9 && a.moved.length === 0, `1280px: the served strip is adopted in place; a page without one gets a fresh strip (${a.cards} / ${fresh.cards} cards, moved: ${JSON.stringify(a.moved)})`);
  ok(a.bHtml === fresh.bHtml && a.bHtml.length > 5000, `builders strip: the build's markup equals app.js's own (${a.bHtml.length} vs ${fresh.bHtml.length} chars)`);
  ok(a.nHtml === fresh.nHtml && (rawNew ? a.nHtml.length > 500 : a.nHtml === ''), `New this week: the build's markup equals app.js's own (${a.nHtml.length} vs ${fresh.nHtml.length} chars)`);
  ok(mobileHtml.b === a.bHtml && mobileHtml.n === a.nHtml, 'the strip is the same markup on the phone and on desktop');

  // 4. A strip that does not match (a stale build) is replaced, not kept
  ({ p, release } = await open('/', { hold: true, edit: (h) => h.replace(STRIP, (m) => m.replace('<p class="desc">', '<p class="desc">STALE ')) }));
  const stale = await mark(p); await release();
  const t = await state(p); await p.close();
  ok(stale.length === 3, `the tampered strip was served and marked (${JSON.stringify(stale)})`);
  ok(!t.srvB && t.cards === 9 && !t.bHtml.includes('STALE') && t.bHtml === a.bHtml, `a strip that differs from app.js's own is replaced by the fresh one (${t.srvB ? 'kept' : 'replaced'}, stale text ${t.bHtml.includes('STALE') ? 'still there' : 'gone'})`);

  // 5. Search, sort, filter and gallery URLs never show the strip, before or after app.js
  for (const path of ['/?q=email', '/?sort=newest', '/?cat=food', '/?creator=thecsguy']) {
    const o = await open(path, { hold: true }); await wait(300);
    const pre = await o.p.evaluate(() => ({ nostrip: document.documentElement.classList.contains('nostrip'), shown: [...document.querySelectorAll('#results > section, #pairs-note')].filter((el) => el.getBoundingClientRect().height > 0).length }));
    await o.release();
    const post = await o.p.evaluate(() => ({ nostrip: document.documentElement.classList.contains('nostrip'), builders: !!document.querySelector('#results .builders'), cards: document.querySelectorAll('#results .card').length }));
    ok(pre.nostrip && pre.shown === 0 && !post.nostrip && !post.builders && post.cards > 0, `${path}: the strip is hidden before app.js and gone after it (${JSON.stringify({ pre, post })})`);
    await o.p.close();
  }
  {
    const o = await open('/', { hold: true });
    ok(await o.p.evaluate(() => !document.documentElement.classList.contains('nostrip')), '/: the plain home never hides the strip');
    await o.p.close();
  }

  ok(errs.length === 0, 'no page errors' + (errs.length ? ': ' + errs.join(' | ') : ''));
  await b.close();
})().catch((e) => { console.error(e); process.exit(1); });
