const puppeteer = require('puppeteer-core');
const BASE = process.argv[2] || 'http://localhost:8765/';
const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) process.exitCode = 1; };
const wait = (ms) => new Promise(r => setTimeout(r, ms));
(async () => {
  const b = await puppeteer.launch({ executablePath: '/usr/bin/google-chrome', headless: 'new', args: ['--no-sandbox'] });
  for (const vp of [{ width: 390, height: 844, isMobile: true, hasTouch: true }, { width: 1360, height: 900 }]) {
    const p = await b.newPage(); await p.setViewport(vp);
    // like live: vote tallies land late and the "Top voted" strip grows above the form after the jump
    const slugs = require('fs').readdirSync(require('path').join(__dirname, '../public/bot')).slice(0, 8).map((d) => 'bot-' + d);
    await p.setRequestInterception(true);
    p.on('request', (r) => { if (new URL(r.url()).pathname !== '/api/votes' || r.method() !== 'GET') return r.continue();
      setTimeout(() => r.respond({ status: 200, contentType: 'application/json', body: JSON.stringify({ global: true, scores: Object.fromEntries(slugs.map((s, i) => [s, { up: 9 - i, down: 0, score: 9 - i }])) }) }).catch(() => {}), 900); });
    const pos = () => p.evaluate(() => ({ add: Math.round(document.getElementById('add').getBoundingClientRect().top), dock: Math.round(document.getElementById('dock').getBoundingClientRect().bottom), hash: location.hash, y: scrollY, max: document.documentElement.scrollHeight - innerHeight }));
    const check = (d, m) => ok(d.hash === '#add' && (d.add >= d.dock && d.add <= d.dock + 40 || (d.y >= d.max - 1 && d.add >= d.dock)), `${vp.width}px ${m}: ${JSON.stringify(d)}`);
    await p.goto(BASE, { waitUntil: 'networkidle0' });
    // the header button is a link to /add (round 2 #11); old shared /#add links redirect to /add before the home page paints
    await Promise.all([p.waitForNavigation({ waitUntil: 'networkidle0' }), p.click('.add-top')]);
    ok(new URL(p.url()).pathname === '/add' && await p.$('#sub-form'), `${vp.width}px header "Add your bot" opens /add`);
    await p.goto(BASE + '#add', { waitUntil: 'networkidle0' });
    ok(new URL(p.url()).pathname === '/add' && !new URL(p.url()).hash && await p.$('#sub-form'), `${vp.width}px open /#add redirects to /add (${p.url()})`);
    // replace(), not a new entry: back goes to the page before, not to a /#add that would bounce again
    await p.goBack({ waitUntil: 'networkidle0' });
    ok(new URL(p.url()).pathname === '/add' && !/#add$/.test(p.url()), `${vp.width}px back from the redirect skips /#add (${p.url()})`);
    // in-page #add (a hash change on the loaded home page) still jumps to the home form
    await p.goto(BASE, { waitUntil: 'networkidle0' });
    await p.evaluate(() => { location.hash = '#add'; }); await wait(1600); check(await pos(), 'in-page #add');
    await p.reload({ waitUntil: 'networkidle0' });
    ok(new URL(p.url()).pathname === '/add', `${vp.width}px reload on /#add lands on /add (${p.url()})`);
    await p.goto(BASE + '#bot-x', { waitUntil: 'networkidle0' });
    await p.close();
  }
  await b.close();
})();
