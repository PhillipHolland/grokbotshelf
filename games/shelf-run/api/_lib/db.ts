// Shared bits for the score API: the Redis client, key names and small helpers.
// Files in api/_lib are not routes. Vercel skips folders that start with "_".
import { Redis } from '@upstash/redis';
import { createHmac, randomBytes } from 'node:crypto';

// KV_REST_API_URL and KV_REST_API_TOKEN come from the Upstash integration.
export const redis = Redis.fromEnv();

// Production keeps its own keys. Preview deploys and `vercel dev` share the
// same database, so they write under a different prefix and never touch the
// real leaderboard.
const P = process.env.VERCEL_ENV === 'production' ? 'sr:' : 'sr-dev:';

export const K = {
  run: (id: string) => `${P}run:${id}`, // a started run, deleted when it ends
  claim: (id: string) => `${P}claim:${id}`, // an ended run without a name, kept 15 min
  rate: (who: string, slot: number) => `${P}rate:${who}:${slot}`,
  tot: `${P}tot`, // hash of all-time totals
  days: `${P}days`, // hash: UTC date -> runs started
  hours: `${P}hours`, // hash: UTC hour (2026-11-06T19) -> runs started, last 8 days
  hist: `${P}hist`, // hash: score bucket -> ended runs
  players: `${P}players`, // HyperLogLog of hashed visitors, all time
  playersOn: (day: string) => `${P}players:${day}`,
  live: `${P}live`, // zset: run id -> start time, for "playing now"
  recent: `${P}recent`, // list of the last 30 ended runs
  board: `${P}lb:all`, // zset: name key -> best score
  boardOn: (day: string) => `${P}lb:day:${day}`,
  names: `${P}names`, // hash: name key -> name as typed
  creators: `${P}creators`, // zset: creator -> bots of theirs published
  bots: `${P}bots`, // zset: bot id -> times published
  snap: `${P}snap`, // cached /api/stats answer
  lastGood: `${P}snap:last`, // the last answer that worked, for when a rebuild fails
};

export const dayOf = (ms: number) => new Date(ms).toISOString().slice(0, 10);
export const hourOf = (ms: number) => new Date(ms).toISOString().slice(0, 13);
export const newId = () => randomBytes(12).toString('base64url');

// A one-way id for "unique players". The IP never gets stored. The HMAC key
// is the database token, so nobody without it can test guesses against it.
export function visitor(req: Request) {
  const ip = (req.headers.get('x-forwarded-for') ?? '').split(',')[0].trim() || req.headers.get('x-real-ip') || '';
  const ua = req.headers.get('user-agent') ?? '';
  return createHmac('sha256', process.env.KV_REST_API_TOKEN ?? 'dev')
    .update(`${ip}|${ua}`)
    .digest('base64url')
    .slice(0, 16);
}

export function json(data: unknown, status = 200, cache = 'no-store') {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': cache },
  });
}

export async function body(req: Request): Promise<Record<string, unknown>> {
  try {
    const b = await req.json();
    return b && typeof b === 'object' ? (b as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}
