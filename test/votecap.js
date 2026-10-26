// Vote caps in the UI: /api/votes is mocked in the browser (request interception), so no vote is ever sent anywhere.
// On a 429 with a cap code the arrow, the tally and the gbs_votes localStorage entry roll back and the API's sentence shows.
// Usage: node test/votecap.js [base-url]   (default http://localhost:8765/)
const puppeteer = require('puppeteer-core');
const BASE = process.argv[2] || 'http://localhost:8765/';
const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) process.exitCode = 1; };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const MSG = {
  cap_network: "This bot already has the most votes we allow from one network (3). On shared Wi-Fi, that's why.",
  cap_daily: "You've reached today's vote limit. Try again tomorrow.",
};
(async () => {
  const b = await puppeteer.launch({ executablePath: '/usr/bin/google-chrome', headless: 'new', args: ['--no-sandbox'] });
  const errs = [];
  async function open(path, slug, { reply, mine = {}, width = 1280 }) {
    const p = await b.newPage(), posts = [];
    p.on('pageerror', (e) => errs.push(e.message));
    await p.setViewport({ width, height: 900 });
    await p.setRequestInterception(true);
    p.on('request', async (req) => {
      const u = req.url();
      if (/google-analytics|googletagmanager|\/_vercel\//.test(u)) return req.abort();
      if (!/\/api\/votes/.test(u)) return req.continue();
      const json = (status, body, headers = {}) => req.respond({ status, contentType: 'application/json', headers, body: JSON.stringify(body) });
      if (req.method() === 'GET') return json(200, { global: true, scores: { [slug]: { up: 3, down: 0, score: 3 } }, ...(/mine=1/.test(u) ? { mine } : {}) });
      posts.push(JSON.parse(req.postData() || '{}'));
      await sleep(400); // long enough to see the optimistic state
      return json(...reply);
    });
    await p.evaluateOnNewDocument((m) => { try { localStorage.setItem('shelfer-sheet', '1'); if (Object.keys(m).length) localStorage.setItem('gbs_votes', JSON.stringify(m)); } catch (e) {} }, mine);
    await p.goto(new URL(path, BASE).href, { waitUntil: 'networkidle0' });
    return { p, posts };
  }
  const state = (p, sel, slug) => p.evaluate((sel, slug) => {
    const el = document.querySelector(sel), t = document.querySelector('.toast');
    return { up: el.querySelector('.up').getAttribute('aria-pressed'), dn: el.querySelector('.dn').getAttribute('aria-pressed'), n: el.querySelector('.vn').textContent,
      stored: (JSON.parse(localStorage.getItem('gbs_votes') || '{}') || {})[slug], toast: t ? t.textContent : '', shown: !!(t && t.classList.contains('show')) };
  }, sel, slug);

  const BOTS = await (await fetch(new URL('bots.json', BASE))).json();
  const slugOf = (n) => 'bot-' + n.toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/&/g, ' and ').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  const arch = slugOf('Archivist');
  ok(BOTS.some((x) => x.name === 'Archivist'), 'test bot exists');

  for (const [where, path, sel] of [['home', '/?q=archivist', `.vote[data-vote="${arch}"]`], ['bot page', '/bot/archivist', '.bp-vote']]) {
    for (const code of ['cap_network', 'cap_daily']) {
      const { p, posts } = await open(path, arch, { reply: [429, { error: MSG[code], code, retry_after: 86400 }, { 'Retry-After': '86400' }] });
      await p.waitForSelector(sel);
      const before = await state(p, sel, arch);
      await p.click(sel + ' .up'); await sleep(150);
      const mid = await state(p, sel, arch);
      await sleep(700);
      const after = await state(p, sel, arch);
      ok(before.up === 'false' && before.n === '3' && mid.up === 'true' && mid.n === '4' && mid.stored === 1, `${where} ${code}: optimistic up arrow, tally 4 and localStorage entry while the vote is in flight`);
      ok(posts.length === 1 && posts[0].slug === arch && posts[0].value === 1, `${where} ${code}: one POST to the mocked /api/votes`);
      ok(after.up === 'false' && after.n === '3' && after.stored === undefined, `${where} ${code}: 429 rolls back the arrow, the tally and the localStorage entry`);
      ok(after.shown && after.toast === MSG[code], `${where} ${code}: shows "${after.toast}"`);
      await p.close();
    }
    // a previous down vote is restored, not erased
    { const { p } = await open(path, arch, { mine: { [arch]: -1 }, reply: [429, { error: MSG.cap_network, code: 'cap_network', retry_after: 86400 }, { 'Retry-After': '86400' }] });
      await p.waitForSelector(sel); await p.click(sel + ' .up'); await sleep(900);
      const s = await state(p, sel, arch);
      ok(s.dn === 'true' && s.up === 'false' && s.stored === -1, `${where}: a 429 restores an earlier down vote and its localStorage entry`);
      await p.close(); }
    // plain burst 429 (no code) keeps the old short message
    { const { p } = await open(path, arch, { reply: [429, { error: 'slow down a little' }, { 'Retry-After': '60' }] });
      await p.waitForSelector(sel); await p.click(sel + ' .up'); await sleep(900);
      const s = await state(p, sel, arch);
      ok(s.up === 'false' && s.stored === undefined && s.toast === 'Too many votes, try again in a minute', `${where}: a burst 429 without a cap code rolls back and says "${s.toast}"`);
      await p.close(); }
  }
  await b.close();
  ok(!errs.length, 'no page errors' + (errs.length ? ': ' + errs.join(' | ') : ''));
})().catch((e) => { console.log('FAIL crashed: ' + e.stack); process.exitCode = 1; });
