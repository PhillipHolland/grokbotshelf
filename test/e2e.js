const puppeteer = require('puppeteer-core');
const scrollAll = require('./scroll-all');
// Clicks and menu changes paint the control first and re-render the cards one frame later: wait for that render
const painted = (p) => p.evaluate(() => new Promise((r) => requestAnimationFrame(() => setTimeout(r, 0))));
const BASE = process.argv[2] || 'http://localhost:8765/';
const SHOTS = process.argv[3];
const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) process.exitCode = 1; };
// Expected numbers come from the bots.json being served, so the test keeps up with the catalog.
const fold = (s) => String(s).toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '');
// Same group key as app.js: handle, or ~name-slug for creators with no X handle
const ckey = (x) => x.creator_handle ? x.creator_handle.replace(/^@/, '').toLowerCase() : '~' + String(x.creator_name).toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/&/g, ' and ').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
(async () => {
  const BOTS = await (await fetch(new URL('bots.json', BASE))).json();
  const TOTAL = BOTS.length, by = (h) => BOTS.filter((x) => ckey(x) === h);
  // The unfiltered home shows the first 3 bots per creator (all of them when a creator has 4 or fewer) plus a Show more button
  const CAP = 3, groups = [...new Set(BOTS.map(ckey))].map((k) => [k, by(k).length]);
  const HOME = groups.reduce((t, [, c]) => t + (c <= CAP + 1 ? c : CAP), 0), capped = groups.filter(([, c]) => c > CAP + 1);
  // typing re-renders after a 100ms debounce
  const settle = () => new Promise(r => setTimeout(r, 250));
  const b = await puppeteer.launch({ executablePath: '/usr/bin/google-chrome', headless: 'new', args: ['--no-sandbox'] });
  const p = await b.newPage();
  // /api/* and /_vercel/* only exist on Vercel, so the local server 404s them; any other failed request counts as an error
  const errs = []; p.on('pageerror', e => errs.push(e.message));
  p.on('console', m => m.type() === 'error' && !/^Failed to load resource/.test(m.text()) && errs.push(m.text()));
  p.on('response', r => r.status() >= 400 && !/\/(api|_vercel)\//.test(r.url()) && !(r.status() === 404 && r.request().isNavigationRequest()) && errs.push(r.status() + ' ' + r.url()));
  await p.setViewport({ width: 1360, height: 900 });
  await p.goto(BASE, { waitUntil: 'networkidle0' });
  await scrollAll(p);
  // Shelf cards only; the "From the builders" strip repeats a few bots with f- ids
  const n = () => p.$$eval('#results .card:not([id^="f-"])', c => c.length);
  ok(await n() === HOME, `home renders ${HOME} of ${TOTAL} cards, ${CAP} per long group (${await n()})`);
  ok((await p.$eval('#count', e => e.textContent)) === `${TOTAL} bots`, `count says ${TOTAL} bots`);
  // typo search
  await p.type('#q', 'secruity'); await settle();
  const names = await p.$$eval('.card h3', h => h.map(x => x.textContent));
  ok(names[0] === 'Security Audit Bot', 'typo "secruity" -> first result ' + names[0] + ' (' + names.length + ' results)');
  ok(await p.$$eval('.card mark', m => m.length) > 0, 'match highlighted with <mark>');
  await new Promise(r => setTimeout(r, 400));
  ok(p.url().includes('q=secruity'), 'URL has q: ' + p.url());
  // name ranking
  await p.click('#q', { clickCount: 3 }); await p.type('#q', 'mail'); await settle();
  const n2 = await p.$$eval('.card h3', h => h.map(x => x.textContent));
  const named = BOTS.filter((x) => fold(x.name).includes('mail')).map((x) => x.name);
  ok(named.length >= 2 && named.includes('Grokbot Mail') && JSON.stringify(n2.slice(0, named.length).sort()) === JSON.stringify(named.slice().sort()) && n2.length > named.length,
    `bots named "mail" (${named.length}) rank before description-only matches: ` + n2.slice(0, named.length + 1).join(', '));
  // Esc clears
  await p.keyboard.press('Escape');
  ok(await n() === HOME && (await p.$eval('#q', e => e.value)) === '', 'Esc clears search');
  // keyboard nav: Down from search focuses first card, Right moves, Enter opens
  await p.focus('#q'); await p.keyboard.press('ArrowDown');
  // On the home Featured view the first cards are the builders strip (ids f-bot-<slug>, in config.js order)
  const ids = await p.$$eval('#results .card', c => c.map(x => x.id));
  const first = await p.evaluate(() => 'f-bot-' + window.BUILDERS.feature[0].toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''));
  let act = await p.evaluate(() => document.activeElement.id);
  ok(act === first && ids[0] === first, 'ArrowDown from search focuses first card: ' + act);
  await p.keyboard.press('ArrowRight');
  act = await p.evaluate(() => document.activeElement.id);
  ok(act === ids[1], 'ArrowRight moves to next card: ' + act);
  const top = (id) => p.$eval('#' + id, e => e.getBoundingClientRect().top + scrollY);
  const prevTop = await top(act);
  await p.keyboard.press('ArrowDown');
  act = await p.evaluate(() => document.activeElement.id);
  ok(/bot-/.test(act) && await top(act) > prevTop, 'ArrowDown moves down a row: ' + act);
  // Enter does what a click does: opens the bot's own page
  await Promise.all([p.waitForNavigation({ waitUntil: 'networkidle0' }), p.keyboard.press('Enter')]);
  ok(new URL(p.url()).pathname === '/bot/' + act.replace(/^(f-)?bot-/, ''), 'Enter opens focused bot page: ' + p.url());
  await p.goto(BASE, { waitUntil: 'networkidle0' });
  // ⌘K / slash
  await p.click('h1'); await p.keyboard.press('/');
  ok(await p.evaluate(() => document.activeElement.id) === 'q', '/ focuses search');
  await p.click('h1'); await p.keyboard.down('Control'); await p.keyboard.press('k'); await p.keyboard.up('Control');
  ok(await p.evaluate(() => document.activeElement.id) === 'q', 'Ctrl/Cmd+K focuses search');
  // filters
  // filters: creator and category are <select>s; several categories at once come from the URL (cat=a,b)
  const nick = by('thecsguy');
  await p.select('#creators', 'thecsguy'); await painted(p);
  ok(await n() === nick.length, `creator filter thecsguy -> ${nick.length} (${await n()})`);
  const cat1 = nick[0].category;
  await p.select('#cats', cat1); await painted(p);
  ok(await n() === nick.filter((x) => x.category === cat1).length, `category ${cat1} for Nick -> ${await n()}`);
  ok(new URL(p.url()).pathname === '/@thecsguy' && p.url().includes('cat='), 'URL state: ' + p.url());
  const two = [...new Set(nick.map((x) => x.category))].slice(0, 2), slug = (c) => fold(c).replace(/&/g, ' and ').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  await p.goto(BASE + `?creator=thecsguy&cat=${two.map(slug).join(',')}`, { waitUntil: 'networkidle0' });
  const n3 = await n(), want3 = nick.filter((x) => two.includes(x.category)).length;
  ok(n3 === want3 && await p.$eval('#cats', e => e.value) === '__multi', `multi-category ${two.join(' + ')} for Nick -> ${want3} (${n3})`);
  await p.select('#sort', 'az'); await painted(p);
  const az = await p.$$eval('.card h3', h => h.map(x => x.textContent));
  ok(JSON.stringify(az) === JSON.stringify([...az].sort((a, b) => a.localeCompare(b))) && p.url().includes('sort=az'), 'sort A-Z: ' + az.join(', '));
  await p.goBack(); await new Promise(r => setTimeout(r, 200));
  ok(!p.url().includes('sort=az') && await p.$eval('#sort', e => e.value) === 'featured', 'back button restores state: ' + p.url());
  // shareable URL loads state
  const philCat = by('phil_holland')[0].category, wantPhil = by('phil_holland').filter((x) => x.category === philCat).length;
  await p.goto(BASE + `?creator=phil_holland&cat=${slug(philCat)}&sort=az`, { waitUntil: 'networkidle0' });
  ok(await n() === wantPhil && await p.$eval('#creators', e => e.value) === 'phil_holland' && await p.$eval('#sort', e => e.value) === 'az', `URL state restores on load (${await n()} of ${wantPhil})`);
  // empty state
  await p.goto(BASE + '?q=zzzzqqq', { waitUntil: 'networkidle0' });
  ok(await p.$eval('#empty', e => !e.hidden), 'empty state shows');
  await p.click('#empty-clear'); await painted(p);
  ok(await n() === HOME && !p.url().includes('?') && await p.$eval('#count', e => e.textContent) === `${TOTAL} bots`, `clear filters restores the home view (${HOME} shown of ${TOTAL})`);
  // deep link
  await p.goto(BASE + '?creator=phil_holland#bot-vuln-scout', { waitUntil: 'networkidle0' });
  await new Promise(r => setTimeout(r, 360));
  ok(await p.$eval('#bot-vuln-scout', e => e.classList.contains('flash')), 'deep link #bot-vuln-scout highlights card (filters cleared when hidden)');
  // copy link
  await b.defaultBrowserContext().overridePermissions(new URL(BASE).origin, ['clipboard-read', 'clipboard-write', 'clipboard-sanitized-write']);
  await p.goto(BASE, { waitUntil: 'networkidle0' });
  await scrollAll(p);
  // scroll first and let off-screen cards finish laying out, so the click lands on the button and not the card
  await p.$eval('#bot-archivist [data-copy]', e => e.scrollIntoView({ block: 'center' }));
  await new Promise(r => setTimeout(r, 300));
  await p.click('#bot-archivist [data-copy]');
  await new Promise(r => setTimeout(r, 360));
  const clip = await p.evaluate(() => navigator.clipboard.readText()).catch(e => 'ERR ' + e.message);
  const archivist = BOTS.find((x) => x.name === 'Archivist').url;
  ok(clip === archivist, 'copy link copies x.ai URL: ' + clip);
  ok((await p.$eval('#toast', e => e.className)).includes('show'), 'toast shows');
  ok(errs.length === 0, 'no console errors ' + errs.join(' | '));
  if (SHOTS) {
    for (const scheme of ['light', 'dark']) {
      await p.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'reduce' }]);
      await p.evaluate((s) => localStorage.setItem('theme', s), scheme);
      for (const [w, h, dpr, tag] of [[390, 844, 3, 'mobile-390'], [1360, 900, 2, 'desktop-1360']]) {
        await p.setViewport({ width: w, height: h, deviceScaleFactor: dpr, isMobile: w < 500, hasTouch: w < 500 });
        await p.goto(BASE, { waitUntil: 'networkidle0' }); await new Promise(r => setTimeout(r, 400));
        await p.screenshot({ path: `${SHOTS}/${tag}-${scheme}.png` });
        await p.setViewport({ width: w, height: h, deviceScaleFactor: w < 500 ? 2 : 1, isMobile: w < 500, hasTouch: w < 500 });
        await p.screenshot({ path: `${SHOTS}/${tag}-${scheme}-full.png`, fullPage: true });
      }
      await p.setViewport({ width: 1360, height: 900, deviceScaleFactor: 2 });
      await p.goto(BASE + '?q=secruity', { waitUntil: 'networkidle0' }); await new Promise(r => setTimeout(r, 360));
      await p.screenshot({ path: `${SHOTS}/search-typo-${scheme}.png` });
      await p.setViewport({ width: 390, height: 844, deviceScaleFactor: 3, isMobile: true, hasTouch: true });
      await p.goto(BASE + '?creator=thecsguy&cat=home,security', { waitUntil: 'networkidle0' }); await new Promise(r => setTimeout(r, 360));
      await p.evaluate(() => window.scrollTo(0, 336)); await new Promise(r => setTimeout(r, 200));
      await p.screenshot({ path: `${SHOTS}/mobile-390-filtered-${scheme}.png` });
    }
  }
  await b.close();
})();
