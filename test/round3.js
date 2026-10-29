// Round-3 design items on bot, creator, 404 and home pages (see each section). Usage: NODE_PATH=/path/to/node_modules node test/round3.js [base-url]
const puppeteer = require('puppeteer-core');
const BASE = process.argv[2] || 'http://localhost:8765/';
const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) process.exitCode = 1; };
const UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
(async () => {
  const b = await puppeteer.launch({ executablePath: '/usr/bin/google-chrome', headless: 'new', args: ['--no-sandbox'] });
  const errs = [];
  // votes: null = the API is down (local server), otherwise the GET /api/votes answer; theme: localStorage before load
  async function open(path, { w = 1280, votes = null, theme = 'dark' } = {}) {
    const p = await b.newPage(); p.on('pageerror', (e) => errs.push(path + ': ' + e.message));
    const mob = w < 700;
    await p.setViewport({ width: w, height: mob ? 844 : 900, isMobile: mob, hasTouch: mob });
    if (mob) await p.setUserAgent(UA);
    await p.evaluateOnNewDocument((t) => { try { localStorage.setItem('theme', t); localStorage.setItem('shelfer-sheet', '{"v":1,"how":"test"}'); } catch (e) {} }, theme);
    await p.setRequestInterception(true);
    p.on('request', (r) => {
      if (/google-analytics|googletagmanager|\/_vercel\//.test(r.url())) return r.abort();
      if (/\/api\/votes/.test(r.url()) && r.method() === 'GET') return votes ? setTimeout(() => r.respond({ status: 200, contentType: 'application/json', body: JSON.stringify(votes) }).catch(() => {}), 300) : r.respond({ status: 503, body: '{}' });
      if (/\/api\//.test(r.url())) return r.abort();
      r.continue();
    });
    await p.goto(new URL(path, BASE).href, { waitUntil: 'networkidle0' });
    return p;
  }

  // #1 bot page vote count: a quiet 0 before and without the API, the real score in the same slot, no shift, 3 digits fit
  {
    let p = await open('/bot/archivist');
    const z = await p.evaluate(() => { const v = document.querySelector('.bp-vote .vn'), cs = getComputedStyle(v), t2 = getComputedStyle(document.documentElement).getPropertyValue('--text2').trim();
      const tmp = document.createElement('i'); tmp.style.color = t2; document.body.appendChild(tmp); const want = getComputedStyle(tmp).color; tmp.remove();
      return { t: v.textContent, zero: v.classList.contains('zero'), quiet: cs.color === want }; });
    ok(z.t === '0' && z.zero && z.quiet, `#1 no tally: the count reads a quiet 0 (${JSON.stringify(z)})`);
    const html = await (await fetch(new URL('/bot/archivist', BASE))).text();
    ok(/<span class="vn zero">0<\/span>/.test(html), '#1 the server-rendered page already has the quiet 0 before any script runs');
    await p.close();
    for (const score of [21, 123]) {
      p = await b.newPage(); await p.setViewport({ width: 1280, height: 900 });
      await p.setRequestInterception(true);
      p.on('request', (r) => /\/api\/votes/.test(r.url()) ? setTimeout(() => r.respond({ status: 200, contentType: 'application/json', body: JSON.stringify({ global: true, scores: { 'bot-archivist': { up: score + 1, down: 1, score } } }) }).catch(() => {}), 600) : /google|_vercel/.test(r.url()) ? r.abort() : r.continue());
      await p.evaluateOnNewDocument(() => { window.__shift = 0; new PerformanceObserver((l) => l.getEntries().forEach((e) => { window.__shift += e.value; })).observe({ type: 'layout-shift', buffered: true }); });
      await p.goto(new URL('/bot/archivist', BASE).href, { waitUntil: 'domcontentloaded' });
      const before = await p.evaluate(() => { const r = document.querySelector('.bp-actions').getBoundingClientRect(); return [r.top, r.height, document.querySelector('.bp-vote .vn').textContent]; });
      await p.waitForFunction((s) => document.querySelector('.bp-vote .vn').textContent === String(s), { timeout: 5000 }, score).catch(() => {});
      const after = await p.evaluate(() => { const v = document.querySelector('.bp-vote .vn'), r = document.querySelector('.bp-actions').getBoundingClientRect(); return [r.top, r.height, v.textContent, v.classList.contains('zero'), v.scrollWidth <= v.clientWidth + 1, window.__shift]; });
      ok(after[2] === String(score) && !after[3] && after[4] && before[0] === after[0] && before[1] === after[1] && after[5] < 0.001,
        `#1 score ${score} lands in the slot: ${before[2]} -> ${after[2]}, not quiet, not clipped (${after[4]}), action row still (${before.slice(0, 2)} -> ${after.slice(0, 2)}), CLS ${after[5].toFixed(4)}`);
      await p.close();
    }
  }

  // #2 bot, creator and 404 pages at 1280: header, content column and footer share the 720px column; the theme toggle is there and works
  for (const path of ['/bot/archivist', '/@phil_holland', '/@nobodyhere']) {
    const p = await open(path);
    const r = await p.evaluate(() => { const R = (s) => { const e = document.querySelector(s), r = e.getBoundingClientRect(), cs = getComputedStyle(e); return [Math.round(r.left + parseFloat(cs.paddingLeft)), Math.round(r.right - parseFloat(cs.paddingRight))]; };
      return { main: R('main.bp'), head: R('.hero'), foot: R('.site-foot'), rule: Math.round(document.querySelector('.site-foot').getBoundingClientRect().width) }; });
    ok(r.head.join() === r.main.join() && r.foot.join() === r.main.join() && r.rule <= 760, `#2 1280 ${path}: header ${r.head}, footer ${r.foot} line up with the column ${r.main} (footer rule ${r.rule}px)`);
    await p.click('#theme'); await sleep(100);
    const t = await p.evaluate(() => [document.documentElement.dataset.theme, localStorage.getItem('theme'), document.getElementById('theme').getAttribute('aria-pressed')]);
    ok(t.join() === 'light,light,false', `#2 ${path}: theme toggle switches to light and saves it (${t})`);
    await p.close();
  }

  // #3 light mode: outlined containers use --line2, hover uses --field; hairlines keep --line; dark mode unchanged
  for (const theme of ['light', 'dark']) {
    const p = await open('/', { theme });
    await p.waitForSelector('#results .card');
    const col = (v) => p.evaluate((v) => { const i = document.createElement('i'); i.style.color = getComputedStyle(document.documentElement).getPropertyValue(v); document.body.appendChild(i); const c = getComputedStyle(i).color; i.remove(); return c; }, v);
    const [line, line2, field, hover] = [await col('--line'), await col('--line2'), await col('--field'), await col('--hover')];
    const card = await p.$eval('#results .card', (e) => getComputedStyle(e).borderTopColor);
    await p.hover('#results .card'); await sleep(300);
    const hov = await p.$eval('#results .card', (e) => getComputedStyle(e).backgroundColor);
    const foot = await p.$eval('.site-foot', (e) => getComputedStyle(e).borderTopColor);
    if (theme === 'light') ok(card === line2 && hov === field && foot === line, `#3 light: card border --line2 (${card}), hover --field (${hov}), footer hairline --line (${foot})`);
    else ok(card === line && hov === hover, `#3 dark unchanged: card border --line (${card}), hover --hover (${hov})`);
    await p.close();
  }
  {
    const p = await open('/bot/archivist', { theme: 'light' });
    const r = await p.evaluate(() => ['.bp-card', '.bp-more a', '.bp-embed', '.snip', '.icon.big'].map((s) => { const e = document.querySelector(s); return e ? getComputedStyle(e).borderTopColor : 'none'; }));
    const l2 = await p.evaluate(() => { const i = document.createElement('i'); i.style.color = getComputedStyle(document.documentElement).getPropertyValue('--line2'); document.body.appendChild(i); return getComputedStyle(i).color; });
    ok(r.every((c) => c === l2), `#3 light bot page: card, similar tiles, badge panel, snippets and icon use --line2 (${[...new Set(r)]})`);
    await p.close();
  }

  // #5 keyboard focus on a text link draws an offset outline; Copy is a styled pill; pills have a press state
  for (const w of [1280, 390]) {
    const p = await open('/bot/archivist', { w });
    await p.click('h1');
    let f = null;
    for (let i = 0; i < 40 && !f; i++) { await p.keyboard.press('Tab'); f = await p.evaluate(() => { const a = document.activeElement; if (!a.closest('.bp-links')) return null; const cs = getComputedStyle(a); return { o: cs.outlineStyle, ow: cs.outlineWidth, off: cs.outlineOffset, bs: cs.boxShadow, fv: a.matches(':focus-visible') }; }); }
    ok(f && f.fv && f.o === 'solid' && f.ow === '2px' && f.off === '3px' && f.bs === 'none', `#5 ${w}: Tab to a .bp-links text link: offset outline, no glyph box (${JSON.stringify(f)})`);
    const c = await p.$eval('.snip-h .clear', (e) => { const cs = getComputedStyle(e); return { bw: cs.borderTopWidth, bg: cs.backgroundColor, r: cs.borderTopLeftRadius, app: cs.appearance, w: cs.fontWeight }; });
    ok(c.bw === '0px' && c.bg === 'rgba(0, 0, 0, 0)' && parseFloat(c.r) > 100 && c.app === 'none' && c.w === '700', `#5 ${w}: Copy is a borderless bold pill (${JSON.stringify(c)})`);
    const act = await p.evaluate(() => [...document.styleSheets].flatMap((s) => { try { return [...s.cssRules]; } catch (e) { return []; } }).some((r) => r.selectorText && /\.get/.test(r.selectorText) && /:active/.test(r.selectorText) && /scale/.test(r.cssText)));
    ok(act, `#5 ${w}: pills have an :active press state`);
    await p.close();
  }

  // #6 phone cards: the creator link is a 44px tap that starts below the title line, so the title wins its whole line
  {
    const p = await open('/', { w: 390 });
    await p.waitForSelector('#results .card .sub a.cn');
    // cards are content-visibility:auto, so each one is scrolled into view and given two frames to render before hit testing
    const r = await p.evaluate(async () => { const out = []; for (const c of [...document.querySelectorAll('#results .card')].filter((c) => c.querySelector('.sub a.cn') && c.getBoundingClientRect().height).slice(0, 8)) {
      const t = c.querySelector('h3 a'), n = c.querySelector('.sub a.cn'); scrollTo(0, scrollY + n.getBoundingClientRect().top - 300);
      await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
      const T = t.getBoundingClientRect(), N = n.getBoundingClientRect(); let titleWins = true, cnWins = true;
      for (let y = Math.ceil(T.top) + 1; y < T.bottom - 1; y += 2) { const e = document.elementFromPoint(N.left + 4, y); if (!e || !e.closest('h3 a') && e.closest('a.cn')) titleWins = false; }
      for (let y = Math.ceil(N.top) + 1; y < N.bottom - 1; y += 3) { const e = document.elementFromPoint(N.left + 4, y); if (!e || !e.closest('a.cn')) cnWins = false; }
      out.push({ h: Math.round(N.height), gap: Math.round(N.top - T.bottom), titleWins, cnWins }); } return out; });
    ok(r.length && r.every((x) => x.h >= 44 && x.gap >= 0 && x.titleWins && x.cnWins), `#6 390: creator link 44px tap below the title line, title keeps its line (${JSON.stringify(r.filter((x) => !(x.h >= 44 && x.gap >= 0 && x.titleWins && x.cnWins))[0] || r[0])}, ${r.length} cards)`);
    await p.close();
  }

  // #7 phones: meta row sits 3px under the title like desktop (tap stays 44px), creator facts stack with no dot, links in two even columns
  for (const path of ['/bot/grok-bot-video-studio', '/@phil_holland']) {
    const p = await open(path, { w: 390 });
    const r = await p.evaluate(() => { const R = (e) => e.getBoundingClientRect(), h = R(document.querySelector('.bp h1')), s = document.querySelector('.bp .sub'), a = s.querySelector('a'), A = R(a);
      const dot = s.querySelector('.dot'), L = document.querySelector('.bp-links'), as = [...L.querySelectorAll('a')], xs = [...new Set(as.map((x) => Math.round(R(x).left)))];
      const e = document.elementFromPoint(A.left + 4, A.bottom - 3); const desc = R(document.querySelector('.bp-desc, .cp-cats') || document.querySelector('.bp-actions'));
      return { gap: Math.round(A.top + 13 - h.bottom), tap: Math.round(A.height), tapOk: !!(e && e.closest('.bp .sub a')), dot: dot ? getComputedStyle(dot).display : 'none', stacked: getComputedStyle(s).flexDirection, cols: xs.length, linkH: Math.min(...as.map((x) => Math.round(R(x).height))), lastFact: Math.round(R(s.lastElementChild).bottom), descTop: Math.round(desc.top) }; });
    const creator = path.startsWith('/@');
    ok(r.gap >= 0 && r.gap <= 6 && r.tap >= 44 && r.tapOk && r.cols === 2 && r.linkH >= 44 && (!creator || (r.dot === 'none' && r.stacked === 'column' && r.descTop - r.lastFact >= 10)), `#7 390 ${path}: meta ${r.gap}px under the title, 44px tap, ${creator ? 'facts stacked, no dot, ' : ''}links in 2 columns (${JSON.stringify(r)})`);
    await p.close();
  }

  // #8 creator page: category chips from bots.json (no sentence), each to this creator's bots in that category; tiles show the category;
  // phone chips have a 44px tap; Creator not found offers Browse all bots
  {
    const BOTS = JSON.parse(require('fs').readFileSync(require('path').join(__dirname, '..', 'public', 'bots.json'), 'utf8'));
    const mine = BOTS.filter((b) => (b.creator_handle || '').replace(/^@/, '').toLowerCase() === 'phil_holland');
    const want = [...new Set(mine.map((b) => b.category))].sort();
    for (const w of [1280, 390]) {
      const p = await open('/@phil_holland', { w });
      const r = await p.evaluate(() => { const R = (e) => e.getBoundingClientRect();
        const chips = [...document.querySelectorAll('.cp-cats a')].map((a) => ({ t: a.firstChild.textContent.trim(), n: +((a.querySelector('.n') || {}).textContent || 0), href: a.getAttribute('href') }));
        const a = document.querySelector('.cp-cats a'), A = R(a); let tap = 0; for (let y = Math.floor(A.top) - 10; y < A.bottom + 10; y++) { const e = document.elementFromPoint(A.left + A.width / 2, y); if (e && e.closest('.cp-cats a') === a) tap++; }
        return { chips, tap, h: Math.round(A.height), desc: !!document.querySelector('.bp-desc'), tiles: [...document.querySelectorAll('.cp-list li a')].map((x) => [x.getAttribute('href'), (x.querySelector('small.cat > span:first-child') || x.querySelector('small.cat')).textContent]) }; });
      const countsOk = r.chips.every((c) => c.n === mine.filter((b) => b.category === c.t).length);
      const tilesOk = r.tiles.length === mine.length && r.tiles.every(([h, c]) => mine.some((b) => '/bot/' + h.split('/').pop() === h && b.category === c));
      ok(JSON.stringify(r.chips.map((c) => c.t)) === JSON.stringify(want) && countsOk && r.chips.every((c) => /^\/\?creator=phil_holland&cat=[a-z0-9-]+$/.test(c.href)) && !r.desc && tilesOk && (w > 700 || r.tap >= 44),
        `#8 ${w}: ${r.chips.length} category chips with counts, no sentence, ${r.tiles.length} tiles with category${w < 700 ? `, chip tap ${r.tap}px` : ''} (${JSON.stringify(r.chips[0])})`);
      if (w === 1280) {
        const c0 = r.chips[0]; await Promise.all([p.waitForNavigation({ waitUntil: 'networkidle0' }), p.click('.cp-cats a')]);
        await p.waitForSelector('#results .card');
        const shown = await p.$$eval('#results .card', (cs) => cs.filter((c) => c.getBoundingClientRect().height).length);
        ok(shown === c0.n, `#8 chip "${c0.t}" opens the shelf with this creator's ${c0.n} bots in it (${shown} shown)`);
      }
      await p.close();
    }
    const p = await open('/@nobodyhere123', { w: 390 });
    // in visual order: on phones the blue search button is drawn first
    const nf = await p.evaluate(() => [...document.querySelectorAll('.bp-actions a, .bp-links a')].filter((a) => !a.hidden).sort((x, y) => x.getBoundingClientRect().top - y.getBoundingClientRect().top || x.getBoundingClientRect().left - y.getBoundingClientRect().left).map((a) => a.textContent + ' ' + a.getAttribute('href')));
    ok(nf.join('|') === 'Search for @nobodyhere123 /?q=nobodyhere123|Browse all bots /|Add a bot /add|Browse creators /?sort=creator', `#8 Creator not found: ${nf.join(' | ')}`);
    await p.close();
  }

  // #9 sort is its own labeled pill outside the search field: desktop beside the search, phones in front of the filter row
  // (no extra row, so the dock keeps its height); same options and ?sort=; 44px tall; no layout shift on load
  for (const [w, th] of [[1280, 'dark'], [390, 'light']]) {
    const p = await open('/?sort=votes', { w, theme: th, votes: { global: true, scores: { 'bot-archivist': { up: 6, down: 1, score: 5 }, 'bot-coach': { up: 4, down: 0, score: 4 }, 'bot-disk-doctor': { up: 3, down: 0, score: 3 } } } });
    await p.evaluateOnNewDocument(() => { window.__cls = 0; new PerformanceObserver((l) => { for (const e of l.getEntries()) if (!e.hadRecentInput) window.__cls += e.value; }).observe({ type: 'layout-shift', buffered: true }); });
    await p.reload({ waitUntil: 'networkidle0' }); await new Promise((r) => setTimeout(r, 600));
    const r = await p.evaluate((w) => { const R = (e) => e.getBoundingClientRect(), s = document.querySelector('#sort'), S = R(s), C = R(document.querySelector('.capsule')), F = R(document.querySelector('.filterbar'));
      const lab = [...s.labels].map((l) => l.textContent.trim()); const pre = document.querySelector('.sortwrap .pre');
      // the whole pill is the select (label and chevron let taps through); top and bottom rows skip the rounded ends
      let tap = true; for (let x = Math.ceil(S.left) + 2; x < S.right - 2; x += 4) for (const y of [S.top + 2, S.top + S.height / 2, S.bottom - 2]) if ((y === S.top + S.height / 2 || (x > S.left + S.height / 2 && x < S.right - S.height / 2)) && document.elementFromPoint(x, y) !== s) tap = false;
      return { inCapsule: !!s.closest('.capsule'), opts: [...s.options].map((o) => o.value).join(','), value: s.value, label: lab.join('|'), labelShown: pre && R(pre).width > 0 && getComputedStyle(pre).visibility === 'visible', h: Math.round(S.height), tapAll: tap,
        row: Math.round(S.top) === Math.round(w > 700 ? C.top : F.top), right: Math.round(S.right) <= innerWidth, cls: +window.__cls.toFixed(4) }; }, w);
    ok(!r.inCapsule && r.opts === 'featured,newest,bookmarks,votes,az,creator' && r.value === 'votes' && r.label === 'Sort:' && r.labelShown && r.h >= 44 && r.tapAll && r.row && r.right && r.cls === 0,
      `#9 ${w} ${th}: sort pill outside the search, labeled, ?sort=votes selected, ${r.h}px, ${w > 700 ? 'beside the search' : 'in front of the filters'}, CLS ${r.cls} (${JSON.stringify(r)})`);
    await p.select('#sort', 'newest'); await new Promise((x) => setTimeout(x, 300));
    ok(new URL(p.url()).searchParams.get('sort') === 'newest', `#9 ${w}: changing the pill writes ?sort=newest (${p.url()})`);
    if (w === 1280) {
      await p.select('#sort', 'featured'); await new Promise((x) => setTimeout(x, 300));
      const sv = await p.$('[data-sortvotes]');
      ok(!!sv, '#9 the Top voted strip and its See all link are there with votes'); if (sv) { await sv.click(); await new Promise((x) => setTimeout(x, 300)); ok(await p.$eval('#sort', (e) => e.value) === 'votes' && new URL(p.url()).searchParams.get('sort') === 'votes', '#9 "See all by votes" still switches the pill to Most upvoted'); }
    }
    await p.close();
  }

  ok(errs.length === 0, 'no page errors' + (errs.length ? ': ' + errs.join(' | ') : ''));
  await b.close();
})().catch((e) => { console.error(e); process.exit(1); });
