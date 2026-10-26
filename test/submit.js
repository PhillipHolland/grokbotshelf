// Suggest form checks under the template field: on the shelf (by template id), suggested before from this device,
// name hint, and a green check for a valid template link that is new.
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
    const errs = [], api = []; let slow = false;
    // Record layout shifts; shifts within 500ms of input (hadRecentInput) do not count toward CLS
    await p.evaluateOnNewDocument(() => { window.__ls = []; new PerformanceObserver(l => { for (const e of l.getEntries()) window.__ls.push({ v: e.value, input: e.hadRecentInput, form: e.sources.some(s => s.node && s.node.closest && s.node.closest('#sub-form')) }); }).observe({ type: 'layout-shift', buffered: true }); });
    const shifts = () => p.evaluate(() => window.__ls.filter(e => !e.input));
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
      if (slow && u.includes('shelf-data.json')) return setTimeout(() => r.continue(), 1500);
      if (u.includes('/api/')) return r.respond({ status: 200, contentType: 'application/json', body: '{}' });
      r.continue();
    });
    await p.goto(BASE, { waitUntil: 'networkidle0' });
    await p.evaluate((k) => localStorage.removeItem(k), KEY);
    await p.goto(BASE + '#add', { waitUntil: 'networkidle0' });
    const dupe = () => p.$eval('#sub-dupe', e => ({ cls: e.className, h: e.offsetHeight, check: getComputedStyle(document.getElementById('sub-ok')).visibility === 'visible',
      shown: [...e.childNodes].filter(n => !(n.classList && n.classList.contains('sr'))).map(n => n.textContent).join('').trim(), sr: (e.querySelector('.sr') || {}).textContent || '', text: e.textContent.trim(), href: (e.querySelector('a') || {}).getAttribute?.('href') || '' }));
    const below = () => p.$eval('label[for=sub-post]', e => Math.round(e.getBoundingClientRect().top + scrollY));
    const set = async (v) => { await p.$eval('#sub-bot', e => { e.value = ''; }); await p.type('#sub-bot', v); await wait(300); };
    ok(await p.$eval('#sub-dupe', e => e.getAttribute('aria-live') === 'polite' && document.getElementById('sub-bot').getAttribute('aria-describedby') === 'sub-dupe'), W + 'the shelf check is a polite live region tied to the template field');
    const y0 = await below(), h0 = await p.$eval('#sub-dupe', e => e.offsetHeight);
    const gap = await p.evaluate(() => Math.round(document.querySelector('label[for=sub-post]').getBoundingClientRect().top - document.getElementById('sub-bot').getBoundingClientRect().bottom));
    ok(h0 === 0 && gap === 10, W + `the empty message takes no space (${h0}px high, ${gap}px to the next label, the normal form gap)`);
    ok(!(await p.evaluate(() => window.__ls.some(e => !e.input && e.form))), W + 'nothing in the form shifts on page load');

    for (const v of [listed.url, `HTTPS://WWW.X.AI/bot/${id}/?ref=share#top`, `x.ai/bot/${id}`, `www.x.ai/bot/${id}/`]) {
      await set(v); const d = await dupe();
      ok(d.cls.includes('dupe-hit') && d.h >= 20 && d.text.startsWith('Already on the shelf') && d.href === page, W + `template id match for ${v}: "${d.text}" -> ${d.href}`);
    }
    ok(!(await shifts()).some(e => e.form), W + 'the match only moves things right after typing (excluded from CLS)');
    ok(!(await dupe()).check, W + 'no green check while the link is on the shelf');
    await set('https://x.ai/bot/' + id.toLowerCase()); let d = await dupe();
    ok(!d.cls.includes('dupe-hit') && !d.shown, W + 'template ids are case-sensitive: a lowercased id is not a match');
    await set(NEW); d = await dupe();
    ok(d.cls.includes('dupe-new') && d.check && !d.shown && d.sr === 'Not on the shelf yet', W + 'valid new template link: green check only, labelled "Not on the shelf yet" for screen readers');
    ok(await p.evaluate(() => { const i = document.getElementById('sub-bot').getBoundingClientRect(), c = document.getElementById('sub-ok').getBoundingClientRect(); return c.left > i.left && c.right <= i.right && c.top >= i.top && c.bottom <= i.bottom; }), W + 'the check sits inside the field');
    ok((await dupe()).h === 0 && await below() === y0, W + 'the check sits in the field and takes no space below it');
    for (const v of ['x.ai/bo', 'https://x.ai/bot/', 'https://x.ai/bot/abc', 'x.ai/bot/' + 'a'.repeat(70), 'https://example.com/bot/' + id, 'https://x.ai/other/' + id, 'not a link']) {
      await set(v); d = await dupe();
      ok(!d.text && !d.check, W + `invalid or partial input shows nothing: ${v.slice(0, 40)}`);
    }
    await set('  ' + listed.name.toUpperCase().replace(/ /g, '   ') + '  '); d = await dupe();
    ok(d.cls.includes('dupe-hint') && d.h >= 20 && d.text === `A bot named ${listed.name} is already on the shelf.` && d.href === page, W + `name hint (trimmed, any case, spaces collapsed): "${d.text}"`);
    ok(!(await shifts()).some(e => e.form), W + 'the name hint only moves things right after typing');
    await set(listed.name + ' Pro Max'); d = await dupe();
    ok(!d.text, W + 'a different name gives no hint');
    ok((await dupe()).h === 0 && await below() === y0, W + 'the space closes again when there is no message');

    // A match never blocks sending
    await set(listed.url); await p.click('#sub-go'); await wait(400);
    ok(api.filter(a => a.startsWith('POST')).length === 1, W + 'sending still works when the link is already on the shelf');
    ok(/already on the shelf/.test(await p.$eval('#sub-msg', e => e.textContent)), W + 'the API answer is shown as before');
    // Suggested before from this device (saved only after a successful send)
    await p.evaluate((k) => localStorage.removeItem(k), KEY);
    await set(NEW); await p.click('#sub-go'); await wait(400);
    ok((await p.evaluate((k) => JSON.parse(localStorage.getItem(k) || '[]').map(x => x.u), KEY)).join() === NEW, W + 'a sent template link is kept on this device (normalized)');
    const SENT = "You suggested this already. It's not on the shelf yet. Recent approvals can take a few minutes to appear.";
    for (const v of [NEW, 'WWW.x.ai/bot/NotListedYet42/?from=x']) {
      await set(v); d = await dupe();
      ok(d.cls.includes('dupe-sent') && d.text === SENT && !d.check, W + `suggested before: ${v}`);
      ok(d.h >= await p.$eval('#sub-dupe', e => e.scrollHeight), W + 'the suggested-before message is fully visible');
    }
    ok(!(await shifts()).some(e => e.form), W + 'the suggested-before message only moves things right after typing');
    await p.reload({ waitUntil: 'networkidle0' }); await wait(500);
    d = await dupe();
    ok(!d.text && d.h === 0 && !(await shifts()).some(e => e.form), W + 'with a saved suggestion, nothing shows or shifts on load; messages appear only after input');
    await set(NEW + '/');
    ok((await dupe()).cls.includes('dupe-sent'), W + 'suggested-before still shows on a return visit');
    await set(listed.url); d = await dupe();
    ok(d.cls.includes('dupe-hit'), W + 'on the shelf wins over suggested-before');
    const before = api.length;
    await set('https://x.ai/bot/FailsToSend99');
    ok(!(await p.evaluate((k) => localStorage.getItem(k), KEY)).includes('FailsToSend99'), W + 'typing alone does not save anything');
    ok(api.length === before, W + 'typing makes no API requests');
    await p.evaluate((k) => localStorage.removeItem(k), KEY);
    await set(NEW); d = await dupe();
    ok(d.cls.includes('dupe-new') && d.check, W + 'with nothing saved, the same link shows the green check again');
    ok(await p.$('#sub-check') === null && await p.$('#chk-url') === null, W + 'no separate status panel or paste box');

    // Shelf data arriving after the person typed: the message shows then (the one case without recent input)
    slow = true; await p.goto(BASE + '?late=1#add', { waitUntil: 'domcontentloaded' }); await p.waitForSelector('#sub-bot');
    await p.type('#sub-bot', listed.url); await wait(300);
    ok(!(await dupe()).text, W + 'no message before the shelf data has loaded');
    await wait(2500); slow = false; d = await dupe();
    ok(d.cls.includes('dupe-hit'), W + 'a late shelf load still checks a link that was already typed');

    ok(!api.some(a => a.startsWith('GET')), W + 'no GET to /api/submit (the pending list is never read): ' + JSON.stringify(api));
    ok(!errs.length, W + 'no page errors' + (errs.length ? ': ' + errs.join(' | ') : ''));
    await p.close();
  }
  await b.close();
})();
