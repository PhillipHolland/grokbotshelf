// Home page speed work: 3 cards per creator on Featured with Show more (kept in ?more=), search and filters over every bot,
// deep links to a card hidden by the cap, the single shelf-data.json request, and the 48px avatars.
// Usage: NODE_PATH=/path/to/node_modules node test/more.js [base-url]
const puppeteer = require('puppeteer-core');
// Clicks and menu changes paint the control first and re-render the cards one frame later: wait for that render
const painted = (p) => p.evaluate(() => new Promise((r) => requestAnimationFrame(() => setTimeout(r, 0))));
const BASE = process.argv[2] || 'http://localhost:8765/';
const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) process.exitCode = 1; };
// Same group key as app.js: handle, or ~name-slug for creators with no X handle
const ckey = (x) => x.creator_handle ? x.creator_handle.replace(/^@/, '').toLowerCase() : '~' + String(x.creator_name).toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/&/g, ' and ').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const settle = (ms = 250) => new Promise(r => setTimeout(r, ms));
(async () => {
  const BOTS = await (await fetch(new URL('bots.json', BASE))).json();
  const by = (h) => BOTS.filter((x) => ckey(x) === h), CAP = 3;
  const capped = [...new Set(BOTS.map(ckey))].filter((k) => by(k).length > CAP + 1).sort((a, b) => by(b).length - by(a).length);
  const b = await puppeteer.launch({ executablePath: '/usr/bin/google-chrome', headless: 'new', args: ['--no-sandbox'] });
  const p = await b.newPage();
  const errs = []; p.on('pageerror', e => errs.push(e.message));
  const json = []; p.on('request', r => /\.json(\?|$)/.test(r.url()) && !/\/api\//.test(r.url()) && json.push(new URL(r.url()).pathname + new URL(r.url()).search));
  await p.setViewport({ width: 1360, height: 900 });
  await p.goto(BASE, { waitUntil: 'networkidle0' });
  ok(json.length === 1 && /^\/shelf-data\.json\?v=[0-9a-f]{10}$/.test(json[0]), 'home loads one data file at a versioned URL: ' + json.join(', '));
  const inGroup = (k) => p.$$eval(`[aria-labelledby="g-${k}"] .card`, c => c.map(x => x.querySelector('h3').textContent));
  const btn = (k) => p.$(`[data-more="${k}"]`);
  ok(capped.length > 0, `${capped.length} creators have more than ${CAP + 1} bots: ${capped.join(', ')}`);
  let good = true;
  for (const k of capped) { const names = await inGroup(k), t = await p.$eval(`[data-more="${k}"]`, e => e.textContent).catch(() => ''); if (names.length !== CAP || t !== `Show ${by(k).length - CAP} more`) good = false; }
  ok(good, `each long group shows ${CAP} cards and a "Show N more" button`);
  ok((await p.$$('[data-more]')).length === capped.length, 'no Show more button on shorter groups');
  // search runs over every bot, including ones the cap hides
  const K = capped[0], shown = await inGroup(K), hidden = by(K).filter((x) => !shown.includes(x.name));
  ok(hidden.length === by(K).length - CAP, `${K}: ${hidden.length} bots hidden on the home view`);
  await p.type('#q', hidden[hidden.length - 1].name); await settle();
  ok((await p.$$eval('.card h3', h => h.map(x => x.textContent))).includes(hidden[hidden.length - 1].name), `search finds a bot hidden by the cap: ${hidden[hidden.length - 1].name}`);
  await p.click('#q', { clickCount: 3 }); await p.type('#q', K); await settle();
  const all = await p.$$eval('.card h3', h => h.map(x => x.textContent));
  ok(by(K).every((x) => all.includes(x.name)) && !(await p.$('[data-more]')), `search "${K}" shows all ${by(K).length} of their bots, no Show more`);
  await p.keyboard.press('Escape');
  ok((await inGroup(K)).length === CAP && await btn(K), 'Esc goes back to the capped home view');
  // a filter shows every match too
  await p.select('#creators', K); await painted(p);
  ok((await p.$$('#results .card')).length === by(K).length && !(await p.$('[data-more]')), `creator filter ${K} shows all ${by(K).length}`);
  await p.goto(BASE, { waitUntil: 'networkidle0' });
  // Show more: the rest of the group appears, the URL keeps it, focus lands on the first new card, arrows keep working
  const btnY = await p.$eval(`[data-more="${K}"]`, e => { e.scrollIntoView({ block: 'center' }); return 1; });
  await settle(300); await p.click(`[data-more="${K}"]`); await painted(p);
  const ids = await p.$$eval(`[aria-labelledby="g-${K}"] .card`, c => c.map(x => x.id));
  ok(btnY && ids.length === by(K).length && !(await btn(K)), `Show more reveals all ${by(K).length} of ${K}'s bots (${ids.length})`);
  ok(new URL(p.url()).searchParams.get('more') === K, 'URL keeps it: ' + p.url());
  ok(await p.evaluate(() => document.activeElement.id) === ids[CAP], 'focus moves to the first new card: ' + ids[CAP]);
  await p.keyboard.press('ArrowRight');
  ok(await p.evaluate(() => document.activeElement.id) === ids[CAP + 1], 'ArrowRight still moves between cards');
  await p.reload({ waitUntil: 'networkidle0' });
  ok((await inGroup(K)).length === by(K).length && (await p.$$('[data-more]')).length === capped.length - 1, '?more= restores on load');
  if (capped.length > 1) {
    await p.goto(BASE + `?more=${capped[1]},nobody,${capped[1]}`, { waitUntil: 'networkidle0' });
    ok((await inGroup(capped[1])).length === by(capped[1]).length && new URL(p.url()).searchParams.get('more') === capped[1], `?more= ignores unknown and repeated keys (${p.url()})`);
  }
  // deep link to a card the cap hides expands its group and highlights it
  const id = ids[ids.length - 1];
  await p.goto(BASE + '#' + id, { waitUntil: 'networkidle0' }); await settle(400);
  ok(await p.$eval('#' + id, e => e.classList.contains('flash')).catch(() => false) && (await inGroup(K)).length === by(K).length, `deep link #${id} expands ${K} and highlights the card`);
  // small avatars
  await p.goto(BASE, { waitUntil: 'networkidle0' });
  const av = await p.$$eval('#results .card img', i => i.map(x => [x.getAttribute('src'), x.getAttribute('width'), x.getAttribute('height')]));
  ok(av.length > 0 && av.every(([s, w, h]) => /^\/avatars\/48\/[^?]+\.webp\?v=[0-9a-f]{10}$/.test(s) && w === '16' && h === '16'), `card avatars use the 48px copies at 16x16 (${av.length})`);
  const gh = await p.$$eval('.ghead img', i => i.map(x => [x.getAttribute('src'), x.loading, x.getAttribute('width'), x.getAttribute('height'), x.getAttribute('srcset') || '']));
  ok(gh.length > 0 && gh.every(([s, l, w, h, ss]) => /^\/avatars\/48\//.test(s) && l === 'lazy' && w === '40' && h === '40' && / 48w, .* 128w$/.test(ss)), `group-header avatars: 48px copy, 2x original in srcset, lazy, 40x40 (${gh.length})`);
  ok(!errs.length, 'no page errors' + (errs.length ? ': ' + errs.join(' | ') : ''));
  await b.close();
})();
