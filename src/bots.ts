// Bot data for Shelf Life.
// Exports: Kind, Sub, Cat, CATS, PLAY_CATS, catColor, BOT_COUNT, CREATOR_COUNT,
// tagline, fakeAvatar, FAKE_OFFICIAL, FAKE_PEOPLE, resetPools, realBot,
// sameCreatorBot, viralBots, creatorDrop, tutorialBots, tutorialMoney, dupeOf, scamBot.
import raw from './bots.json';

// Snapshot of the public list on grokbotshelf.com. Refresh with `npm run sync-bots`.
interface RawBot {
  n: string; // name
  e: string; // emoji
  d: string; // description
  c: string; // category
  h: string; // creator X handle, no @. Empty when the creator gave none.
  cn: string; // creator display name
  u: string; // id in https://x.ai/bot/<id>
  a: string; // avatar file in /avatars
  l: number; // likes on the source post
}

export type Kind = 'real' | 'scam' | 'dupe';

export interface Sub {
  uid: number;
  kind: Kind;
  name: string;
  emoji: string;
  desc: string; // full description, shown on pause and game over only
  tagline: string; // short line shown on the card
  cat: string;
  handle: string;
  creator: string;
  link: string; // shown on the card, no protocol
  url: string | null; // real bots only
  avatar: string | null;
  likes: number;
  key: string; // name + handle of the real bot this card is (or copies)
  tier?: 0 | 1 | 2; // scams only
  tellZone?: 'link' | 'tag'; // scams only: where the tell sits on the card
  stamp?: string; // scams only: shred stamp text
  missLine?: string; // scams only: coach line after a miss
  tell?: string; // scams only: long form for the game over list
  viral?: boolean;
  dupeOf?: string;
}

export interface Cat {
  name: string;
  color: string;
  glyph: string;
  short: string;
}

// Every category in the data. Names match the site.
export const CATS: Cat[] = [
  { name: 'Productivity', color: '#6b8bff', glyph: '⚡', short: 'Productivity' },
  { name: 'Money', color: '#3fae6a', glyph: '$', short: 'Money' },
  { name: 'Lifestyle', color: '#f5b82e', glyph: '☀', short: 'Lifestyle' },
  { name: 'Home', color: '#a487f0', glyph: '⌂', short: 'Home' },
  { name: 'Health & Fitness', color: '#f25f7a', glyph: '✚', short: 'Health' },
  { name: 'Business & Marketing', color: '#1fa5c4', glyph: '◆', short: 'Business' },
  { name: 'Creator & Media', color: '#e255a1', glyph: '▶', short: 'Creator' },
  { name: 'Food', color: '#f08a3c', glyph: '●', short: 'Food' },
  { name: 'Travel', color: '#2ec4b6', glyph: '➤', short: 'Travel' },
  { name: 'Developer', color: '#8b98a9', glyph: '❯', short: 'Developer' },
  { name: 'Security', color: '#ff7a3d', glyph: '◈', short: 'Security' },
  { name: 'Shopping', color: '#d4a017', glyph: '¤', short: 'Shopping' },
  { name: 'Design', color: '#c77dff', glyph: '✎', short: 'Design' },
  { name: 'Bot Tools', color: '#1d9bf0', glyph: '⚙', short: 'Bot Tools' },
  { name: 'Faith', color: '#e9c46a', glyph: '✧', short: 'Faith' },
];

// The categories a run uses, in unlock order.
export const PLAY_CATS = ['Productivity', 'Money', 'Lifestyle', 'Home', 'Health & Fitness', 'Business & Marketing'];

export const catColor = (name: string) => CATS.find((c) => c.name === name)?.color ?? '#8b98a5';

const BOTS = (raw as RawBot[]).filter((b) => CATS.some((c) => c.name === b.c));
export const BOT_COUNT = BOTS.length;
export const CREATOR_COUNT = new Set(BOTS.map((b) => b.h || b.cn).filter(Boolean)).size;

// How a bot's creator is shown: the X handle, else their name, else the site.
export function byline(s: { handle: string; creator: string }) {
  return s.handle ? `@${s.handle}` : s.creator || 'grokbotshelf.com';
}

let uid = 0;
const rand = <T>(a: readonly T[]) => a[Math.floor(Math.random() * a.length)];
const keyOf = (b: RawBot) => `${b.n}|${b.h}`;
const avatarOf = (b: RawBot) => (b.a ? `${import.meta.env.BASE_URL}avatars/${b.a}` : null);

