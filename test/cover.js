// Shelf-tag coverage (round 2 #5): "Can it act?" options show their counts, and while a shelf-tag filter (Can it act?,
// apps, One job) is on, a note under the count says how many bots are tagged at all, with a "Show all bots" button that
// clears just those filters. Counts come from shelf-data.json. Usage: NODE_PATH=/path/to/node_modules node test/cover.js [base-url]
const puppeteer = require('puppeteer-core');
const BASE = process.argv[2] || 'http://localhost:8765/';
const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) process.exitCode = 1; };
(async () => {
  const data = (await (await fetch(new URL('shelf-data.json', BASE))).json()).bots;
  const any = data.filter((b) => b.meta).length, ag = data.filter((b) => b.meta && b.meta.agency).length;
  const by = (k) => data.filter((b) => b.meta && b.meta.agency === k).length;
  const b = await puppeteer.launch({ executablePath: '/usr/bin/google-chrome', headless: 'new', args: ['--no-sandbox'] });
  const errs = [];
  const open = async (path) => {
    const p = await b.newPage(); p.on('pageerror', (e) => errs.push(e.message));
    await p.setViewport({ width: 1280, height: 900 });
    await p.setRequestInterception(true);
    p.on('request', (r) => (/google-analytics|googletagmanager|\/_vercel\/|\/api\//.test(r.url()) ? r.abort() : r.continue()));
    await p.goto(new URL(path, BASE).href, { waitUntil: 'networkidle0' });
    return p;
  };
  const read = (p) => p.evaluate(() => ({ hidden: document.querySelector('#cover').hidden, text: document.querySelector('#cover').textContent, count: document.querySelector('#count').textContent,
    opts: [...document.querySelectorAll('#agency option')].map((o) => o.textContent), url: location.search }));
  let p = await open('/');
  let r = await read(p);
  ok(r.hidden, 'no note without a shelf-tag filter');
  ok(r.opts.join('|') === `Can it act?|Takes actions (${by('acts')})|Drafts for you (${by('drafts')})|Reads only (${by('reads')})`, `"Can it act?" options carry their counts (${r.opts.join(', ')})`);
  await p.select('#agency', 'acts'); await new Promise((s) => setTimeout(s, 300));
  r = await read(p);
  ok(!r.hidden && r.text.startsWith(`Only ${ag} of ${data.length} bots are tagged for \u201cCan it act?\u201d so far`) && /Show all bots$/.test(r.text) && r.count === `${by('acts')} bots`, `Takes actions: note shows ${ag} of ${data.length} (${r.text})`);
  await p.click('#cover .cover-all'); await new Promise((s) => setTimeout(s, 300));
  r = await read(p);
  ok(r.hidden && r.count === `${data.length} bots` && !/does=/.test(r.url), `Show all bots clears the filter and hides the note (${r.count}, "${r.url}")`);
  await p.close();
  p = await open('/?one_job=1&q=bot');
  r = await read(p);
  ok(!r.hidden && r.text.startsWith(`Only ${any} of ${data.length} bots are tagged by the shelf so far`), `One job: note counts every tagged bot (${r.text})`);
  await p.click('#cover .cover-all'); await new Promise((s) => setTimeout(s, 300));
  r = await read(p);
  ok(r.hidden && /q=bot/.test(r.url) && !/one_job/.test(r.url), `Show all bots keeps the search (${r.url})`);
  await p.close();
  ok(!errs.length, 'no page errors' + (errs.length ? ': ' + errs.join(' | ') : ''));
  await b.close();
})().catch((e) => { console.log('FAIL crashed: ' + e.message); process.exit(1); });
