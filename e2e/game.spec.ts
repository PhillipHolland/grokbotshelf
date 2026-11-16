// Smoke tests for the real game in a real browser. They check that the game
// boots without errors, a run plays, and the game-over screen sends a result
// the score API would accept. Run with `npm run test:e2e`.
import { expect, test, type Page } from '@playwright/test';
import { implausible, parseResult } from '../api/_lib/rules';

// The game's DEV-only debug handle (see the end of src/runner/main.ts).
interface RunHandle {
  S: { on: boolean; over: boolean; t: number; dist: number; score: number; hearts: number; lane: number; inv: number };
  start(): void;
  move(dir: -1 | 1): void;
  spawn(kind: string, lane?: number, z?: number): void;
}
declare global {
  interface Window {
    run: RunHandle;
  }
}

const EMPTY_STATS = {
  at: Date.now(),
  live: 0,
  totals: { runs: 0, done: 0, bots: 0, shelves: 0, meters: 0, players: 0, playersToday: 0, runsToday: 0, rejected: 0 },
  days: Array.from({ length: 30 }, (_, i) => ({ day: new Date(Date.now() - (29 - i) * 864e5).toISOString().slice(0, 10), runs: 0 })),
  hours: Array.from({ length: 168 }, (_, i) => ({ hour: new Date(Date.now() - (167 - i) * 36e5).toISOString().slice(0, 13), runs: 0 })),
  hist: [0, 1000, 2500, 5000, 10000, 25000, 50000, 100000].map((from) => ({ from, runs: 0 })),
  board: { all: [{ name: 'Tester', score: 1234 }], today: [{ name: 'Tester', score: 1234 }] },
  creators: [],
  bots: [],
  recent: [],
};

/** Stubs the score API and collects every error the page reports. */
async function open(page: Page, path = '/?q=0') {
  const errors: string[] = [];
  const finished: Array<Record<string, unknown>> = [];
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  page.on('console', (m) => {
    if (m.type() === 'error' || (m.type() === 'assert' && !m.text().includes('WebGL'))) errors.push(`console.${m.type()}: ${m.text()}`);
  });
  // only the four routes: api/_lib/*.ts are game modules the dev server must serve
  await page.route(/\/api\/(start|finish|name|stats)(\?|$)/, async (route) => {
    const url = new URL(route.request().url());
    const json = (body: unknown, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
    if (url.pathname === '/api/start') return json({ id: 'e2e-run' });
    if (url.pathname === '/api/finish') {
      finished.push(route.request().postDataJSON());
      return json({ claim: 'e2e-run', wouldRank: { all: 2, today: 1 } });
    }
    if (url.pathname === '/api/name') return json({ ranks: { all: 2, today: 1, best: 500 } });
    if (url.pathname === '/api/stats') return json(EMPTY_STATS);
    return json({ error: 'not stubbed' }, 404);
  });
  await page.goto(path);
  return { errors, finished };
}

test('boots to the start screen without errors', async ({ page }) => {
  const { errors } = await open(page);
  await expect(page.getByRole('heading', { name: 'Shelf Run' })).toBeVisible();
  await expect(page.locator('#go')).toHaveText('RUN');
  await expect(page.locator('.intro .chip')).toContainText('real bots');
  await page.waitForTimeout(500);
  expect(errors).toEqual([]);
});

test('plays a run and posts a result the API accepts', async ({ page }) => {
  const { errors, finished } = await open(page);
  await page.locator('#go').click();
  await expect(page.locator('#screen')).toBeHidden();

  // the run moves and scores
  await page.waitForFunction(() => window.run.S.t > 2);
  const s = await page.evaluate(() => ({ ...window.run.S }));
  expect(s.on).toBe(true);
  expect(s.dist).toBeGreaterThan(15);
  expect(Number((await page.locator('#score').textContent())?.replace(/\D/g, ''))).toBeGreaterThan(0);

  // lanes change from the keyboard
  await page.keyboard.press('ArrowLeft');
  await page.waitForFunction(() => window.run.S.lane === -1);

  // crash into a wall on the last heart. Software WebGL runs a few frames a
  // second, so playing through all three hearts would take too long.
  await page.evaluate(() => (window.run.S.hearts = 1));
  await page.waitForFunction(
    () => {
      const r = window.run;
      if (r.S.inv <= 0) r.spawn('wall', r.S.lane, 0.3);
      return r.S.over;
    },
    undefined,
    { polling: 100, timeout: 15_000 },
  );
  await expect(page.locator('.sheet.over')).toBeVisible();
  await expect(page.locator('.sheet.over .cause')).toContainText('wall');

  // the game-over screen sent a result that passes the server's own checks
  await expect.poll(() => finished.length).toBe(1);
  const sent = finished[0];
  expect(sent.id).toBe('e2e-run');
  const result = parseResult(sent);
  expect(result, JSON.stringify(sent)).not.toBeNull();
  expect(implausible(result!, result!.t + 1)).toBe('');

  // and offered to post a name, with today's board under it
  await expect(page.locator('#lb-name')).toBeVisible();
  await expect(page.locator('.lb-top li')).toHaveCount(1);
  await page.locator('#lb-name').fill('E2E Runner');
  await page.locator('.lb-form button').click();
  await expect(page.locator('.lb-as')).toContainText('E2E Runner');

  // a second run starts clean
  await page.locator('#go').click();
  await page.waitForFunction(() => window.run.S.on && window.run.S.hearts === 3 && window.run.S.t > 0.5);
  expect(errors).toEqual([]);
});

test('pauses and resumes', async ({ page }) => {
  const { errors } = await open(page);
  await page.locator('#go').click();
  await page.waitForFunction(() => window.run.S.t > 1);
  await page.keyboard.press('p');
  await expect(page.getByRole('heading', { name: 'Paused' })).toBeVisible();
  const t = await page.evaluate(() => window.run.S.t);
  await page.waitForTimeout(400);
  expect(await page.evaluate(() => window.run.S.t)).toBe(t);
  await page.locator('#go').click();
  await page.waitForFunction((t0) => window.run.S.t > t0 + 0.2, t);
  expect(errors).toEqual([]);
});

test('still boots and plays when the browser blocks storage', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(window, 'localStorage', {
      get() {
        throw new DOMException('The operation is insecure.', 'SecurityError');
      },
    });
  });
  const { errors } = await open(page);
  await page.locator('#go').click();
  await page.waitForFunction(() => window.run.S.t > 1);
  expect(errors).toEqual([]);
});

test('the stats page renders the leaderboard', async ({ page }) => {
  const { errors } = await open(page, '/stats');
  await expect(page.locator('#board')).toContainText('Tester');
  expect(errors).toEqual([]);
});
