// What a real run can look like, and what a leaderboard name can be.
//
// The game runs in the browser, so a determined cheater can always send a fake
// result. These checks make faking expensive: the server times every run
// itself, and every number in the result has to fit inside what the game
// allows in that time. A made-up 10 million point run would have to sit open
// for hours first.
import { BOT_CREATOR } from './bots.js';

export interface Result {
  score: number;
  t: number; // seconds of game time
  dist: number; // meters
  grabbed: number;
  shelves: number;
  close: number;
  likes: number;
  bots: string[]; // ids of bots on published shelves
}

const int = (v: unknown, max: number) => (typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= max ? Math.floor(v) : -1);

export function parseResult(b: Record<string, unknown>): Result | null {
  const r = {
    score: int(b.score, 1e8),
    t: typeof b.t === 'number' && Number.isFinite(b.t) && b.t > 0 && b.t < 4 * 3600 ? b.t : -1,
    dist: int(b.dist, 1e6),
    grabbed: int(b.grabbed, 1e5),
    shelves: int(b.shelves, 1e5),
    close: int(b.close, 1e5),
    likes: int(b.likes, 1e6),
    bots: Array.isArray(b.bots) ? b.bots.filter((x): x is string => typeof x === 'string' && x.length < 40).slice(0, 400) : [],
  };
  return Object.values(r).some((v) => v === -1) ? null : r;
}

// Meters covered after t seconds at full speed. Mirrors speedAt() in
// src/runner/main.ts: 10 m/s, plus 0.17 m/s every second, capped at 27 m/s.
// Turbo adds up to 9 m/s for 5 seconds, and a power-up shows up at most
// once every 26 seconds, so each one is worth up to 45 more meters.
export function maxDist(t: number) {
  const base = t <= 100 ? 10 * t + 0.085 * t * t : 1850 + 27 * (t - 100);
  return base + 45 * (Math.floor(t / 26) + 1);
}

// Returns why the run can't be real, or '' when it fits. Each limit is loose
// on purpose, so a very good real run never gets thrown out.
export function implausible(r: Result, elapsed: number): string {
  if (r.t > elapsed + 3) return 'game time longer than the run';
  if (r.dist > maxDist(r.t) * 1.03 + 10) return 'too far';
  if (r.grabbed > 6 * r.t + 10) return 'too many bots';
  if (r.shelves * 4 > r.grabbed) return 'too many shelves';
  if (r.close > 2 * r.t + 5) return 'too many close calls'; // close calls plus Turbo smashes
  if (r.likes > 15 * r.t + 20) return 'too many likes';
  if (r.bots.length > r.shelves * 4) return 'too many published bots';
  // Score sources, each at the top x4 multiplier: distance, 100 per bot, 400 per
  // shelf (x3 when the colors match), 50 per close call or smash, 10 per like, and 500
  // for a featured bot at full hearts (one about every 25 s).
  const most = r.dist * 0.5 + r.grabbed * 400 + r.shelves * 4800 + r.close * 200 + r.likes * 40 + 500 * (r.t / 20 + 2) + 1000;
  if (r.score > most) return 'score too high';
  return '';
}

// Creator keys for the bots a run published, one entry per bot. Unknown ids
// are dropped.
export function publishedBy(ids: string[]) {
  const bots = [...new Set(ids)].filter((id) => id in BOT_CREATOR);
  return { bots, creators: bots.map((id) => BOT_CREATOR[id]).filter(Boolean) };
}

export const BUCKETS = [0, 1000, 2500, 5000, 10000, 25000, 50000, 100000];
export const bucketOf = (score: number) => String(BUCKETS.filter((b) => score >= b).pop() ?? 0);

// ---------- names ----------

// Letters and numbers from any script, plus space _ . ' -, with an optional
// leading @. 2 to 20 characters.
const NAME = /^@?[\p{L}\p{N}_][\p{L}\p{N}_ .'-]{1,19}$/u;

// A short list of slurs and obvious abuse. It catches the common cases. For
// anything it misses, delete the name in the Upstash data browser (see README).
// ANYWHERE matches inside other text. WORDS match only a whole word, so
// Dickens, Hancock, Scunthorpe and grape still get through.
const ANYWHERE = ['nigg', 'faggot', 'fagot', 'retard', 'tranny', 'hitler', 'kkk', 'fuck', 'whore', 'porn'];
const WORDS = new Set(['cunt', 'spic', 'coon', 'rape', 'cock', 'dick', 'shit', 'chink', 'kike', 'pussy', 'nazi', 'pedo', 'wetback', 'fag']);

// Folds common look-alike characters so f4ggot and sh1t still match.
const fold = (s: string) =>
  s
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[0@4]/g, (c) => (c === '0' ? 'o' : 'a'))
    .replace(/1|!|\|/g, 'i')
    .replace(/3/g, 'e')
    .replace(/5|\$/g, 's')
    .replace(/7/g, 't');

export function cleanName(v: unknown): { name: string; key: string } | null {
  if (typeof v !== 'string') return null;
  const name = v.normalize('NFC').trim().replace(/\s+/g, ' ');
  if (!NAME.test(name)) return null;
  const f = fold(name.replace(/^@/, ''));
  const joined = f.replace(/[^a-z]/g, '');
  if (ANYWHERE.some((w) => joined.includes(w))) return null;
  if (f.split(/[^a-z]+/).some((w) => WORDS.has(w))) return null;
  // "@Nick" and "nick" are the same board entry
  return { name, key: name.replace(/^@/, '').toLowerCase() };
}
