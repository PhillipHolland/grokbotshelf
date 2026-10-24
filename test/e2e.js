const puppeteer = require('puppeteer-core');
const BASE = process.argv[2] || 'http://localhost:8765/';
const SHOTS = process.argv[3];
const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) process.exitCode = 1; };
(async () => {
  const b = await puppeteer.launch({ executablePath: '/usr/bin/google-chrome', headless: 'new', args: ['--no-sandbox'] });
  const p = await b.newPage();
  const errs = []; p.on('pageerror', e => errs.push(e.message)); p.on('console', m => m.type() === 'error' && errs.push(m.text()));
  await p.setViewport({ width: 1280, height: 900 });
  await p.goto(BASE, { waitUntil: 'networkidle0' });
  const n = () => p.$$eval('.card', c => c.length);
  ok(await n() === 25, 'renders 25 cards (' + await n() + ')');
  ok((await p.$eval('#count', e => e.textContent)) === '25 bots', 'count says 25 bots');
  // typo search
  await p.type('#q', 'secruity');
  const names = await p.$$eval('.card h3', h => h.map(x => x.textContent));
  ok(names[0] === 'Security Audit Bot', 'typo "secruity" -> first result ' + names[0] + ' (' + names.length + ' results)');
  ok(await p.$$eval('.card mark', m => m.length) > 0, 'match highlighted with <mark>');
  await new Promise(r => setTimeout(r, 400));
  ok(p.url().includes('q=secruity'), 'URL has q: ' + p.url());
  // name ranking
  await p.click('#q', { clickCount: 3 }); await p.type('#q', 'mail');
  const n2 = await p.$$eval('.card h3', h => h.map(x => x.textContent));
  ok(['Grokbot Mail', 'Mail in X Chat'].includes(n2[0]) && ['Grokbot Mail', 'Mail in X Chat'].includes(n2[1]), 'name matches rank first for "mail": ' + n2.slice(0, 3).join(', '));
  // Esc clears
  await p.keyboard.press('Escape');
  ok(await n() === 25 && (await p.$eval('#q', e => e.value)) === '', 'Esc clears search');
  // keyboard nav: Down from search focuses first card, Right moves, Enter opens
  await p.focus('#q'); await p.keyboard.press('ArrowDown');
  let act = await p.evaluate(() => document.activeElement.id);
  ok(act === 'bot-archivist', 'ArrowDown from search focuses first card: ' + act);
  await p.keyboard.press('ArrowRight');
  act = await p.evaluate(() => document.activeElement.id);
  ok(act === 'bot-ibot-player', 'ArrowRight moves to next card: ' + act);
  await p.keyboard.press('ArrowDown');
  act = await p.evaluate(() => document.activeElement.id);
  ok(act === 'bot-apple-inventory-and-deal-bot' || act === 'bot-terminal-boss', 'ArrowDown moves down a row: ' + act);
  const popup = new Promise(r => b.once('targetcreated', async t => { const u = t.url(); const pg = await t.page().catch(() => null); if (pg) pg.close().catch(() => {}); r(u); }));
  await p.keyboard.press('Enter');
  const opened = await Promise.race([popup, new Promise(r => setTimeout(() => r('none'), 3000))]);
  ok(opened.startsWith('https://x.ai/bot/'), 'Enter opens focused bot: ' + opened);
  await p.bringToFront();
  // ⌘K / slash
  await p.click('h1'); await p.keyboard.press('/');
  ok(await p.evaluate(() => document.activeElement.id) === 'q', '/ focuses search');
  await p.click('h1'); await p.keyboard.down('Control'); await p.keyboard.press('k'); await p.keyboard.up('Control');
  ok(await p.evaluate(() => document.activeElement.id) === 'q', 'Ctrl/Cmd+K focuses search');
  // filters
  await p.click('#creators [data-creator="thecsguy"]');
  ok(await n() === 9, 'creator filter thecsguy -> 9 (' + await n() + ')');
  await p.click('#cats [data-cat="Security"]');
  await p.click('#cats [data-cat="Productivity"]');
  const n3 = await n();
  ok(n3 === 3, 'multi-select Security+Productivity for Nick -> 3 (' + n3 + ')');
  const chipCount = await p.$eval('#cats [data-cat="Developer"] .n', e => e.textContent);
  ok(chipCount === '1', 'chip counts update live (Developer for Nick = ' + chipCount + ')');
  ok(p.url().includes('creator=thecsguy') && p.url().includes('cat=security,productivity'), 'URL state: ' + p.url());
  await p.select('#sort', 'az');
  const az = await p.$$eval('.card h3', h => h.map(x => x.textContent));
  ok(JSON.stringify(az) === JSON.stringify([...az].sort((a, b) => a.localeCompare(b))) && p.url().includes('sort=az'), 'sort A-Z: ' + az.join(', '));
  await p.goBack(); await new Promise(r => setTimeout(r, 200));
  ok(!p.url().includes('sort=az') && await p.$eval('#sort', e => e.value) === 'featured', 'back button restores state: ' + p.url());
  // shareable URL loads state
  await p.goto(BASE + '?creator=phil_holland&cat=communication&sort=az', { waitUntil: 'networkidle0' });
  ok(await n() === 3 && await p.$eval('#creators [data-creator="phil_holland"]', e => e.getAttribute('aria-checked')) === 'true', 'URL state restores on load (' + await n() + ')');
  // empty state
  await p.goto(BASE + '?q=zzzzqqq', { waitUntil: 'networkidle0' });
  ok(await p.$eval('#empty', e => !e.hidden), 'empty state shows');
  await p.click('#empty-clear');
  ok(await n() === 25 && !p.url().includes('?'), 'clear filters restores 25');
  // deep link
  await p.goto(BASE + '?creator=phil_holland#bot-vuln-scout', { waitUntil: 'networkidle0' });
  await new Promise(r => setTimeout(r, 300));
  ok(await p.$eval('#bot-vuln-scout', e => e.classList.contains('flash')), 'deep link #bot-vuln-scout highlights card (filters cleared when hidden)');
  // copy link
  await b.defaultBrowserContext().overridePermissions(new URL(BASE).origin, ['clipboard-read', 'clipboard-write', 'clipboard-sanitized-write']);
  await p.goto(BASE, { waitUntil: 'networkidle0' });
  await p.click('#bot-archivist [data-copy]');
  await new Promise(r => setTimeout(r, 300));
  const clip = await p.evaluate(() => navigator.clipboard.readText()).catch(e => 'ERR ' + e.message);
  ok(clip === 'https://x.ai/bot/vAgUsbH4SHOudh96KXEk0', 'copy link copies x.ai URL: ' + clip);
  ok((await p.$eval('#toast', e => e.className)).includes('show'), 'toast shows');
  ok(errs.length === 0, 'no console errors ' + errs.join(' | '));
  if (SHOTS) {
    for (const scheme of ['light', 'dark']) {
      await p.emulateMediaFeatures([{ name: 'prefers-color-scheme', value: scheme }, { name: 'prefers-reduced-motion', value: 'reduce' }]);
      for (const [w, h, dpr, tag] of [[390, 844, 3, 'mobile-390'], [1280, 900, 2, 'desktop-1280']]) {
        await p.setViewport({ width: w, height: h, deviceScaleFactor: dpr, isMobile: w < 500, hasTouch: w < 500 });
        await p.goto(BASE, { waitUntil: 'networkidle0' }); await new Promise(r => setTimeout(r, 400));
        await p.screenshot({ path: `${SHOTS}/${tag}-${scheme}.png` });
        await p.setViewport({ width: w, height: h, deviceScaleFactor: w < 500 ? 2 : 1, isMobile: w < 500, hasTouch: w < 500 });
        await p.screenshot({ path: `${SHOTS}/${tag}-${scheme}-full.png`, fullPage: true });
      }
      await p.setViewport({ width: 1280, height: 900, deviceScaleFactor: 2 });
      await p.goto(BASE + '?q=secruity', { waitUntil: 'networkidle0' }); await new Promise(r => setTimeout(r, 300));
      await p.screenshot({ path: `${SHOTS}/search-typo-${scheme}.png` });
      await p.setViewport({ width: 390, height: 844, deviceScaleFactor: 3, isMobile: true, hasTouch: true });
      await p.goto(BASE + '?creator=thecsguy&cat=home,security', { waitUntil: 'networkidle0' }); await new Promise(r => setTimeout(r, 300));
      await p.evaluate(() => window.scrollTo(0, 330)); await new Promise(r => setTimeout(r, 200));
      await p.screenshot({ path: `${SHOTS}/mobile-390-filtered-${scheme}.png` });
    }
  }
  await b.close();
})();
