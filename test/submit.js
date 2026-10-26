// Suggest form checks: "already on the shelf" by template id, the name hint, and the status of your suggestions.
// /api/submit is mocked (never reaches the real API) and the test fails if anything asks for the pending list.
const puppeteer = require('puppeteer-core');
const BASE = (process.argv[2] || 'http://localhost:8765/').replace(/\/?$/, '/');
const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) process.exitCode = 1; };
const wait = (ms) => new Promise(r => setTimeout(r, ms));
const KEY = 'shelf_suggested';
(async () => {
  const data = await (await fetch(BASE + 'shelf-data.json')).json();
  const listed = data.bots.find(b => /^https:\/\/x\.ai\/bot\/[A-Za-z0-9_-]+$/.test(b.url) && /[A-Z]/.test(b.url.slice(17)));
  const id = listed.url.slice('https://x.ai/bot/'.length), page = '/bot/' + listed.name.toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/&/g, ' and ').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  const NEW = 'https://x.ai/bot/NotListedYet42';
  const b = await puppeteer.launch({ executablePath: '/usr/bin/google-chrome', headless: 'new', args: ['--no-sandbox'] });
  for (const vp of [{ width: 1280, height: 900 }, { width: 390, height: 844, isMobile: true, hasTouch: true }]) {
    const W = vp.width + 'px: ';
    const p = await b.newPage(); await p.setViewport(vp);
    const errs = [], api = [];
    p.on('pageerror', e => errs.push(e.message));
    await p.setRequestInterception(true);
    p.on('request', r => {
      const u = r.url();
      if (u.includes('/api/submit')) {
        api.push(r.method() + ' ' + u.slice(u.indexOf('/api/')));
        if (r.method() !== 'POST') return r.respond({ status: 500, body: '' });
        const sent = JSON.parse(r.postData() || '{}');
        const hit = sent.bot_url && sent.bot_url.includes(id);
        return r.respond({ status: 200, contentType: 'application/json', body: JSON.stringify(hit
          ? { ok: true, status: 'already_listed', bot: { name: listed.name, page: 'https://grokbotshelf.com' + page, url: listed.url }, message: listed.name + ' is already on the shelf.' }
          : { ok: true, status: 'queued', message: 'Thanks! It is in the review queue.' }) });
      }
      if (u.includes('/api/')) return r.respond({ status: 200, contentType: 'application/json', body: '{}' });
      r.continue();
    });
    await p.goto(BASE, { waitUntil: 'networkidle0' });
    await p.evaluate((k) => localStorage.removeItem(k), KEY);
    await p.goto(BASE + '#add', { waitUntil: 'networkidle0' });
    const dupe = () => p.$eval('#sub-dupe', e => ({ cls: e.className, text: e.textContent.trim(), href: (e.querySelector('a') || {}).getAttribute?.('href') || '' }));
    const below = () => p.$eval('label[for=sub-post]', e => Math.round(e.getBoundingClientRect().top + scrollY));
    const set = async (v) => { await p.$eval('#sub-bot', e => { e.value = ''; }); await p.type('#sub-bot', v); await wait(300); };
    ok(await p.$eval('#sub-dupe', e => e.getAttribute('aria-live') === 'polite' && document.getElementById('sub-bot').getAttribute('aria-describedby') === 'sub-dupe'), W + 'the shelf check is a polite live region tied to the template field');
    const y0 = await below(), h0 = await p.$eval('#sub-dupe', e => e.offsetHeight);
    ok(h0 >= 20, W + `space for the shelf check is reserved before anything is typed (${h0}px)`);

    for (const v of [listed.url, `HTTPS://WWW.X.AI/bot/${id}/?ref=share#top`, `x.ai/bot/${id}`, `www.x.ai/bot/${id}/`]) {
      await set(v); const d = await dupe();
      ok(d.cls.includes('hit') && d.text.startsWith('Already on the shelf') && d.href === page, W + `template id match for ${v}: "${d.text}" -> ${d.href}`);
    }
    ok(await below() === y0, W + 'nothing below moves when the match shows (no layout jump)');
    await set('https://x.ai/bot/' + id.toLowerCase()); let d = await dupe();
    ok(!d.text, W + 'template ids are case-sensitive: a lowercased id is not a match');
    await set(NEW); d = await dupe();
    ok(!d.text && d.cls === 'sub-dupe', W + 'unknown template id: no message');
    await set('https://example.com/bot/' + id); d = await dupe();
    ok(!d.text, W + 'same path on another host is not a match');
    await set('  ' + listed.name.toUpperCase().replace(/ /g, '   ') + '  '); d = await dupe();
    ok(d.cls.includes('hint') && d.text === `A bot named ${listed.name} is already on the shelf.` && d.href === page, W + `name hint (trimmed, any case, spaces collapsed): "${d.text}"`);
    await set(listed.name + ' Pro Max'); d = await dupe();
    ok(!d.text, W + 'a different name gives no hint');
    ok(await below() === y0, W + 'still no layout jump after hint and clear');

    // A match never blocks sending
    await set(listed.url); await p.click('#sub-go'); await wait(400);
    ok(api.filter(a => a.startsWith('POST')).length === 1, W + 'sending still works when the link is already on the shelf');
    ok(/already on the shelf/.test(await p.$eval('#sub-msg', e => e.textContent)), W + 'the API answer is shown as before');
    // A new suggestion is remembered on this device
    await p.$eval('#sub-bot', e => { e.value = ''; }); await p.type('#sub-bot', NEW + '/?s=1'); await p.click('#sub-go'); await wait(400);
    const saved = await p.evaluate((k) => JSON.parse(localStorage.getItem(k) || '[]').map(x => x.u), KEY);
    ok(saved[0] === NEW && saved[1] === listed.url && saved.length === 2, W + 'sent template links are kept in localStorage (normalized): ' + JSON.stringify(saved));
    const rows = () => p.$$eval('#chk-list li', ls => ls.map(l => ({ k: l.dataset.k, cls: l.className, st: (l.querySelector('.st') || {}).textContent, why: (l.querySelector('.why') || {}).textContent, href: (l.querySelector('.what a') || {}).getAttribute?.('href') })));
    let r = await rows();
    ok(r.length === 2 && r[0].st === 'Not yet' && r[0].why === 'Not found on the shelf yet. Recent approvals can take a few minutes to appear.', W + 'new suggestion: not found on the shelf yet: ' + JSON.stringify(r[0]));
    ok(r[1].st === 'Added' && r[1].href === page, W + 'suggestion already listed: Added, linked to its page');
    ok(await p.$eval('#chk-next', e => !e.hidden && /Reviewed for NSFW and security issues/i.test(e.textContent)), W + 'what happens next uses the shelf review wording');

    // Return visit
    await p.reload({ waitUntil: 'networkidle0' }); await wait(300);
    r = await rows();
    ok(r.length === 2 && r[0].st === 'Not yet' && r[1].st === 'Added', W + 'status shows again on a return visit');
    const txt = await p.$eval('#sub-check', e => e.innerText);
    ok(!/declin|reject|pending/i.test(txt), W + 'never says declined, rejected or pending');

    // Paste box for anyone (sent on X or by email)
    await p.evaluate((k) => localStorage.removeItem(k), KEY); await p.reload({ waitUntil: 'networkidle0' });
    ok(await p.$eval('#chk-list', e => !e.children.length) && await p.$eval('#chk-forget', e => e.hidden), W + 'nothing listed when nothing was sent from this device');
    const check = async (v) => { await p.$eval('#chk-url', e => { e.value = ''; }); await p.type('#chk-url', v); await p.click('#chk-go'); await wait(200); return rows(); };
    r = await check(`https://www.x.ai/bot/${id}?utm=x`);
    ok(r.length === 1 && r[0].st === 'Added' && r[0].href === page, W + 'paste box: a listed template shows Added with its page');
    r = await check('x.ai/bot/SomethingElse77');
    ok(r.length === 1 && r[0].st === 'Not yet', W + 'paste box: an unknown template shows not found yet');
    r = await check('hello');
    ok(r.length === 1 && /x\.ai\/bot template link/.test(r[0].why), W + 'paste box: a non-link gets a hint');
    ok(await p.evaluate((k) => localStorage.getItem(k), KEY) === null, W + 'checking a link does not save it as yours');
    await p.evaluate((k, u) => localStorage.setItem(k, JSON.stringify([{ u }])), KEY, NEW); await p.reload({ waitUntil: 'networkidle0' });
    await p.click('#chk-forget'); await wait(100);
    ok(await p.evaluate((k) => localStorage.getItem(k), KEY) === null && await p.$eval('#chk-list', e => !e.children.length), W + 'Forget clears the list on this device');

    if (vp.isMobile) {
      const sz = await p.evaluate(() => ['#chk-go', '#chk-url'].map(s => Math.round(document.querySelector(s).getBoundingClientRect().height)));
      ok(sz.every(h => h >= 44), W + 'Check button and paste field are at least 44px tall: ' + sz);
    }
    ok(!api.some(a => a.startsWith('GET')), W + 'no GET to /api/submit (the pending list is never read): ' + JSON.stringify(api));
    ok(!errs.length, W + 'no page errors' + (errs.length ? ': ' + errs.join(' | ') : ''));
    await p.close();
  }
  await b.close();
})();
