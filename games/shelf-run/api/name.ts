// POST /api/name: puts a just-finished unnamed run on the board.
import { postScore } from './_lib/board.js';
import { K, body, json, redis } from './_lib/db.js';
import { cleanName } from './_lib/rules.js';

export async function POST(req: Request) {
  const b = await body(req);
  const id = typeof b.claim === 'string' ? b.claim.slice(0, 40) : '';
  const name = cleanName(b.name);
  if (!name) return json({ error: 'name not allowed' }, 400);
  const run = id ? await redis.getdel<{ score: number; at: number }>(K.claim(id)) : null;
  if (!run) return json({ error: 'that run can no longer take a name' }, 404);
  return json({ ranks: await postScore(name, run.score, run.at) });
}
