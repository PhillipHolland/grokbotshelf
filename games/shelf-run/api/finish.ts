// POST /api/finish: the game sends the result when a run ends. The run id from
// /api/start works once. With a name the score goes on the board right away.
// Without one the server keeps it 15 minutes so /api/name can add a name.
import { postScore, wouldRank } from './_lib/board.js';
import { K, body, json, redis } from './_lib/db.js';
import { bucketOf, cleanName, implausible, parseResult, publishedBy } from './_lib/rules.js';

export async function POST(req: Request) {
  const now = Date.now();
  const b = await body(req);
  const id = typeof b.id === 'string' ? b.id.slice(0, 40) : '';
  const run = id ? await redis.getdel<{ t0: number }>(K.run(id)) : null;
  if (!run) return json({ error: 'unknown or finished run' }, 404);
  const r = parseResult(b);
  if (!r) return json({ error: 'bad result' }, 400);
  const why = implausible(r, (now - run.t0) / 1000);
  if (why) {
    await redis.hincrby(K.tot, 'rejected', 1);
    return json({ error: `run rejected: ${why}` }, 422);
  }

  const { bots, creators } = publishedBy(r.bots);
  const perCreator = new Map<string, number>();
  for (const c of creators) perCreator.set(c, (perCreator.get(c) ?? 0) + 1);
  const name = b.name == null ? null : cleanName(b.name);

  const p = redis.pipeline();
  p.zrem(K.live, id);
  p.hincrby(K.tot, 'done', 1);
  p.hincrby(K.tot, 'bots', r.grabbed);
  p.hincrby(K.tot, 'shelves', r.shelves);
  p.hincrby(K.tot, 'meters', r.dist);
  p.hincrby(K.hist, bucketOf(r.score), 1);
  for (const [c, n] of perCreator) p.zincrby(K.creators, n, c);
  for (const bot of bots) p.zincrby(K.bots, 1, bot);
  p.lpush(K.recent, { name: name?.name ?? null, score: r.score, shelves: r.shelves, t: Math.round(r.t), at: now });
  p.ltrim(K.recent, 0, 29);
  if (!name) p.set(K.claim(id), { score: r.score, at: now }, { ex: 900 });
  await p.exec();

  if (name) return json({ ranks: await postScore(name, r.score, now) });
  return json({ claim: id, wouldRank: await wouldRank(r.score, now), nameError: b.name == null ? undefined : 'name not allowed' });
}
