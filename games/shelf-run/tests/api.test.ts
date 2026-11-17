// End-to-end tests for the score API in api/, run against the in-memory Redis
// in tests/fake-redis.ts. Each test drives the real handlers with real
// Request objects, the way Vercel calls them.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { POST as start } from '../api/start';
import { POST as finish } from '../api/finish';
import { POST as name } from '../api/name';
import { GET as stats } from '../api/stats';
import { BOT_CREATOR } from '../api/_lib/bots';
import type { Ranks, Stats } from '../src/score-types';
import { fakeRedis } from './fake-redis';

const T0 = Date.UTC(2026, 10, 16, 12, 0, 0);
const BOT_IDS = Object.keys(BOT_CREATOR);

function post(path: string, body?: unknown, ip = '203.0.113.7') {
  return new Request(`https://shelf.test${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-forwarded-for': ip, 'user-agent': 'vitest' },
    body: body === undefined ? undefined : typeof body === 'string' ? body : JSON.stringify(body),
  });
}
const read = async <T = Record<string, unknown>>(res: Response) => ({ status: res.status, body: (await res.json()) as T });

async function startRun(ip?: string) {
  const r = await read<{ id: string }>(await start(post('/api/start', {}, ip)));
  expect(r.status).toBe(200);
  return r.body.id;
}

// A modest, believable 60 second run.
const goodRun = (over: Record<string, unknown> = {}) => ({
  score: 4000,
  t: 60,
  dist: 900,
  grabbed: 12,
  shelves: 2,
  close: 3,
  likes: 40,
  bots: BOT_IDS.slice(0, 8),
  ...over,
});

async function playAndFinish(over: Record<string, unknown> = {}, seconds = 61) {
  const id = await startRun();
  vi.setSystemTime(Date.now() + seconds * 1000);
  return { id, res: await read<Record<string, unknown>>(await finish(post('/api/finish', { id, ...goodRun(over) }))) };
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(T0);
  fakeRedis.reset();
});
afterEach(() => {
  vi.useRealTimers();
});

describe('POST /api/start', () => {
  it('returns a run id and records the start', async () => {
    const id = await startRun();
    expect(id).toMatch(/^[\w-]{16}$/);
    expect(await fakeRedis.get(`sr-dev:run:${id}`)).toEqual({ t0: T0 });
    expect(fakeRedis.ttl(`sr-dev:run:${id}`)).toBe(4 * 3600);
    expect(await fakeRedis.hgetall('sr-dev:tot')).toEqual({ runs: 1 });
    expect(await fakeRedis.zcard('sr-dev:live')).toBe(1);
  });

  it('gives every run its own id', async () => {
    const ids = new Set([await startRun(), await startRun(), await startRun()]);
    expect(ids.size).toBe(3);
  });

  it('rate limits one visitor to 40 starts per 10 minutes', async () => {
    for (let i = 0; i < 40; i++) await startRun();
    const res = await start(post('/api/start', {}));
    expect(res.status).toBe(429);
    // another visitor is unaffected
    await startRun('198.51.100.1');
    // and the limit resets in the next 10 minute slot
    vi.setSystemTime(T0 + 600_000);
    await startRun();
  });

  it('writes production keys only on the production deploy', async () => {
    vi.stubEnv('VERCEL_ENV', 'production');
    vi.resetModules();
    const { POST } = await import('../api/start');
    const r = await read<{ id: string }>(await POST(post('/api/start', {})));
    expect(await fakeRedis.get(`sr:run:${r.body.id}`)).toEqual({ t0: T0 });
    expect(await fakeRedis.get(`sr-dev:run:${r.body.id}`)).toBeNull();
    vi.resetModules();
  });
});

describe('POST /api/finish', () => {
  it('accepts a believable run without a name and holds a claim for it', async () => {
    const { id, res } = await playAndFinish();
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ claim: id, wouldRank: { all: 1, today: 1 } });
    expect(await fakeRedis.get(`sr-dev:claim:${id}`)).toEqual({ score: 4000, at: T0 + 61_000 });
    expect(fakeRedis.ttl(`sr-dev:claim:${id}`)).toBe(900);
    const tot = await fakeRedis.hgetall('sr-dev:tot');
    expect(tot).toMatchObject({ runs: 1, done: 1, bots: 12, shelves: 2, meters: 900 });
    expect(await fakeRedis.zcard('sr-dev:live')).toBe(0);
  });

  it('puts a named run straight on the board', async () => {
    const id = await startRun();
    vi.setSystemTime(T0 + 61_000);
    const res = await read<{ ranks: Ranks }>(await finish(post('/api/finish', { id, ...goodRun(), name: '@Nick' })));
    expect(res.body.ranks).toEqual({ all: 1, today: 1, best: 4000 });
    expect(await fakeRedis.zscore('sr-dev:lb:all', 'nick')).toBe(4000);
    expect(await fakeRedis.hmget('sr-dev:names', 'nick')).toEqual({ nick: '@Nick' });
  });

  it('keeps the best score per name', async () => {
    for (const score of [3000, 5000, 2000]) {
      const id = await startRun();
      vi.setSystemTime(Date.now() + 61_000);
      await finish(post('/api/finish', { id, ...goodRun({ score }), name: 'Nick' }));
    }
    expect(await fakeRedis.zscore('sr-dev:lb:all', 'nick')).toBe(5000);
  });

  it('takes each run id once', async () => {
    const { id } = await playAndFinish();
    const again = await finish(post('/api/finish', { id, ...goodRun() }));
    expect(again.status).toBe(404);
  });

  it('rejects unknown ids and missing bodies', async () => {
    expect((await finish(post('/api/finish', { id: 'nope', ...goodRun() }))).status).toBe(404);
    expect((await finish(post('/api/finish'))).status).toBe(404);
    expect((await finish(post('/api/finish', 'not json'))).status).toBe(404);
  });

  it('answers 400 for a malformed result', async () => {
    const { res } = await playAndFinish({ score: 'lots' });
    expect(res.status).toBe(400);
  });

  it('answers 422 and counts the rejection for an impossible run', async () => {
    const { res } = await playAndFinish({ score: 9_000_000 });
    expect(res.status).toBe(422);
    expect(res.body.error).toBe('run rejected: score too high');
    expect(await fakeRedis.hgetall('sr-dev:tot')).toMatchObject({ rejected: 1 });
    expect(await fakeRedis.zcard('sr-dev:lb:all')).toBe(0);
  });

  it('rejects a run that claims more game time than really passed', async () => {
    const { res } = await playAndFinish({}, 20);
    expect(res.status).toBe(422);
    expect(res.body.error).toBe('run rejected: game time longer than the run');
  });

  it('flags a name that is not allowed but still keeps the run claimable', async () => {
    const id = await startRun();
    vi.setSystemTime(T0 + 61_000);
    const res = await read(await finish(post('/api/finish', { id, ...goodRun(), name: 'x' })));
    expect(res.body).toMatchObject({ claim: id, nameError: 'name not allowed' });
  });

  it('counts published bots and their creators, ignoring unknown ids', async () => {
    const bots = [BOT_IDS[0], BOT_IDS[0], 'made-up-id', BOT_IDS[1]];
    await playAndFinish({ bots, shelves: 1, grabbed: 4 });
    expect(await fakeRedis.zscore('sr-dev:bots', BOT_IDS[0])).toBe(1);
    expect(await fakeRedis.zscore('sr-dev:bots', 'made-up-id')).toBeNull();
    const creators = await fakeRedis.zrange('sr-dev:creators', 0, -1, { withScores: true });
    const total = creators.filter((_, i) => i % 2 === 1).reduce((a, b) => (a as number) + (b as number), 0);
    expect(total).toBe(2);
  });

  it('keeps only the last 30 runs in the recent list', async () => {
    for (let i = 0; i < 32; i++) await playAndFinish();
    expect((await fakeRedis.lrange('sr-dev:recent', 0, -1)).length).toBe(30);
  });
});

describe('POST /api/name', () => {
  it('names a claimed run once', async () => {
    const { id } = await playAndFinish();
    const res = await read<{ ranks: Ranks }>(await name(post('/api/name', { claim: id, name: 'Shelf Fan' })));
    expect(res.status).toBe(200);
    expect(res.body.ranks).toEqual({ all: 1, today: 1, best: 4000 });
    const again = await name(post('/api/name', { claim: id, name: 'Shelf Fan' }));
    expect(again.status).toBe(404);
  });

  it('refuses a bad name without using up the claim', async () => {
    const { id } = await playAndFinish();
    expect((await name(post('/api/name', { claim: id, name: 'sh1t' }))).status).toBe(400);
    expect((await name(post('/api/name', { claim: id, name: 'Good Name' }))).status).toBe(200);
  });

  it('refuses a claim after 15 minutes', async () => {
    const { id } = await playAndFinish();
    vi.setSystemTime(Date.now() + 901_000);
    expect((await name(post('/api/name', { claim: id, name: 'Late Larry' }))).status).toBe(404);
  });

  it('ranks against the boards', async () => {
    const a = await playAndFinish({ score: 5000 });
    await name(post('/api/name', { claim: a.id, name: 'First' }));
    const b = await playAndFinish({ score: 4000 });
    expect(b.res.body.wouldRank).toEqual({ all: 2, today: 2 });
    const r = await read<{ ranks: Ranks }>(await name(post('/api/name', { claim: b.id, name: 'Second' })));
    expect(r.body.ranks).toMatchObject({ all: 2, today: 2 });
  });
});

describe('GET /api/stats', () => {
  it('answers zeros on an empty database', async () => {
    const res = await read<Stats>(await stats());
    expect(res.status).toBe(200);
    expect(res.body.totals.runs).toBe(0);
    expect(res.body.days).toHaveLength(30);
    expect(res.body.hours).toHaveLength(7 * 24);
    expect(res.body.board).toEqual({ all: [], today: [] });
  });

  it('reports runs, boards and display names', async () => {
    const a = await playAndFinish({ score: 5000 });
    await name(post('/api/name', { claim: a.id, name: '@Nick' }));
    await playAndFinish({ score: 1200 });
    const s = (await read<Stats>(await stats())).body;
    expect(s.totals).toMatchObject({ runs: 2, done: 2, runsToday: 2, players: 1 });
    expect(s.board.all).toEqual([{ name: '@Nick', score: 5000 }]);
    expect(s.board.today).toEqual([{ name: '@Nick', score: 5000 }]);
    expect(s.hist.find((h) => h.from === 5000)?.runs).toBe(1);
    expect(s.hist.find((h) => h.from === 1000)?.runs).toBe(1);
    expect(s.recent).toHaveLength(2);
    expect(s.recent[0]).toMatchObject({ name: null, score: 1200 });
  });

  it('caches its answer for 2 minutes', async () => {
    await stats();
    await playAndFinish();
    expect((await read<Stats>(await stats())).body.totals.runs).toBe(0);
    vi.setSystemTime(Date.now() + 121_000);
    expect((await read<Stats>(await stats())).body.totals.runs).toBe(1);
  });

  it('drops runs older than 10 minutes from "playing now"', async () => {
    await startRun();
    vi.setSystemTime(T0 + 5 * 60_000);
    await startRun();
    vi.setSystemTime(T0 + 11 * 60_000);
    expect((await read<Stats>(await stats())).body.live).toBe(1);
  });

  it('serves the last good answer when Redis fails', async () => {
    await playAndFinish();
    await stats();
    vi.setSystemTime(Date.now() + 121_000);
    vi.spyOn(fakeRedis, 'pipeline').mockImplementation(() => {
      throw new Error('redis is down');
    });
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const res = await read<Stats>(await stats());
    expect(res.status).toBe(200);
    expect(res.body.totals.runs).toBe(1);
  });

  it('answers 503 when there is nothing to fall back on', async () => {
    vi.spyOn(fakeRedis, 'pipeline').mockImplementation(() => {
      throw new Error('redis is down');
    });
    vi.spyOn(fakeRedis, 'get').mockRejectedValue(new Error('redis is down'));
    vi.spyOn(console, 'error').mockImplementation(() => {});
    expect((await stats()).status).toBe(503);
  });
});