// First sentence of a description, cut to fit two lines on the card.
// Short words that end in a period but don't end a sentence ("gas cars vs. EVs").
const ABBR = /\b(?:vs|e\.g|i\.e|etc|approx|incl|Dr|Mr|Mrs|Ms|St|No|U\.S)\.$/i;
function firstSentence(desc: string) {
  const parts = desc.trim().split(/(?<=[.!?])\s/);
  let s = parts[0] ?? '';
  for (let i = 1; i < parts.length && ABBR.test(s); i++) s += ' ' + parts[i];
  return s.trim();
}

export function tagline(desc: string): string {
  // Cards show no em dash (U+2014). Each one becomes a comma.
  const s = firstSentence(desc)
    .replace(/\s*—\s*/g, ', ')
    .replace(/^, |, $/g, '');
  if (s.length <= 64) return s.replace(/\.$/, '');
  let cut = -1;
  for (const brk of [', ', ' and ', ' so ', ' with ', ' that ', ' for ']) {
    const i = s.lastIndexOf(brk, 59);
    if (i > 20 && i < 60 && i > cut) cut = i;
  }
  if (cut < 0) cut = s.lastIndexOf(' ', 57);
  if (cut <= 0) cut = 57;
  return s.slice(0, cut).replace(/[\s,;:.\-–—(]+$/, '') + '…';
}

function fromRaw(b: RawBot): Sub {
  return {
    uid: ++uid,
    kind: 'real',
    name: b.n,
    emoji: b.e,
    desc: b.d,
    tagline: tagline(b.d),
    cat: b.c,
    handle: b.h,
    creator: b.cn || b.h,
    link: `x.ai/bot/${b.u.slice(0, 8)}`,
    url: `https://x.ai/bot/${b.u}`,
    avatar: avatarOf(b),
    likes: b.l,
    key: keyOf(b),
  };
}

const pools = new Map<string, RawBot[]>();
function shuffle<T>(a: T[]) {
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
export function resetPools() {
  pools.clear();
  for (const c of CATS) pools.set(c.name, shuffle(BOTS.filter((b) => b.c === c.name)));
}
resetPools();

// A real bot nobody has seen this run. Never one that sits on a shelf now,
// since that would look exactly like a dupe. Adds the key to `avoid`.
export function realBot(cat: string, avoid: Set<string>, onShelf: Set<string> = new Set()): Sub {
  const inCat = BOTS.filter((x) => x.c === cat);
  const all = inCat.length ? inCat : BOTS;
  let pool = pools.get(cat) ?? [];
  const ok = (x: RawBot) => !avoid.has(keyOf(x)) && !onShelf.has(keyOf(x));
  let b = pool.pop();
  while (b && !ok(b)) b = pool.pop();
  if (!b) {
    pool = shuffle(all.filter(ok));
    if (!pool.length) pool = shuffle(all.filter((x) => !onShelf.has(keyOf(x))));
    pools.set(cat, pool);
    b = pool.pop() ?? rand(all);
  }
  avoid.add(keyOf(b));
  return fromRaw(b);
}

// Another unseen bot by the same creator in the same category, for the creator bias.
export function sameCreatorBot(cat: string, handle: string, avoid: Set<string>): Sub | null {
  if (!handle) return null;
  const opts = BOTS.filter((b) => b.c === cat && b.h === handle && !avoid.has(keyOf(b)));
  if (!opts.length) return null;
  const b = rand(opts);
  avoid.add(keyOf(b));
  return fromRaw(b);
}

// The 14 most liked bots. A Viral card is wild, so its category doesn't matter.
export function viralBots(): Sub[] {
  return shuffle(BOTS.filter((b) => b.l >= 10)).map((b) => ({ ...fromRaw(b), viral: true }));
}

// A creator with at least 4 unseen bots in one of `cats`. Prefers categories
// in `prefer` (the ones with a built shelf). Adds the 4 keys to `avoid`.
export function creatorDrop(
  cats: string[],
  avoid: Set<string>,
  prefer: string[] = [],
): { handle: string; creator: string; avatar: string | null; bots: Sub[] } | null {
  const groups = new Map<string, RawBot[]>();
  for (const b of BOTS) {
    if (!b.h || !cats.includes(b.c) || avoid.has(keyOf(b))) continue;
    const k = `${b.h}|${b.c}`;
    const g = groups.get(k);
    if (g) g.push(b);
    else groups.set(k, [b]);
  }
  let cands = [...groups.values()].filter((g) => g.length >= 4);
  const preferred = cands.filter((g) => prefer.includes(g[0].c));
  if (preferred.length) cands = preferred;
  if (!cands.length) return null;
  // pick the creator first so one prolific account doesn't take every drop
  const handle = rand([...new Set(cands.map((g) => g[0].h))]);
  const group = rand(cands.filter((g) => g[0].h === handle));
  const picks = shuffle([...group]).slice(0, 4);
  picks.forEach((b) => avoid.add(keyOf(b)));
  const face = BOTS.find((b) => b.h === handle && b.a);
  return {
    handle,
    creator: group[0].cn || handle,
    avatar: face ? avatarOf(face) : null,
    bots: picks.map(fromRaw),
  };
}

// Fixed bots for the tutorial so it plays the same every time. Prefers bots
// whose first sentence fits whole, then ones with a long readable cut.
function tutorialPick(cat: string, n: number, skip: RawBot[]): RawBot[] {
  const opts = BOTS.filter((b) => b.c === cat && b.a && !/\bby\b/i.test(b.n))
    .map((b) => ({ b, t: tagline(b.d) }))
    .sort((x, y) => Number(x.t.endsWith('…')) - Number(y.t.endsWith('…')) || y.t.length - x.t.length);
  const out: RawBot[] = [];
  for (const { b } of opts) {
    if (out.length === n) break;
    if (![...skip, ...out].some((p) => p.h === b.h)) out.push(b);
  }
  return out;
}
const TUT_PROD = tutorialPick('Productivity', 4, []);
const TUT_MONEY = tutorialPick('Money', 1, TUT_PROD)[0] ?? BOTS.find((b) => b.c === 'Money')!;

// 4 Productivity bots by 4 different creators, all with photos and short taglines.
export function tutorialBots(): Sub[] {
  return TUT_PROD.map(fromRaw);
}

// 1 Money bot by a fifth creator.
export function tutorialMoney(): Sub {
  return fromRaw(TUT_MONEY);
}

export function dupeOf(b: Sub): Sub {
  return { ...b, uid: ++uid, kind: 'dupe', dupeOf: b.key };
}

// ---- fake accounts ----

const GRADS: [string, string][] = [
  ['#1d9bf0', '#7856ff'],
  ['#f91880', '#ff7a00'],
  ['#00ba7c', '#1d9bf0'],
  ['#ffd400', '#f4212e'],
  ['#7856ff', '#f91880'],
  ['#536471', '#0f1419'],
  ['#ff7a00', '#ffd400'],
  ['#00b4d8', '#00ba7c'],
];
const MARKS = ['★', '◆', '▲', '✦', 'G', 'X', '⬢'];

function hash(s: string) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

// A logo-style round avatar for a fictional account.
export function fakeAvatar(handle: string): string {
  const h = hash(handle.toLowerCase());
  const [a, b] = GRADS[h % GRADS.length];
  const mark = MARKS[(h >>> 20) % MARKS.length];
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 64 64">` +
    `<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">` +
    `<stop offset="0" stop-color="${a}"/><stop offset="1" stop-color="${b}"/></linearGradient></defs>` +
    `<circle cx="32" cy="32" r="32" fill="url(#g)"/>` +
    `<text x="32" y="33" fill="#fff" font-size="30" font-weight="700" text-anchor="middle" dominant-baseline="central" ` +
    `font-family="system-ui,-apple-system,Segoe UI,Helvetica,Arial,sans-serif">${mark}</text></svg>`;
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}

// Fictional accounts. None of these match a real creator (checked in DEV below).
export const FAKE_OFFICIAL: { handle: string; name: string }[] = [
  { handle: 'GrokBotStore', name: 'Grok Bot Store' },
  { handle: 'xai_rewards_desk', name: 'xAI Rewards Desk' },
  { handle: 'GrokGiveawaysHQ', name: 'Grok Giveaways HQ' },
  { handle: 'BotClaimsCenter', name: 'Bot Claims Center' },
  { handle: 'PremiumUnlockTeam', name: 'Premium Unlock Team' },
  { handle: 'AirdropAlertsDesk', name: 'Airdrop Alerts Desk' },
];
export const FAKE_PEOPLE: { handle: string; name: string }[] = [
  { handle: 'botsmith_4471', name: 'Botsmith' },
  { handle: 'kai_automates88', name: 'Kai Automates' },
  { handle: 'neatbots_221', name: 'Neat Bots' },
  { handle: 'promptpilot_07', name: 'Prompt Pilot' },
  { handle: 'dailydroid_31', name: 'Daily Droid' },
  { handle: 'shelfhelper_x9', name: 'Shelf Helper' },
  { handle: 'tinyagent_502', name: 'Tiny Agent' },
  { handle: 'autoflow_lab19', name: 'Autoflow Lab' },
];

// ---- scams ----

// Tier 0: [emoji, name, tagline (<= 44 chars), full description, what it wants]
const SCAM_BOTS: [string, string, string, string, string][] = [
  ['🎁', 'Grok Airdrop Claimer', 'Free $GROK. Connect your wallet to claim.', 'Claim your free $GROK tokens. Connect your wallet and approve one transaction to start.', 'your wallet'],
  ['🔓', 'Free Premium+ Unlocker', 'Log in with your X password to upgrade.', 'Unlocks Premium+ for free. Just log in with your X password so the bot can upgrade you.', 'your X password'],
  ['🚀', '100x Signal Bot', '100x picks daily. Send 0.05 ETH to join.', 'Guaranteed 100x crypto picks every morning. Send 0.05 ETH to join the signal group.', 'money'],
  ['👛', 'Wallet Sync Helper', 'Paste your seed phrase once to sync.', 'Keeps your wallets in sync. Paste your 12 word seed phrase once and it handles the rest.', 'your seed phrase'],
  ['✅', 'Instant Verified Badge', 'Gold check in 5 minutes. Pay in gift cards.', 'Get the gold check in 5 minutes. Pay a small fee in gift cards to skip the line.', 'gift cards'],
  ['💰', 'Crypto Doubler', 'Doubles any BTC you send. 100% safe.', 'Send any amount of BTC and the bot sends back double within the hour. 100% safe.', 'your BTC'],
  ['📈', '10K Followers Booster', '10K followers tonight. Needs your 2FA code.', 'Adds 10,000 followers overnight. Needs your login and 2FA code to work.', 'your 2FA code'],
  ['🪙', 'Grok Credits Generator', 'Free Grok credits. Just enter your card.', 'Generates unlimited Grok credits. Enter your card number to verify you are human.', 'your card number'],
  ['🛟', 'Account Recovery Desk', 'Locked out? DM us your password.', 'Locked out? DM us your password and backup codes and we will restore your account.', 'your password'],
  ['🎰', 'Jackpot Predictor', 'AI lottery picks. Pay $9.99 in crypto.', "Predicts lottery numbers with AI. Pay $9.99 in crypto to unlock today's winning picks.", 'money'],
];
const LOUD_DOMAINS = ['grok-free.net', 'xai-claim.app', 'free-grok.gift', 'grokbots.win', 'x-rewards.club'];
const CLOSE_DOMAINS = ['x-ai.bot', 'xai.bot', 'x.ai.bot-hub.co', 'xai-bot.com', 'x.ai-bots.app', 'x.aibot.link'];

// Tier 2: [tagline, stamp thing, what the coach line names]
const ASKS: [string, string, string][] = [
  ['Paste your X password to activate', 'PASSWORD', 'your password'],
  ['Send 0.01 ETH to unlock it', 'MONEY', 'money'],
  ['Share your 2FA code so it can post', '2FA CODE', 'your 2FA code'],
  ['Enter your seed phrase once to sync', 'SEED PHRASE', 'your seed phrase'],
  ['Pay the setup fee in gift cards', 'GIFT CARDS', 'gift cards'],
  ['Type your card number to verify', 'CARD NUMBER', 'your card number'],
];
// Invented names that sound like ordinary bots.
const ASKER_NAMES: Record<string, [string, string][]> = {
  Productivity: [['📥', 'Inbox Zero Coach'], ['🏃', 'Task Sprinter'], ['📝', 'Meeting Notes Pro']],
  Money: [['💵', 'Budget Buddy'], ['🧾', 'Bill Tracker'], ['🏷️', 'Coupon Scout']],
  Lifestyle: [['🗓️', 'Weekend Planner'], ['👗', 'Style Helper'], ['🎀', 'Gift Finder']],
  Home: [['🧹', 'Chore Chart'], ['🪴', 'Plant Minder'], ['🔧', 'Fix It Guide']],
  'Health & Fitness': [['👟', 'Step Coach'], ['😴', 'Sleep Tracker'], ['🥗', 'Meal Prep Pal']],
  'Business & Marketing': [['📣', 'Post Scheduler'], ['🎯', 'Lead Finder'], ['🗣️', 'Brand Voice Bot']],
};
const ASKER_ANY: [string, string][] = [['🤖', 'Daily Helper'], ['✨', 'Quick Assist']];

if (import.meta.env.DEV) {
  const handles = new Set((raw as RawBot[]).map((b) => b.h.toLowerCase()));
  const names = new Set((raw as RawBot[]).map((b) => b.n.toLowerCase()));
  for (const f of [...FAKE_OFFICIAL, ...FAKE_PEOPLE]) {
    console.assert(!handles.has(f.handle.toLowerCase()), `fake handle @${f.handle} matches a real creator`);
  }
  for (const [, n] of [...Object.values(ASKER_NAMES).flat(), ...ASKER_ANY, ...SCAM_BOTS.map((s) => [s[0], s[1]])]) {
    console.assert(!names.has(n.toLowerCase()), `fake bot name "${n}" matches a real bot`);
  }
}

// A copycat shows the name and tagline, so neither may carry the real creator's name.
function namesCreator(b: RawBot) {
  const n = b.n.toLowerCase();
  const t = tagline(b.d).toLowerCase();
  // every part of the display name counts: "Braun Bill Haggler" by Andy Braun
  const parts = (b.cn || '')
    .toLowerCase()
    .split(/[\s_.-]+/)
    .filter((p) => p.length > 3);
  const first = (b.cn || '').split(/\s+/)[0].toLowerCase();
  if (first.length > 2) parts.push(first);
  const has = (s: string) => s.includes(b.h.toLowerCase()) || parts.some((p) => s.includes(p));
  return /\bby\b/.test(n) || has(n) || has(t);
}

function fakeId() {
  const c = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz0123456789';
  return Array.from({ length: 8 }, () => rand([...c])).join('');
}

// Every scam uses a fictional account and carries one tell in a fixed spot.
// Tier 0 is loud, tier 1 copies a real bot but not its link, tier 2 asks for something.
// `onShelf` (optional) keeps a copycat from copying a bot that is on the wall.
export function scamBot(tier: 0 | 1 | 2, cats: string[], avoid: Set<string>, onShelf?: Set<string>): Sub {
  const id = ++uid;
  const base = { uid: id, kind: 'scam' as const, url: null, likes: 0, key: `scam-${id}`, tier };
  const pick = cats.length ? cats : PLAY_CATS;
  if (tier === 0) {
    const [emoji, name, tag, desc, wants] = rand(SCAM_BOTS);
    const who = rand(FAKE_OFFICIAL);
    const domain = rand(LOUD_DOMAINS);
    return {
      ...base,
      name,
      emoji,
      desc,
      tagline: tag,
      cat: rand(pick),
      handle: who.handle,
      creator: who.name,
      link: `${domain}/${fakeId()}`,
      avatar: fakeAvatar(who.handle),
      tellZone: 'link',
      stamp: 'FAKE LINK',
      missLine: `Not x.ai/bot. It's ${domain}.`,
      tell: `It linked to ${domain}, not x.ai/bot, and wanted ${wants}.`,
    };
  }
  const who = rand(FAKE_PEOPLE);
  if (tier === 1) {
    // skip names that carry the real creator's name ("Shot by Rich")
    const cat = rand(pick);
    const okCopy = (b: RawBot) => !avoid.has(keyOf(b)) && !onShelf?.has(keyOf(b)) && !namesCreator(b);
    let clean = BOTS.filter((b) => b.c === cat && okCopy(b));
    if (!clean.length) clean = BOTS.filter((b) => pick.includes(b.c) && okCopy(b));
    // nothing safe left to copy: a loud scam never shows a real creator's name
    if (!clean.length) return scamBot(0, cats, avoid, onShelf);
    const copy = fromRaw(rand(clean));
    avoid.add(copy.key);
    const domain = rand(CLOSE_DOMAINS);
    return {
      ...base,
      name: copy.name,
      emoji: copy.emoji,
      desc: copy.tagline,
      tagline: copy.tagline,
      cat: copy.cat,
      handle: who.handle,
      creator: who.name,
      link: `${domain}/${fakeId()}`,
      avatar: fakeAvatar(who.handle),
      tellZone: 'link',
      stamp: 'COPYCAT',
      missLine: 'A copy. Real bots link to x.ai/bot.',
      tell: `A copy of ${copy.name}. Its link went to ${domain}, not x.ai/bot.`,
    };
  }
  const cat = rand(pick);
  const [emoji, name] = rand(ASKER_NAMES[cat] ?? ASKER_ANY);
  const [tag, thing, wants] = rand(ASKS);
  return {
    ...base,
    name,
    emoji,
    desc: `${tag}.`,
    tagline: tag,
    cat,
    handle: who.handle,
    creator: who.name,
    link: `x.ai/bot/${fakeId()}`,
    avatar: fakeAvatar(who.handle),
    tellZone: 'tag',
    stamp: `ASKS FOR ${thing}`,
    missLine: `Never give a bot ${wants}.`,
    tell: `It asked for ${wants}. Real bots never do.`,
  };
}
