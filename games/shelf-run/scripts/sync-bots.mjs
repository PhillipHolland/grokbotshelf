// Pulls the public bot list from grokbotshelf.com into src/bots.json and
// saves each creator's small avatar into public/avatars/.
// Run with: npm run sync-bots
import { mkdir, writeFile, access } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const SITE = 'https://grokbotshelf.com';
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const UA = { 'User-Agent': 'shelf-life-game (bot sync)' };

const home = await (await fetch(SITE, { headers: UA })).text();
const dataPath = home.match(/href="(\/shelf-data\.json[^"]*)"/)?.[1] ?? '/shelf-data.json';
const data = await (await fetch(SITE + dataPath, { headers: UA })).json();

const bots = [];
const avatars = new Map();
for (const b of data.bots) {
  if (!b.url?.startsWith('https://x.ai/bot/')) continue;
  const file = b.avatar_sm ? b.avatar_sm.split('?')[0].split('/').pop() : '';
  if (file) avatars.set(file, SITE + b.avatar_sm);
  bots.push({
    n: b.name.trim(),
    e: b.emoji,
    d: b.description.trim(),
    c: b.category,
    h: (b.creator_handle ?? '').replace(/^@/, ''), // empty when the creator gave no X handle
    cn: (b.creator_name ?? '').trim(),
    u: b.url.replace('https://x.ai/bot/', ''),
    a: file,
    l: b.social?.likes ?? 0,
  });
}

await writeFile(join(root, 'src/bots.json'), JSON.stringify(bots));
console.log(`wrote ${bots.length} bots from ${new Set(bots.map((b) => b.h || b.cn).filter(Boolean)).size} creators`);

const dir = join(root, 'public/avatars');
await mkdir(dir, { recursive: true });
let got = 0;
const queue = [...avatars];
async function worker() {
  while (queue.length) {
    const [file, url] = queue.pop();
    const out = join(dir, file);
    try {
      await access(out);
      continue;
    } catch {}
    const res = await fetch(url, { headers: UA });
    if (!res.ok) continue;
    await writeFile(out, Buffer.from(await res.arrayBuffer()));
    got++;
  }
}
await Promise.all(Array.from({ length: 6 }, worker));
console.log(`saved ${got} new avatars (${avatars.size} total)`);
