// Round 4 #6: the role filter offers only roles that 5+ bots name with that exact word (or its plural) in their own
// name or description, and the count says exactly that ("7 bots that say “chief of staff”"). With no such role the
// select is not there. Usage: NODE_PATH=/path/to/node_modules node test/roles.js [base-url]
const puppeteer = require('puppeteer-core'), tempSite = require('./tempsite');
const BASE = process.argv[2] || 'http://localhost:8765/';
const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) process.exitCode = 1; };
const UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1';
// Independent of scripts/build.js: the word, its plural, whole words only
const WORD = { 'Chief of staff': /\bchiefs? of staff\b/i, Coach: /\bcoach(es)?\b/i, Tutor: /\btutors?\b/i, Scout: /\bscouts?\b/i, Manager: /\bmanagers?\b/i, Planner: /\bplanners?\b/i, Assistant: /\bassistants?\b/i,
  Researcher: /\bresearchers?\b/i, Advisor: /\badvis[oe]rs?\b/i, Analyst: /\banalysts?\b/i, Mentor: /\bmentors?\b/i, CFO: /\bcfos?\b/i };
(async () => {
  const b = await puppeteer.launch({ executablePath: '/usr/bin/google-chrome', headless: 'new', args: ['--no-sandbox'] });
  const errs = [];
  async function open(base, path, { w = 1280 } = {}) {
    const p = await b.newPage(); p.on('pageerror', (e) => errs.push(e.message));
    p.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errs.push('console: ' + m.text()); });
    const mob = w < 700;
    await p.setViewport({ width: w, height: mob ? 844 : 900, isMobile: mob, hasTouch: mob });
    if (mob) await p.setUserAgent(UA);
    await p.evaluateOnNewDocument(() => { window.__cls = 0; new PerformanceObserver((l) => l.getEntries().forEach((e) => { if (!e.hadRecentInput) window.__cls += e.value; })).observe({ type: 'layout-shift', buffered: true }); });
    await p.setRequestInterception(true);
    p.on('request', (r) => (/google-analytics|googletagmanager|\/_vercel\/|\/api\//.test(r.url()) ? r.abort() : r.continue()));
    await p.goto(new URL(path, base).href, { waitUntil: 'networkidle0' });
    return p;
  }
  const bots = await (await fetch(new URL('/bots.json', BASE))).json();
  const says = (x, re) => re.test(`${x.name} ${x.description}`);
  const p = await open(BASE, '/');
  const opts = await p.$$eval('#roles option', (o) => o.map((x) => [x.value, x.textContent]));
  ok(opts.length > 1 && opts[0][1] === 'Any role' && opts.slice(1).every(([, t]) => /^(.+) \((\d+)\)$/.test(t) && Number(t.match(/\((\d+)\)$/)[1]) >= 5), `roles offered: ${opts.slice(1).map((o) => o[1]).join(', ')}`);
  for (const [, t] of opts.slice(1)) {
    const [, label, n] = t.match(/^(.+) \((\d+)\)$/), re = WORD[label] || new RegExp(`\\b${label.toLowerCase()}s?\\b`, 'i');
    ok(bots.filter((x) => says(x, re)).length === Number(n), `${label}: ${n} bots use the exact word (independent count ${bots.filter((x) => says(x, re)).length})`);
  }
  const lower = Object.entries(WORD).filter(([l, re]) => bots.filter((x) => says(x, re)).length < 5).map(([l]) => l);
  ok(lower.every((l) => !opts.some(([, t]) => t.startsWith(l + ' ('))), `roles under 5 bots are not offered (${lower.join(', ') || 'none here'})`);
  ok(await p.$eval('#roles', (e) => e.closest('.selwrap').nextElementSibling.id === 'fresh'), 'the role select sits right before New this week');
  await p.close();
  for (const w of [1280, 390]) {
    const h = await open(BASE, '/', { w });
    const r = await h.evaluate(() => { const fb = document.querySelector('.filterbar'), one = document.querySelector('#fresh'), s = document.querySelector('#roles');
      return { rows: Math.round(fb.getBoundingClientRect().height / one.getBoundingClientRect().height), h: s.getBoundingClientRect().height, fits: s.scrollWidth <= s.clientWidth + 1, cls: window.__cls }; });
    ok((w < 700 ? r.h >= 44 : r.rows === 1) && r.cls === 0, `${w}: ${w < 700 ? `44px select (${r.h})` : 'one filter row'}, CLS ${r.cls}`);
    const val = opts.find(([v]) => v === 'chief-of-staff') ? 'chief-of-staff' : opts[1][0];
    await h.select('#roles', val); await new Promise((x) => setTimeout(x, 400));
    const label = opts.find(([v]) => v === val)[1].replace(/ \(\d+\)$/, ''), re = WORD[label];
    const f = await h.evaluate(() => ({ url: location.search, count: document.querySelector('#count').textContent, on: document.querySelector('#roles').classList.contains('on'),
      cards: [...document.querySelectorAll('#results .card')].map((c) => c.querySelector('h3, .ttl').textContent + ' ' + (c.querySelector('.desc') || c).textContent) }));
    const want = bots.filter((x) => says(x, re)).length;
    ok(f.url === `?role=${val}` && f.on && f.count === `${want} bots that say \u201c${label.toLowerCase()}\u201d` && f.cards.length === want, `${w}: "${f.count}", ${f.cards.length} cards, url ${f.url}`);
    ok(f.cards.every((t) => re.test(t)), `${w}: every card shown has the word in its name or description`);
    await h.click('#reset'); await new Promise((x) => setTimeout(x, 400));
    ok(await h.evaluate(() => location.search === '' && document.querySelector('#roles').value === '' && /^\d+ bots$/.test(document.querySelector('#count').textContent)), `${w}: Reset clears the role`);
    await h.close();
  }
  const d = await open(BASE, '/?role=coach&q=fitness');
  ok(await d.evaluate(() => document.querySelector('#roles').value === 'coach' && / that say(s)? \u201ccoach\u201d$/.test(document.querySelector('#count').textContent)), `a /?role=coach link opens filtered, with search too (${await d.$eval('#count', (e) => e.textContent)})`);
  await d.close();
  // Landing on a role view: the first groups render at real size, nothing moves after load (was 0.003 at 1280)
  for (const [path, w] of [['/?role=chief-of-staff', 1280], ['/?role=tutor', 1280], ['/?role=coach', 390]]) {
    const c = await open(BASE, path, { w }); await new Promise((x) => setTimeout(x, 800));
    const cls = await c.evaluate(() => window.__cls); ok(cls === 0, `${path} at ${w}px: CLS ${cls.toFixed(4)} on load`); await c.close();
  }
  const u = await open(BASE, '/?role=wizard');
  ok(await u.evaluate(() => location.search === '' && document.querySelector('#roles').value === ''), 'an unknown ?role= is ignored');
  await u.close();
  // A catalog where no role reaches 5 bots: no select, and the page works
  const site = await tempSite(({ J, W }) => W('bots.json', J('bots.json').slice(0, 12)));
  try {
    const z = await open(site.base, '/?role=coach');
    ok(await z.evaluate(() => !document.querySelector('#roles') && document.querySelector('#count').textContent === '12 bots' && location.search === ''), 'no role with 5+ bots: no select, /?role= ignored, the shelf still loads');
    await z.close();
  } finally { site.close(); }
  ok(!errs.length, `no page or console errors (${errs.slice(0, 3).join(' | ')})`);
  await b.close();
})().catch((e) => { console.error(e); process.exit(1); });
