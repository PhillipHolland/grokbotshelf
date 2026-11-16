// Writes a named score to the all-time and daily boards and reads back the
// player's ranks.
import type { Ranks } from '../../src/score-types';
import { K, dayOf, redis } from './db.js';

export async function postScore(name: { name: string; key: string }, score: number, now: number): Promise<Ranks> {
  const day = K.boardOn(dayOf(now));
  const p = redis.pipeline();
  p.zadd(K.board, { gt: true }, { score, member: name.key });
  p.zadd(day, { gt: true }, { score, member: name.key });
  p.expire(day, 3 * 86400);
  p.hset(K.names, { [name.key]: name.name });
  p.zrevrank(K.board, name.key);
  p.zrevrank(day, name.key);
  p.zscore(K.board, name.key);
  const r = (await p.exec()) as unknown[];
  return { all: Number(r[4]) + 1, today: Number(r[5]) + 1, best: Number(r[6]) };
}

// Where an unnamed score would land if the player adds a name.
export async function wouldRank(score: number, now: number) {
  const p = redis.pipeline();
  p.zcount(K.board, `(${score}`, '+inf');
  p.zcount(K.boardOn(dayOf(now)), `(${score}`, '+inf');
  const [a, t] = (await p.exec()) as [number, number];
  return { all: a + 1, today: t + 1 };
}
