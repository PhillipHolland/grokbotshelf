// Removes a name from the Shelf Run leaderboards (all time and the last 3 days).
//   npm run remove-name -- "the name"
// Add --dev to clean the keys that preview deploys and `vercel dev` use.
// Needs .env.local with the Upstash keys: run `vercel env pull` once.
import { Redis } from '@upstash/redis';
import { readFileSync } from 'node:fs';

for (const line of readFileSync(new URL('../.env.local', import.meta.url), 'utf8').split('\n')) {
  const m = line.match(/^(\w+)="?(.*?)"?$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
}
const args = process.argv.slice(2);
const P = args.includes('--dev') ? 'sr-dev:' : 'sr:';
const name = args
  .filter((a) => a !== '--dev')
  .join(' ')
  .trim();
if (!name) {
  console.error('usage: npm run remove-name -- "the name" [--dev]');
  process.exit(1);
}
const key = name.replace(/^@/, '').toLowerCase();
const redis = Redis.fromEnv();
const p = redis.pipeline();
p.zrem(`${P}lb:all`, key);
for (let i = 0; i < 3; i++) p.zrem(`${P}lb:day:${new Date(Date.now() - i * 864e5).toISOString().slice(0, 10)}`, key);
p.hdel(`${P}names`, key);
p.del(`${P}snap`);
const r = await p.exec();
console.log(r[0] ? `removed "${name}"` : `"${name}" wasn't on the all-time board`);
