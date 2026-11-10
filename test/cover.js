// One job coverage (round 2 #5): while One job is on, a note under the count says how many bots have been checked for
// it so far, with a "Show all bots" button that clears just that filter. The "Works with" (?app=) and "Can it act?"
// (?does=) filters are gone: old links with those params load the full shelf, drop the params, and log no errors.
// Counts come from shelf-data.json. Usage: NODE_PATH=/path/to/node_modules node test/cover.js [base-url]
const puppeteer = require('puppeteer-core');
const BASE = process.argv[2] || 'http://localhost:8765/';
const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) process.exitCode = 1; };
const BLOCK = /google-analytics|googletagmanager|\/_vercel\/|\/api\//;
(async () => {
  const data = (await (await fetch(new URL('shelf-data.json', BASE))).json()).bots;
  const any = data.filter((b) => b.meta).length;
  const b = await puppeteer.launch({ executablePath: process.env.CHROME || '/usr/bin/google-chrome', headless: 'new', args: ['--no-sandbox'] });
  const errs = [];
  const open = async (path, w = 1280) => {
    const p = await b.newPage();
    p.on('pageerror', (e) => errs.push(path + ': ' + e.message));
    p.on('console', (m) => { if (m.type() === 'error' && !BLOCK.test((m.location() || {}).url || '')) errs.push(path + ': console: ' + m.text()); });
    await p.setViewport({ width: w, height: 900 });
    await p.setRequestInterception(true);
    p.on('request', (r) => (BLOCK.test(r.url()) ? r.abort() : r.continue()));
    await p.goto(new URL(path, BASE).href, { waitUntil: 'networkidle0' });
    return p;
  };
  const read = (p) => p.evaluate(() => ({ hidden: document.querySelector('#cover').hidden, text: document.querySelector('#cover').textContent, count: document.querySelector('#count').textContent,
    url: location.search, gone: !document.querySelector('#apps') && !document.querySelector('#agency'), reset: document.querySelector('#reset').classList.contains('on'),
    q: document.querySelector('#q') ? document.querySelector('#q').value : null, nostrip: document.documentElement.classList.contains('nostrip') }));
  let p = await open('/');
  let r = await read(p);
  ok(r.hidden, 'no note without One job');
  ok(r.gone, 'no "Works with" or "Can it act?" select on the home page');
  const all = r.count;
  ok(all === `${data.length} bots`, `home shows every bot (${all})`);
  await p.close();
  // Old links from the removed filters fall back to All
  for (const old of ['/?does=acts', '/?does=reads', '/?app=gmail', '/?app=imessage&does=drafts', '/?does=nonsense&app=nope']) {
    for (const w of [1280, 390]) {
      p = await open(old, w);
      r = await read(p);
      ok(r.url === '' && r.count === all && r.hidden && !r.reset && r.gone && !r.nostrip, `${w}: old link ${old} loads all ${data.length} bots, drops the params, no note, Reset off (${JSON.stringify(r)})`);
      await p.close();
    }
  }
  p = await open('/?does=acts&q=bot');
  r = await read(p);
  ok(r.url === '?q=bot' && r.q === 'bot', `an old ?does= next to a search keeps only the search (${r.url})`);
  await p.close();
  p = await open('/?one_job=1&q=bot');
  r = await read(p);
  ok(!r.hidden && r.text.startsWith(`One job covers the ${any} of ${data.length} bots checked so far`) && /Show all bots$/.test(r.text) && !/tagged/.test(r.text), `One job: note counts every checked bot (${r.text})`);
  await p.click('#cover .cover-all'); await new Promise((s) => setTimeout(s, 300));
  r = await read(p);
  ok(r.hidden && /q=bot/.test(r.url) && !/one_job/.test(r.url), `Show all bots keeps the search (${r.url})`);
  await p.close();
  ok(!errs.length, 'no page or console errors' + (errs.length ? ': ' + errs.join(' | ') : ''));
  await b.close();
})().catch((e) => { console.log('FAIL crashed: ' + e.message); process.exit(1); });
