// GET /api/stats: leaderboards and play stats for the game-over screen and
// the /stats page. The answer is cached in Redis for 2 minutes, so a busy
// stats page costs about 14 Redis commands every 2 minutes, not per visit.
import { K, dayOf, hourOf, json, redis } from './_lib/db.js';
import { BUCKETS } from './_lib/rules.js';
import type { Stats } from '../src/score-types';

const SNAP_TTL = 120;
const LIVE_WINDOW = 10 * 60_000; // a run counts as "playing now" for 10 minutes
const CACHE = 'public, max-age=0, s-maxage=30, stale-while-revalidate=120';

// If Redis hiccups while the numbers are being rebuilt, the last good answer
// goes out instead of an error. It's kept for a week.
export async function GET() {
  try {
    const cached = await redis.get<Stats>(K.snap);
    if (cached) return json(cached, 200, CACHE);
    const stats = await compute(Date.now());
    const p = redis.pipeline();
    p.set(K.snap, stats, { ex: SNAP_TTL });
    p.set(K.lastGood, stats, { ex: 7 * 86400 });
    await p.exec();
    return json(stats, 200, CACHE);
  } catch (err) {
    console.error('stats failed', err);
    try {
      const old = await redis.get<Stats>(K.lastGood);
      if (old) return json(old, 200, 'no-store');
    } catch {
      // Redis is down altogether
    }
    return json({ error: 'stats are unavailable right now' }, 503);
  }
}

// zrange withScores answers [member, score, member, score, ...]
function pairs(flat: unknown[]): Array<[string, number]> {
  const out: Array<[string, number]> = [];
  for (let i = 0; i + 1 < flat.length; i += 2) out.push([String(flat[i]), Number(flat[i + 1])]);
  return out;
}

const num = (h: Record<string, unknown> | null, k: string) => Number(h?.[k] ?? 0) || 0;

async function compute(now: number): Promise<Stats> {
  const today = dayOf(now);
  const p = redis.pipeline();
  p.zremrangebyscore(K.live, 0, now - LIVE_WINDOW);
  p.zcard(K.live);
  p.hgetall(K.tot);
  p.hgetall(K.days);
  p.hgetall(K.hours);
  p.hgetall(K.hist);
  p.pfcount(K.players);
  p.pfcount(K.playersOn(today));
  p.zrange(K.board, 0, 19, { rev: true, withScores: true });
  p.zrange(K.boardOn(today), 0, 19, { rev: true, withScores: true });
  p.zrange(K.creators, 0, 9, { rev: true, withScores: true });
  p.zrange(K.bots, 0, 9, { rev: true, withScores: true });
  p.lrange(K.recent, 0, 19);
  const r = (await p.exec()) as unknown[];
  const tot = r[2] as Record<string, unknown> | null;
  const days = (r[3] ?? {}) as Record<string, unknown>;
  const hours = (r[4] ?? {}) as Record<string, unknown>;
  const hist = (r[5] ?? {}) as Record<string, unknown>;
  const all = pairs(r[8] as unknown[]);
  const onDay = pairs(r[9] as unknown[]);

  // display names for the board entries, and pruning of hour counts older than 8 days
  const keys = [...new Set([...all, ...onDay].map(([k]) => k))];
  const cutoff = hourOf(now - 8 * 86400_000);
  const old = Object.keys(hours).filter((h) => h < cutoff);
  const q = redis.pipeline();
  if (keys.length) q.hmget(K.names, ...keys);
  if (old.length) q.hdel(K.hours, ...old);
  const qr = keys.length || old.length ? ((await q.exec()) as unknown[]) : [];
  const names = (keys.length ? (qr[0] as Record<string, string> | null) : null) ?? {};
  const board = (rows: Array<[string, number]>) => rows.map(([k, score]) => ({ name: String(names[k] ?? k), score }));

  const dayList: Stats['days'] = [];
  for (let i = 29; i >= 0; i--) {
    const d = dayOf(now - i * 86400_000);
    dayList.push({ day: d, runs: num(days, d) });
  }
  const hourList: Stats['hours'] = [];
  for (let i = 7 * 24 - 1; i >= 0; i--) {
    const h = hourOf(now - i * 3600_000);
    hourList.push({ hour: h, runs: num(hours, h) });
  }

  return {
    at: now,
    live: Number(r[1]) || 0,
    totals: {
      runs: num(tot, 'runs'),
      done: num(tot, 'done'),
      bots: num(tot, 'bots'),
      shelves: num(tot, 'shelves'),
      meters: num(tot, 'meters'),
      rejected: num(tot, 'rejected'),
      players: Number(r[6]) || 0,
      playersToday: Number(r[7]) || 0,
      runsToday: num(days, today),
    },
    days: dayList,
    hours: hourList,
    hist: BUCKETS.map((from) => ({ from, runs: num(hist, String(from)) })),
    board: { all: board(all), today: board(onDay) },
    creators: pairs(r[10] as unknown[]).map(([key, bots]) => ({ key, bots })),
    bots: pairs(r[11] as unknown[]).map(([id, times]) => ({ id, times })),
    recent: ((r[12] ?? []) as Stats['recent']).filter((x) => x && typeof x === 'object'),
  };
}
