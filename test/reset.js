// Reset (results row) and the Feedback links: Reset shows only when search, a filter or the sort is not the default,
// keeps its space while hidden, and puts everything back (search, filters, sort, collapsed groups, clean URL).
// Usage: NODE_PATH=/path/to/node_modules node test/reset.js [base-url]
const puppeteer = require('puppeteer-core');
const scrollAll = require('./scroll-all');
const BASE = process.argv[2] || 'http://localhost:8765/';
const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) process.exitCode = 1; };
const ckey = (x) => x.creator_handle.replace(/^@/, '').toLowerCase();
const settle = (ms = 300) => new Promise(r => setTimeout(r, ms));
(async () => {
  const BOTS = await (await fetch(new URL('bots.json', BASE))).json();
  const by = (h) => BOTS.filter((x) => ckey(x) === h), CAP = 3;
  const K = [...new Set(BOTS.map(ckey))].filter((k) => k && by(k).length > CAP + 1).sort((a, b) => by(b).length - by(a).length)[0];
  const b = await puppeteer.launch({ executablePath: '/usr/bin/google-chrome', headless: 'new', args: ['--no-sandbox'] });
  const p = await b.newPage();
  const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.setViewport({ width: 1280, height: 900 });
  const shown = () => p.$eval('#reset', e => e.classList.contains('on') && getComputedStyle(e).visibility === 'visible');
  const box = (s) => p.$eval(s, e => { const r = e.getBoundingClientRect(); return { top: Math.round(r.top + scrollY), h: Math.round(r.height), w: Math.round(r.width) }; });
  const path = () => { const u = new URL(p.url()); return u.pathname + u.search; };
  await p.goto(BASE, { waitUntil: 'networkidle0' }); await settle();
  await scrollAll(p);
  ok(!(await shown()), 'default home: Reset is hidden');
  ok(await p.$eval('#reset', e => getComputedStyle(e).display !== 'none' && e.getBoundingClientRect().width > 0), 'hidden Reset still takes its space (visibility, not display)');
  const fx = await p.$eval('#fb-x', e => e.href), fi = await p.$eval('.site-foot .fb-issue', e => e.href), ffx = await p.$eval('.site-foot .fb-x', e => e.href);
  const ftext = decodeURIComponent((fx.split('?text=')[1] || ''));
  ok(/^https:\/\/x\.com\/intent\/post\?text=/.test(fx) && fx === ffx, 'Feedback opens a prefilled X post: ' + fx);
  ok(/^@thecsguy @Phil_Holland /.test(ftext), 'Feedback post tags both @thecsguy and @Phil_Holland: ' + ftext);
  ok(fi === 'https://github.com/PhillipHolland/grokbotshelf/issues/new', 'Bug? Open an issue goes to GitHub issues/new');
  ok(await p.$eval('#fb-x', e => { const r = e.getBoundingClientRect(); return r.width > 0 && r.bottom > 0 && r.top < innerHeight; }), 'Feedback link is on screen on load');
  const status0 = await box('.status'), res0 = await box('#results');
  // Show more alone is not a reset-worthy change
  await p.click(`[data-more="${K}"]`); await settle();
  ok(path() === `/?more=${K}` && !(await shown()), `Show more (${path()}) keeps Reset hidden`);
  // search, a filter and a sort each show it
  await p.type('#q', 'mail'); await settle(500);
  ok(await shown(), 'search shows Reset');
  const status1 = await box('.status'), res1 = await box('#results');
  ok(status1.top === status0.top && status1.h === status0.h && res1.top === res0.top, `showing Reset moves nothing (results top ${res0.top} -> ${res1.top}, row ${status0.h}px -> ${status1.h}px)`);
  await p.click('#q', { clickCount: 3 }); await p.keyboard.press('Backspace'); await settle(500);
  ok(!(await shown()), 'clearing the search hides Reset again');
  const cat = BOTS[0].category;
  await p.select('#cats', cat); await settle();
  ok(await shown(), `category filter shows Reset (${cat})`);
  await p.goto(BASE + '?sort=newest', { waitUntil: 'networkidle0' }); await settle();
  ok(await shown(), 'sort=newest shows Reset');
  // everything at once, then Reset
  await p.goto(BASE + `?more=${K}`, { waitUntil: 'networkidle0' }); await settle();
  await p.type('#q', 'bot'); await p.select('#sort', 'az'); await p.select('#cats', '__onejob'); await settle(500);
  ok(/q=bot/.test(path()) && /sort=az/.test(path()) && /one_job=1/.test(path()), 'URL carries search, sort and filter: ' + path());
  // keyboard: Tab from the last filter chip lands on Reset with a visible focus ring, Enter resets
  // (the last control in the row: New this week; One job and collections are options in the category select)
  await p.evaluate(() => [...document.querySelectorAll('.filterbar button.chip')].filter((c) => !c.hidden).pop().focus()); await p.keyboard.press('Tab');
  ok(await p.evaluate(() => document.activeElement.id) === 'reset', 'Tab from the filter row reaches Reset');
  ok(await p.$eval('#reset', e => getComputedStyle(e).boxShadow !== 'none'), 'Reset has a visible focus ring');
  await p.keyboard.press('Enter'); await settle(500);
  ok(path() === '/', 'Reset cleans the URL (no ?q, ?sort, ?one_job or ?more): ' + path());
  ok(await p.$eval('#q', e => e.value) === '' && await p.$eval('#sort', e => e.value) === 'featured' && await p.$eval('#cats', e => e.value) === '' && await p.$eval('#creators', e => e.value) === '', 'search, sort and filters back to defaults');
  ok((await p.$$(`[aria-labelledby="g-${K}"] .card`)).length === CAP && !!(await p.$(`[data-more="${K}"]`)), `groups collapsed again (${K} shows ${CAP} and Show more)`);
  ok(!(await shown()), 'Reset hides itself afterwards');
  ok(await p.evaluate(() => document.activeElement.id) === 'q', 'focus moves to the search box (desktop)');
  ok(await p.$eval('#count', e => e.textContent) === `${BOTS.length} bots`, 'count shows the whole shelf again');
  // a creator filter from a link (?creator=) resets to the home page; no results shows Reset too
  await p.goto(BASE + '?creator=' + K, { waitUntil: 'networkidle0' }); await settle();
  ok(await shown() && await p.$eval('#creators', e => e.value) === K, `?creator=${K} shows Reset`);
  await p.click('#reset'); await settle();
  ok(path() === '/' && await p.$eval('#creators', e => e.value) === '', 'Reset drops the creator filter and goes to /');
  await p.type('#q', 'zzqxqzzqx'); await settle(500);
  ok(!(await p.$eval('#empty', e => e.hidden)) && await shown(), 'no results: Reset is shown next to the empty message');
  await p.click('#empty-clear'); await settle();
  ok(path() === '/' && !(await shown()), 'the empty-state button resets as well');
  // phone: 44px targets
  const m = await b.newPage();
  await m.setUserAgent('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1');
  await m.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
  await m.goto(BASE + '?q=mail', { waitUntil: 'networkidle0' }); await settle();
  const rb = await m.$eval('#reset', e => { const r = e.getBoundingClientRect(); return [r.width, r.height, getComputedStyle(e).visibility]; });
  const fb = await m.$eval('#fb-x', e => { const r = e.getBoundingClientRect(); return [r.width, r.height]; });
  ok(rb[2] === 'visible' && rb[0] >= 44 && rb[1] >= 44 && fb[1] >= 44, `390px: Reset ${rb[0]}x${rb[1]}, Feedback height ${fb[1]} (44px minimum)`);
  const fbar = await m.$eval('.filterbar', e => e.getBoundingClientRect().bottom), rt = await m.$eval('#reset', e => e.getBoundingClientRect().top);
  ok(rt - fbar < 40, `390px: Reset sits right under the filter bar (${Math.round(rt - fbar)}px)`);
  await m.tap('#reset'); await settle();
  ok(new URL(m.url()).search === '' && await m.evaluate(() => document.activeElement.id) === 'count', '390px: tap Reset clears, focus goes to the count (no keyboard pop-up)');
  ok(errs.length === 0, 'no page errors' + (errs.length ? ': ' + errs.join(' | ') : ''));
  await b.close();
})();
