// POST /api/start: the game calls this when a run begins. The server notes the
// start time, so /api/finish can check how long the run really took.
import { K, dayOf, hourOf, json, newId, redis, visitor } from './_lib/db.js';

const RUN_TTL = 4 * 3600; // a run left open longer than this can't be submitted
const RATE = 40; // starts per visitor per 10 minutes

export async function POST(req: Request) {
  const now = Date.now();
  const who = visitor(req);
  const slot = Math.floor(now / 600_000);
  const p = redis.pipeline();
  p.incr(K.rate(who, slot));
  p.expire(K.rate(who, slot), 600);
  const [count] = (await p.exec()) as [number, number];
  if (count > RATE) return json({ error: 'slow down' }, 429);

  const id = newId();
  const day = dayOf(now);
  const q = redis.pipeline();
  q.set(K.run(id), { t0: now }, { ex: RUN_TTL });
  q.zadd(K.live, { score: now, member: id });
  q.hincrby(K.tot, 'runs', 1);
  q.hincrby(K.days, day, 1);
  q.hincrby(K.hours, hourOf(now), 1);
  q.pfadd(K.players, who);
  q.pfadd(K.playersOn(day), who);
  q.expire(K.playersOn(day), 3 * 86400);
  await q.exec();
  return json({ id });
}
