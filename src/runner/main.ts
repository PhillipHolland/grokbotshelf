// Shelf Run: an endless runner prototype built on the same real bots.
// You push a rolling shelf down a store aisle. Grab real bots, dodge scams
// and boxes, fill all 4 slots to publish the shelf and credit its creators.
import '@fontsource-variable/newsreader';
import './style.css';
import { realBot, scamBot, viralBots, dupeOf, catColor, CATS, PLAY_CATS, BOT_COUNT, CREATOR_COUNT, resetPools, byline, type Sub } from '../bots';
import { sfx, tone, noise, isMuted, toggleMute } from '../audio';
import { avatar, VIRAL } from './cards';
import * as Scene from './scene';
import { music } from './music';
import { BOX_H, type Ent, type EKind, type Power } from './scene';
import { ZONES, ZONE_T } from './zones';
import { COMBO_STEP, MAX_MULT, POINTS, POWER_GAP, SLOTS, TURBO_T, TURBO_V, VIRAL_GAP, multFor, speedAt } from '../../api/_lib/balance';
import { runStarted, runEnded, claimName, savedName, saveName, stats, type Finish } from './net';
import type { Ranks, Board } from '../score-types';

// ---------- tuning ----------
// Speed, points and anything else the score API checks live in
// api/_lib/balance.ts, shared with the server. Only game-feel numbers stay here.

const FAR = 64; // spawn distance
const HEARTS = 3;
const JUMP_T = 0.62; // seconds in the air
const JUMP_H = 1.05; // lane widths
const SLIDE_T = 0.62; // seconds low to the floor
const RUNAWAY_V = 9; // a runaway cart closes this much faster than the aisle
const tierAt = (t: number): 0 | 1 | 2 => (t < 40 ? 0 : t < 80 ? (Math.random() < 0.6 ? 1 : 0) : Math.random() < 0.45 ? 2 : 1);

// ---------- dom ----------

const $ = <T extends HTMLElement = HTMLElement>(sel: string) => document.querySelector(sel) as T;
const cv = $<HTMLCanvasElement>('#cv');
const scoreEl = $('#score');
const distEl = $('#dist');
const multEl = $('#mult');
const heartsEl = $('#hearts');
const comboEls = [...$('#combo').children];
const zoneEl = $('#zone');
const zoneNowEl = $('#zoneNow');
const zoneNextEl = $('#zoneNext');
const zoneBarEl = $('#zoneBar');
const pw = { shield: $('#pwShield'), magnet: $('#pwMagnet'), turbo: $('#pwTurbo') };

// One icon set, drawn with strokes, so the HUD and the screens match and
// nothing depends on which emoji font the phone has.
const svg = (d: string, cls = '') => `<svg class="ic ${cls}" viewBox="0 0 24 24" aria-hidden="true">${d}</svg>`;
const IC = {
  sides: svg('<path d="M7 8l-4 4 4 4M17 8l4 4-4 4M3 12h18"/>'),
  up: svg('<path d="M12 20V5M6 11l6-6 6 6"/>'),
  down: svg('<path d="M12 4v15M6 13l6 6 6-6"/>'),
  bot: svg('<rect x="4" y="8" width="16" height="11" rx="3"/><path d="M12 8V4.500M9 13v2M15 13v2"/>'),
  scam: svg('<path d="M6 6l12 12M18 6L6 18"/>'),
  bolt: svg('<path d="M13 2L5 14h6l-1 8 8-12h-6z"/>'),
  sound: svg('<path d="M4 9v6h4l5 4V5L8 9z"/><path d="M16.500 8.500a5 5 0 0 1 0 7"/>'),
  muted: svg('<path d="M4 9v6h4l5 4V5L8 9z"/><path d="M17 9.500l5 5M22 9.500l-5 5"/>'),
  pause: svg('<path d="M8.500 5v14M15.500 5v14"/>', 'thick'),
  heart: svg('<path d="M12 20.300l-7.800-7.700a4.900 4.900 0 0 1 6.900-6.900l.9.900.9-.900a4.900 4.900 0 0 1 6.900 6.900z"/>', 'fill'),
};
heartsEl.innerHTML = IC.heart.repeat(HEARTS);
const heartEls = [...heartsEl.children];
const creditEl = $('#credit');
const bannerEl = $('#banner');
const screenEl = $('#screen');
const esc = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
// Thousands separators by hand: toLocaleString showed up in the profile when
// the HUD called it every frame.
function fmt(n: number) {
  let v = Math.round(n);
  if (v < 1000 && v > -1000) return String(v);
  const neg = v < 0;
  if (neg) v = -v;
  let out = '';
  while (v >= 1000) {
    out = `,${String(v % 1000).padStart(3, '0')}${out}`;
    v = Math.floor(v / 1000);
  }
  return `${neg ? '-' : ''}${v}${out}`;
}
const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
const rand = <T>(a: T[]) => a[Math.floor(Math.random() * a.length)];

// ---------- state ----------

interface Shelf {
  cat: string;
  bots: Sub[];
  pts: number;
  match: boolean;
}

const S = {
  on: false,
  paused: false,
  over: false,
  t: 0,
  dist: 0,
  v: 10,
  score: 0,
  hearts: HEARTS,
  combo: 0,
  lane: 0,
  x: 0,
  y: 0,
  air: -1, // seconds into a jump, -1 on the ground
  inv: 0,
  slow: 1, // time scale, eases back to 1
  shake: 0,
  squash: 0,
  ents: [] as Ent[],
  nextRow: 20,
  cart: [] as Sub[],
  shelves: [] as Shelf[],
  grabbed: 0,
  likes: 0,
  dodged: 0,
  seen: new Set<string>(),
  lastViral: 0,
  cause: '',
  dying: 0,
  rows: 0,
  lastMove: -9,
  lastPower: 0,
  lastTwo: false,
  shield: 0, // 1 while the Verified badge is up
  magnet: 0, // seconds of magnet left
  close: 0, // close calls this run
  turbo: 0, // seconds of Turbo left
  boost: 0, // extra speed, eases in and out with Turbo
  slide: 0, // seconds of slide left
  slideNext: false, // slide as soon as the cart lands
  smashed: 0,
  zone: 0,
  zoneAt: ZONE_T, // game time the next gate reaches the cart
  gateOut: false, // a gate is on its way
  lastRunaway: 0,
};
const viralDeck: Sub[] = [];

const mult = () => multFor(S.combo);
const cartCat = () => S.cart[0]?.cat ?? null;
const PICKUP = new Set<EKind>(['bot', 'like', 'power']);
const HAZARD = new Set<EKind>(['scam', 'wall', 'box', 'bar', 'barwide', 'runaway']);
// kinds that stay in the world after they're hit, so they slide past
const KEEP = new Set<EKind>([...HAZARD, 'gate']);

// ---------- spawning ----------

function pickCat() {
  const c = cartCat();
  if (c && Math.random() < 0.55) return c;
  return rand(PLAY_CATS.slice(0, 4));
}

function bot(): Sub {
  return realBot(pickCat(), S.seen);
}

function spawnRow(z: number) {
  const d = clamp(S.t / 110, 0, 1);
  const lanes = [-1, 0, 1].sort(() => Math.random() - 0.5);
  // a runaway cart still behind this row owns its lane until it passes
  const runaway = S.ents.find((e) => e.kind === 'runaway' && e.z > z - 3);
  const put = (kind: EKind, lane: number, sub?: Sub) => {
    if (runaway && lane === runaway.lane) return;
    S.ents.push({ kind, lane, z, sub, seed: Math.random() * 1000 });
  };
  // likes trail breadcrumbs
  const trail = (lane: number, from = 1.6) => {
    if (runaway && lane === runaway.lane) return;
    for (let i = 0; i < 5; i++) S.ents.push({ kind: 'like', lane, z: z + from + i * 1.3, seed: i });
  };
  if (S.t < 3 && z < 30) {
    put('bot', lanes[0], bot());
    trail(lanes[1]);
    return;
  }
  // The gate into the next zone gets a row to itself, with likes down every lane.
  if (!S.gateOut && S.t + z / Math.max(S.v, 1) >= S.zoneAt) {
    S.gateOut = true;
    S.ents.push({ kind: 'gate', lane: 0, z, seed: 0, zone: S.zone + 1 });
    for (const lane of lanes) trail(lane, 2.2);
    return;
  }
  // A breather row every 7th: no hazards, just pickups. Two hazards in one
  // row only after 14 seconds, and never two rows of two in a row.
  S.rows++;
  const breather = S.rows % 7 === 0;
  // a bar across all three lanes: slide under it, likes lead the way
  if (!breather && !runaway && !S.lastTwo && S.t > 30 && Math.random() < 0.07 + 0.05 * d) {
    put('barwide', 0);
    const lane = lanes[0];
    for (let i = 0; i < 4; i++) S.ents.push({ kind: 'like', lane, z: z - 2.6 + i * 1.3, seed: i });
    if (Math.random() < 0.6) {
      S.ents.push({ kind: 'bot', lane: lanes[1], z: z + 4, sub: bot(), seed: Math.random() * 1000 });
      avatar(S.ents[S.ents.length - 1].sub!.avatar);
    }
    S.lastTwo = true;
    return;
  }
  let nb = 0;
  if (!breather) {
    const two = S.t > 14 && !S.lastTwo ? 0.12 + 0.36 * d : 0;
    nb = Math.random() < two ? 2 : Math.random() < 0.72 ? 1 : 0;
    // while a runaway cart owns a lane, leave a second lane open
    if (runaway) nb = Math.min(nb, 1);
  }
  S.lastTwo = nb === 2;
  const blockers = lanes.slice(0, nb);
  const free = lanes.slice(nb);
  for (const lane of blockers) {
    const r = Math.random();
    const scamP = S.t < 4 ? 0 : 0.34 + 0.2 * d;
    // the rest split between boxes, bars (from 18 s) and walls
    const k = (r - scamP) / (1 - scamP);
    const barP = S.t > 18 ? 0.25 : 0;
    if (r < scamP) put('scam', lane, scamBot(tierAt(S.t), [pickCat()], S.seen));
    else if (k < 0.4) put('box', lane);
    else if (k < 0.4 + barP) put('bar', lane);
    else put('wall', lane);
  }
  // A runaway cart, from 45 seconds on. It starts deep in the fog with its
  // lights on. It closes 9 m/s faster than the aisle, so it could only catch
  // things in its lane that are still past about 45 m, out in the fog. Those
  // get cleared so it never drives through anything.
  if (S.t > 45 && !runaway && !S.gateOut && free.length && S.t - S.lastRunaway > 8 && Math.random() < 0.18 + 0.1 * d) {
    const lane = rand(free);
    if (!S.ents.some((e) => e.z > 40 && (e.kind === 'barwide' || e.kind === 'gate'))) {
      S.ents = S.ents.filter((e) => !(e.lane === lane && e.z > 40));
      S.lastRunaway = S.t;
      S.ents.push({ kind: 'runaway', lane, z: z + 12, seed: Math.random() * 1000 });
      free.splice(free.indexOf(lane), 1);
      sfx.warn();
    }
  }
  // a power-up about every 30 seconds
  if (S.t > 12 && S.t - S.lastPower > POWER_GAP + Math.random() * 8 && free.length) {
    S.lastPower = S.t;
    const pool: Power[] = (['shield', 'magnet', 'turbo'] as const).filter((p) => !(p === 'shield' && S.shield) && !(p === 'turbo' && S.turbo > 0));
    S.ents.push({ kind: 'power', lane: free.shift()!, z, seed: Math.random() * 1000, power: rand(pool) });
  }
  // viral every ~25s
  if (S.t - S.lastViral > VIRAL_GAP && free.length) {
    S.lastViral = S.t;
    if (!viralDeck.length) viralDeck.push(...viralBots().filter((b) => !S.seen.has(b.key)));
    const v = viralDeck.pop();
    if (v) {
      S.seen.add(v.key);
      put('bot', free.shift()!, v);
    }
  }
  if (free.length) {
    const lane = free.shift()!;
    if (S.t > 25 && S.cart.length && Math.random() < 0.14) put('dupe', lane, dupeOf(rand(S.cart)));
    else if (Math.random() < 0.88) put('bot', lane, bot());
    else trail(lane);
  }
  if (free.length && Math.random() < 0.4) {
    const lane = free.shift()!;
    if (Math.random() < 0.55) put('bot', lane, bot());
    else trail(lane);
  }
  // start loading creator avatars now; the card itself is painted later, a frame at a time
  for (const e of S.ents) if (e.sub && e.z === z) avatar(e.sub.avatar);
}

// ---------- coaching and haptics ----------

const buzz = (p: number | number[]) => navigator.vibrate?.(p);

// One-time hints, the first time each thing shows up. Stored per device.
const COACH = 'shelf-run-coached';
const coached = new Set<string>(JSON.parse(localStorage.getItem(COACH) || '[]') as string[]);
const coachEl = $('#coach');
let coachTimer = 0;
function coach(key: string, html: string, ms = 2600, slow = 0) {
  if (coached.has(key)) return;
  coached.add(key);
  localStorage.setItem(COACH, JSON.stringify([...coached]));
  coachEl.innerHTML = html;
  coachEl.dataset.k = key;
  coachEl.classList.add('show');
  if (slow) S.slow = Math.min(S.slow, slow);
  clearTimeout(coachTimer);
  coachTimer = window.setTimeout(() => coachEl.classList.remove('show'), ms);
}
function coachDone() {
  coachEl.classList.remove('show');
}
// Looks ahead in the player's path for things the player hasn't met yet.
function coachAhead() {
  if (coached.size >= 8) return;
  for (const e of S.ents) {
    if (e.done || e.z > 16 || e.z < 2) continue;
    if (e.kind === 'box') coach('box', `<b>${IC.up}</b> Swipe up to jump boxes`, 2200, 0.55);
    else if (e.kind === 'wall') coach('wall', `<b>${IC.sides}</b> Walls block the lane. Go around`, 2200, 0.55);
    else if (e.kind === 'scam') coach('scam', `<b class="bad">${IC.scam}</b> Twitching card = scam. Dodge it`, 2600, 0.45);
    else if (e.kind === 'bar' || e.kind === 'barwide') coach('bar', `<b>${IC.down}</b> Swipe down to slide under bars`, 2400, 0.5);
    else if (e.kind === 'runaway' && e.z < 14) coach('runaway', '<b class="bad">!</b> Runaway cart. Change lanes', 2200, 0.5);
  }
}

// ---------- actions ----------

function move(dir: -1 | 1) {
  if (!S.on || S.paused || S.dying) return;
  const to = clamp(S.lane + dir, -1, 1);
  if (to === S.lane) {
    S.squash = 0.12;
    sfx.thunk();
    return;
  }
  S.lane = to;
  S.lastMove = S.t;
  if (coachEl.dataset.k === 'lanes') coachDone();
  tone(dir < 0 ? 520 : 600, 0.05, { type: 'triangle', vol: 0.05 });
}
function jump() {
  if (!S.on || S.paused || S.dying || S.air >= 0) return;
  S.slide = 0;
  S.slideNext = false;
  S.air = 0;
  sfx.whoosh();
}
// Swipe down: slide on the ground. In the air it drops you fast and slides on landing.
function drop() {
  if (!S.on || S.paused || S.dying) return;
  if (S.air >= 0) {
    S.air = Math.max(S.air, JUMP_T * 0.75);
    S.slideNext = true;
    return;
  }
  slide();
}
function slide() {
  S.slide = SLIDE_T;
  S.slideNext = false;
  if (coachEl.dataset.k === 'bar') coachDone();
  noise(0.3, 900, 0.7, 0.12, 0, 300);
  tone(220, 0.12, { type: 'triangle', vol: 0.05, to: 140 });
}

// ---------- fx ----------

let bannerTimer = 0;
function banner(html: string, cls = '', ms = 1300) {
  bannerEl.className = cls;
  bannerEl.innerHTML = html;
  bannerEl.classList.remove('show');
  void bannerEl.offsetWidth;
  bannerEl.classList.add('show');
  clearTimeout(bannerTimer);
  bannerTimer = window.setTimeout(() => bannerEl.classList.remove('show'), ms);
}
let creditTimer = 0;
// The creator's avatar, or a colored circle with their initial when they have none.
function face(s: Sub) {
  if (s.avatar) return `<img src="${esc(s.avatar)}" alt="">`;
  const who = byline(s).replace(/^@/, '');
  return `<b class="ph" style="--c:${catColor(s.cat)}">${esc(who.charAt(0).toUpperCase())}</b>`;
}
function credit(s: Sub) {
  const av = face(s);
  creditEl.innerHTML = `${av}<div><b>${esc(s.emoji)} ${esc(s.name)}</b><span>by ${esc(byline(s))}</span></div>`;
  creditEl.style.setProperty('--c', s.viral ? VIRAL : catColor(s.cat));
  creditEl.classList.remove('show');
  void creditEl.offsetWidth;
  creditEl.classList.add('show');
  clearTimeout(creditTimer);
  creditTimer = window.setTimeout(() => creditEl.classList.remove('show'), 1500);
}

// ---------- collisions ----------

// world position just above the cart, for sparks and floating numbers
const above = (dy = 0.9) => [S.x, S.y + dy, 0] as const;

function grab(e: Ent) {
  const s = e.sub!;
  if (s.viral) {
    if (S.hearts < HEARTS) {
      S.hearts++;
      Scene.floater(...above(1.5), '+1 ♥', '#ff6b8a');
    } else Scene.floater(...above(1.5), `+${POINTS.featured}`, '#ffd75e');
    if (S.hearts >= HEARTS) S.score += POINTS.featured;
    sfx.featured();
  }
  S.combo++;
  S.grabbed++;
  const pts = POINTS.bot * mult();
  S.score += pts;
  sfx.land(S.combo);
  buzz(8);
  if (S.cart.length === 0) coach('fill', '<b>4</b> Fill 4 slots to publish. Same color pays x3', 2600);
  // a banner each time the multiplier steps up, not again once it tops out
  if (S.combo % COMBO_STEP === 0 && S.combo <= (MAX_MULT - 1) * COMBO_STEP) {
    sfx.chord(mult());
    banner(`x${mult()}`, 'mult', 800);
  }
  Scene.burst(...above(0.7), s.viral ? VIRAL : catColor(s.cat), 22);
  Scene.floater(...above(1.7), `+${pts}`);
  Scene.collect(e, S.cart.length);
  credit(s);
  S.cart.push(s);
  S.squash = 0.18;
  if (S.cart.length >= SLOTS) publish();
}

function publish() {
  const bots = S.cart.slice();
  const cat = bots[0].cat;
  const match = bots.every((b) => b.cat === cat);
  const pts = POINTS.shelf * (match ? POINTS.matchX : 1) * mult();
  S.score += pts;
  S.shelves.push({ cat, bots, pts, match });
  S.cart = [];
  S.slow = 0.25;
  sfx.fanfare();
  buzz([20, 40, 30]);
  if (match) sfx.featured();
  for (const b of bots) Scene.burst(...above(0.7), catColor(b.cat), 14, 4);
  Scene.publish();
  const faces = bots.map((b) => `<span>${face(b)}<i>${esc(byline(b))}</i></span>`).join('');
  const c = CATS.find((x) => x.name === cat);
  banner(`<em>Shelf published</em><div class="faces">${faces}</div><strong>+${fmt(pts)}${match ? ` <small>All ${esc(c?.short ?? cat)} x3</small>` : ''}</strong>`, 'pub', 1700);
}

function hurt(cause: string, kind: EKind, e?: Ent) {
  if (S.inv > 0) return;
  if (S.shield) {
    S.shield = 0;
    S.inv = 1;
    S.shake = 0.2;
    buzz(30);
    sfx.glitch();
    Scene.shieldPop();
    banner(`<em class="blue">Verified saved you</em><small>${kind === 'scam' ? 'That one was a scam.' : 'The badge took the hit.'}</small>`, 'bad', 1300);
    return;
  }
  buzz([40, 30, 60]);
  music.hit();
  S.hearts--;
  S.combo = 0;
  S.inv = 1.3;
  S.shake = 0.35;
  Scene.hit();
  if (kind === 'scam' && e?.sub) {
    sfx.scam();
    const lost = S.cart.pop();
    banner(`<em class="bad">${esc(e.sub.stamp ?? 'SCAM')}</em><small>${esc(e.sub.missLine ?? '')}${lost ? ` It took ${esc(lost.name)}.` : ''}</small>`, 'bad', 1800);
    S.cause = e.sub.tell ?? 'A scam got you.';
  } else {
    sfx.crack();
    S.cause = cause;
  }
  Scene.burst(...above(0.6), '#f4212e', 26, 3.5);
  if (S.hearts <= 0) {
    S.dying = 0.9;
    S.slow = 0.2;
    sfx.sad(0.2);
  }
}

// Forgiving on purpose: pickups reach a bit past their lane, hazards need a
// solid hit. The magnet pulls pickups in from the next lane over.
function collide() {
  for (const e of S.ents) {
    if (e.done || e.passed || e.z > 0.45 || e.z < -0.7 || e.kind === 'gate') continue;
    const pick = PICKUP.has(e.kind);
    const reach = pick ? (S.magnet > 0 ? 1.7 : 0.62) : e.kind === 'barwide' ? 9 : 0.45;
    if (Math.abs((e.x ?? e.lane) - S.x) > reach) continue;
    if ((e.kind === 'bar' || e.kind === 'barwide') && S.slide > 0) continue;
    if (HAZARD.has(e.kind) && S.turbo > 0) {
      smash(e);
      continue;
    }
    if (e.kind === 'like') {
      if (S.y > 0.9 && S.magnet <= 0) continue;
      e.done = true;
      S.likes++;
      S.score += POINTS.like * mult();
      tone(1400 + (S.likes % 5) * 120, 0.04, { type: 'square', vol: 0.03 });
      Scene.burst(...above(0.5), '#f91880', 6, 1.6);
      continue;
    }
    if (e.kind === 'box' && S.y > BOX_H * 0.85) continue;
    e.done = true;
    if (e.kind === 'bot') grab(e);
    else if (e.kind === 'power') powerUp(e);
    else if (e.kind === 'dupe') {
      S.combo = 0;
      sfx.sad();
      banner(`<em class="warn">Dupe</em><small>You already grabbed ${esc(e.sub!.name)}.</small>`, 'bad', 1300);
    } else if (e.kind === 'scam') hurt('', 'scam', e);
    else if (e.kind === 'box') hurt('You hit a box. Swipe up to jump the low ones.', 'box');
    else if (e.kind === 'bar' || e.kind === 'barwide') hurt('You hit a low bar. Swipe down to slide under those.', e.kind);
    else if (e.kind === 'runaway') hurt('A runaway cart got you. When you see headlights, change lanes.', 'runaway');
    else hurt('You hit a wall. Those you have to go around.', 'wall');
  }
}

function powerUp(e: Ent) {
  buzz([10, 30, 10]);
  sfx.levelUp();
  Scene.burst(...above(0.8), e.power === 'shield' ? '#1d9bf0' : e.power === 'turbo' ? '#ffb020' : '#ff4fa3', 30, 4);
  if (e.power === 'turbo') {
    S.turbo = TURBO_T;
    S.slide = 0;
    sfx.whoosh();
    banner('<em class="gold">Turbo</em><small>Smash through anything for 5 seconds.</small>', 'pow', 1300);
  } else if (e.power === 'shield') {
    S.shield = 1;
    banner('<em class="blue">✓ Verified</em><small>The next hit bounces off.</small>', 'pow', 1300);
  } else {
    S.magnet = 8;
    banner('<em class="pink">Magnet</em><small>Bots and likes come to you for 8 seconds.</small>', 'pow', 1300);
  }
}

// A hazard that slides past the next lane right after you dodged it.
function closeCall() {
  S.close++;
  S.combo++;
  const pts = POINTS.close * mult();
  S.score += pts;
  Scene.floater(...above(1.4), `Close call +${pts}`, '#8bd3ff');
  tone(880, 0.06, { type: 'triangle', vol: 0.06 });
  tone(1320, 0.08, { type: 'triangle', vol: 0.05, delay: 0.05 });
  buzz(12);
}

// Turbo knocks a hazard flying instead of hurting you.
function smash(e: Ent) {
  e.done = true;
  e.smash = S.t;
  S.smashed++;
  S.combo++;
  const pts = POINTS.close * mult();
  S.score += pts;
  S.shake = Math.max(S.shake, 0.12);
  Scene.burst(...above(0.6), e.kind === 'scam' ? '#f4212e' : '#ffb020', 18, 4);
  Scene.floater(...above(1.4), `Smash +${pts}`, '#ffc94d');
  noise(0.14, 1400, 0.9, 0.22);
  tone(160, 0.12, { type: 'square', vol: 0.07, to: 70 });
  buzz(15);
}

// Through the gate: new scenery, hidden behind a quick flash.
const flashEl = $('#flash');
function enterZone(i: number) {
  S.zone = i;
  S.zoneAt += ZONE_T;
  S.gateOut = false;
  // swap at the flash's brightest moment
  setTimeout(() => {
    if (S.zone === i) Scene.setZone(i);
  }, 90);
  const z = ZONES[i % ZONES.length];
  flashEl.style.setProperty('--c', z.accent);
  flashEl.classList.remove('go');
  void flashEl.offsetWidth;
  flashEl.classList.add('go');
  banner(`<em style="color:${z.accent}">${esc(z.name)}</em><small>${esc(z.line)}</small>`, 'pow', 1800);
  sfx.levelUp();
  buzz([10, 20, 10]);
}

// ---------- loop ----------

function update(dt: number) {
  S.t += dt;
  if (S.turbo > 0) {
    S.turbo = Math.max(0, S.turbo - dt);
    if (S.turbo === 0) S.inv = Math.max(S.inv, 0.8); // a moment to find a lane
  }
  S.boost += ((S.turbo > 0 ? TURBO_V : 0) - S.boost) * (1 - Math.exp(-dt * 3));
  S.v = speedAt(S.t) + S.boost;
  S.slide = Math.max(0, S.slide - dt);
  music.speed(S.v);
  music.hype(mult() >= 2 || S.turbo > 0);
  const dz = S.v * dt;
  S.dist += dz;
  if (!S.dying) S.score += dz * POINTS.perMeter;
  for (const e of S.ents) {
    e.z -= dz;
    if (e.kind === 'runaway' && !e.done) e.z -= RUNAWAY_V * dt;
    if (e.kind === 'gate' && !e.done && e.z <= 0.3) {
      e.done = true;
      enterZone(e.zone ?? S.zone + 1);
    }
  }
  // count scams and walls that slid past
  for (const e of S.ents) {
    if (e.done || e.passed || e.z >= -0.7 || !HAZARD.has(e.kind)) continue;
    e.passed = true;
    if (e.kind !== 'box' && e.kind !== 'barwide') S.dodged++;
    if (!S.dying && e.kind !== 'box' && e.kind !== 'barwide' && Math.abs(e.lane - S.lane) === 1 && S.t - S.lastMove < 0.55) closeCall();
  }
  // the magnet bends pickups toward the cart as they get close
  S.magnet = Math.max(0, S.magnet - dt);
  for (const e of S.ents) {
    if (!PICKUP.has(e.kind)) continue;
    if (S.magnet > 0 && e.z < 8 && e.z > -0.7 && !e.done) {
      const k = clamp(1 - (e.z - 0.2) / 7.8, 0, 1);
      e.x = e.lane + (S.x - e.lane) * k * k;
    } else e.x = undefined;
  }
  // drop what's gone, in place, so a frame doesn't build a new array
  let keep = 0;
  for (let i = 0; i < S.ents.length; i++) {
    const e = S.ents[i];
    if (e.z > -9 && !(e.done && !KEEP.has(e.kind))) S.ents[keep++] = e;
  }
  S.ents.length = keep;
  S.nextRow -= dz;
  while (S.nextRow <= 0) {
    spawnRow(FAR + S.nextRow);
    S.nextRow += clamp(S.v * (0.8 - 0.22 * clamp(S.t / 100, 0, 1)), 6.5, 15);
  }
  // player
  S.x += (S.lane - S.x) * (1 - Math.exp(-dt * 18));
  if (S.air >= 0) {
    S.air += dt;
    const k = S.air / JUMP_T;
    if (k >= 1) {
      S.air = -1;
      S.y = 0;
      S.squash = 0.15;
      if (S.slideNext) slide();
    } else S.y = 4 * JUMP_H * k * (1 - k);
  }
  if (!S.dying) {
    collide();
    coachAhead();
  }
  S.inv = Math.max(0, S.inv - dt);
}

// DEV: main-thread cost and spacing of recent frames, for profiling
const work: number[] = [];
const spikes: Record<string, unknown>[] = [];
const gaps: number[] = [];
let last = performance.now();
// The display's frame time, learned from recent frames. Frame gaps wobble by
// a millisecond or two even when every frame is on time, and moving the world
// by that raw gap shows up as jitter. So a gap close to a whole number of
// display frames counts as exactly that many.
let period = 1000 / 60;
const recent: number[] = [];
function steady(gap: number) {
  if (gap > 0 && gap < 50) {
    recent.push(gap);
    if (recent.length > 40) recent.shift();
    if (recent.length >= 20) {
      const sorted = recent.slice().sort((a, b) => a - b);
      period = sorted[sorted.length >> 2]; // lower quartile: on-time frames, not the late ones
    }
  }
  const n = Math.round(gap / period);
  return n >= 1 && Math.abs(gap - n * period) < period * 0.25 ? n * period : gap;
}
function frame(now: number) {
  const w0 = performance.now();
  const gap = now - last;
  if (import.meta.env.DEV) {
    gaps.push(gap);
    if (gaps.length > 600) gaps.shift();
  }
  const raw = Math.min(0.05, Math.max(0, steady(gap)) / 1000);
  last = now;
  if (S.on && !S.paused) {
    S.slow += (1 - S.slow) * (1 - Math.exp(-raw * 2.2));
    const dt = raw * S.slow;
    if (S.dying > 0) {
      S.dying -= raw;
      update(dt * 0.4);
      if (S.dying <= 0) gameOver();
    } else update(dt);
    hud();
  }
  S.shake = Math.max(0, S.shake - raw);
  S.squash = Math.max(0, S.squash - raw);
  // the aisle drifts behind the menus
  if (!S.on) S.dist += raw * 2.5;
  Scene.frame(S, now / 1000, raw, S.on && !S.paused ? raw * S.slow : 0);
  if (import.meta.env.DEV) {
    const ms = performance.now() - w0;
    if (ms > 40) spikes.push({ ms: Math.round(ms), t: +S.t.toFixed(2), on: S.on, ...Scene.stats() });
    work.push(ms);
    if (work.length > 600) work.shift();
  }
  requestAnimationFrame(frame);
}

// Each HUD element is written only when its own value changes; the score
// changes every frame, the rest rarely.
// Each HUD element is written only when the number behind it changes, and
// the text is only built then. The score changes most frames, the rest rarely.
const hudLast: Record<string, number | string> = {};
function changed(key: string, v: number | string) {
  if (hudLast[key] === v) return false;
  hudLast[key] = v;
  return true;
}
function hud() {
  const m = mult();
  const score = Math.round(S.score);
  if (changed('score', score)) scoreEl.textContent = fmt(score);
  const dist = Math.round(S.dist);
  if (changed('dist', dist)) distEl.textContent = `${fmt(dist)} m`;
  if (changed('mult', m)) {
    multEl.textContent = `x${m}`;
    multEl.className = `m${m}`;
  }
  const pips = m >= MAX_MULT ? COMBO_STEP : S.combo % COMBO_STEP;
  if (changed('pips', pips)) comboEls.forEach((el, i) => el.classList.toggle('on', i < pips));
  if (changed('hearts', S.hearts))
    heartEls.forEach((el, i) => {
      const on = i < S.hearts;
      el.classList.toggle('lost', !on && el.classList.contains('on'));
      el.classList.toggle('on', on);
    });
  if (changed('pShield', S.shield)) pw.shield.classList.toggle('on', S.shield > 0);
  ring('magnet', S.magnet, 8);
  ring('turbo', S.turbo, TURBO_T);
  if (changed('zone', S.zone)) {
    const z = ZONES[S.zone % ZONES.length];
    const next = ZONES[(S.zone + 1) % ZONES.length];
    zoneNowEl.textContent = z.name;
    zoneNextEl.textContent = next.name;
    zoneEl.style.setProperty('--c', z.accent);
    zoneEl.style.setProperty('--n', next.accent);
  }
  const zp = Math.max(0, Math.min(100, Math.round((1 - (S.zoneAt - S.t) / ZONE_T) * 100)));
  if (changed('zp', zp)) zoneBarEl.style.transform = `scaleX(${zp / 100})`;
}

// A power's ring drains in 32 steps, so it costs a handful of style writes a
// second and CSS smooths the gaps.
function ring(k: 'magnet' | 'turbo', left: number, max: number) {
  const q = left > 0 ? Math.ceil((left / max) * 32) : 0;
  if (!changed(k, q)) return;
  pw[k].classList.toggle('on', q > 0);
  if (q > 0) pw[k].style.setProperty('--p', String(q / 32));
}

// ---------- input ----------

let sw: { id: number; x: number; y: number; fired: boolean } | null = null;
addEventListener(
  'pointerdown',
  (e) => {
    if ((e.target as Element).closest('button, a, #screen')) return;
    sw = { id: e.pointerId, x: e.clientX, y: e.clientY, fired: false };
  },
  { passive: true },
);
addEventListener(
  'pointermove',
  (e) => {
    if (!sw || sw.id !== e.pointerId || sw.fired) return;
    const dx = e.clientX - sw.x;
    const dy = e.clientY - sw.y;
    if (Math.hypot(dx, dy) < 22) return;
    sw.fired = true;
    if (Math.abs(dx) > Math.abs(dy)) move(dx < 0 ? -1 : 1);
    else if (dy < 0) jump();
    else drop();
  },
  { passive: true },
);
addEventListener('pointerup', () => (sw = null));
addEventListener('pointercancel', () => (sw = null));
addEventListener('keydown', (e) => {
  if ((e.target as Element).closest?.('input')) return; // typing a leaderboard name
  const k = e.key.toLowerCase();
  if (k === 'arrowleft' || k === 'a') move(-1);
  else if (k === 'arrowright' || k === 'd') move(1);
  else if (k === 'arrowup' || k === 'w' || k === ' ') jump();
  else if (k === 'arrowdown' || k === 's') drop();
  else if (k === 'p' || k === 'escape') togglePause();
  else if (k === 'm') muteBtn();
  else if (k === 'enter' && !S.on) start();
  else return;
  e.preventDefault();
});
document.addEventListener('visibilitychange', () => {
  if (document.hidden && S.on && !S.paused) togglePause();
});

// ---------- screens ----------

const BEST = 'shelf-run-best';
const best = () => Number(localStorage.getItem(BEST) || 0);

function intro() {
  screenEl.hidden = false;
  const how: [string, string, string, string][] = [
    [IC.sides, '', 'Swipe across', 'Change lanes. Go around walls.'],
    [IC.up, '', 'Swipe up', 'Jump over boxes.'],
    [IC.down, '', 'Swipe down', 'Slide under low bars.'],
    [IC.bot, 'blue', 'Grab bots', 'Fill 4 slots to publish a shelf. One color pays x3.'],
    [IC.scam, 'bad', 'Dodge scams', 'They twitch and ask for passwords.'],
    [IC.bolt, 'gold', 'Power-ups', 'Verified blocks a hit. Magnet pulls. Turbo smashes.'],
  ];
  screenEl.innerHTML = `<div class="sheet intro">
    <p class="chip">${fmt(BOT_COUNT)} real bots · ${CREATOR_COUNT} creators</p>
    <h1>Shelf Run</h1>
    <p class="sub">Push your shelf down the aisle and stock it with real bots from grokbotshelf.com.</p>
    <ul class="how">${how.map(([ic, cls, t, d]) => `<li><div><b class="${cls}">${ic}</b><strong>${t}</strong></div>${d}</li>`).join('')}</ul>
    <div class="zones">${ZONES.map((z) => `<span style="--c:${z.accent}">${esc(z.name)}</span>`).join('<i></i>')}</div>
    <p class="zones-note">A gate takes you somewhere new every ${ZONE_T} seconds.</p>
    <button id="go" class="pill big go" type="button">RUN</button>
    <p class="foot">${best() ? `<span class="best">Best ${fmt(best())}</span>` : ''}<a class="lb-link" href="/stats">Leaderboard and stats</a></p>
  </div>`;
  $('#go').onclick = start;
}

function start() {
  resetPools();
  Object.assign(S, {
    on: true,
    paused: false,
    over: false,
    t: 0,
    dist: 0,
    v: 10,
    score: 0,
    hearts: HEARTS,
    combo: 0,
    lane: 0,
    x: 0,
    y: 0,
    air: -1,
    inv: 0,
    slow: 1,
    shake: 0,
    squash: 0,
    ents: [],
    nextRow: 14,
    cart: [],
    shelves: [],
    grabbed: 0,
    likes: 0,
    dodged: 0,
    seen: new Set<string>(),
    lastViral: 0,
    cause: '',
    dying: 0,
    rows: 0,
    lastMove: -9,
    lastPower: 0,
    lastTwo: false,
    shield: 0,
    magnet: 0,
    close: 0,
    turbo: 0,
    boost: 0,
    slide: 0,
    slideNext: false,
    smashed: 0,
    zone: 0,
    zoneAt: ZONE_T,
    gateOut: false,
    lastRunaway: 0,
  });
  Scene.setZone(0);
  viralDeck.length = 0;
  // the aisle starts stocked, so the first bot is a second away
  for (let z = 16; z < FAR; z += 11) spawnRow(z);
  S.nextRow = 11 - ((FAR - 16) % 11);
  screenEl.hidden = true;
  for (const k in hudLast) delete hudLast[k];
  hud();
  sfx.levelUp();
  music.restart();
  coachDone();
  coach('lanes', `<b>${IC.sides}</b> Swipe left or right to switch lanes`, 4000);
  last = performance.now();
  runStarted();
}

// Rolls the final score up from zero in 0.7 s.
function countUp(el: HTMLElement, to: number) {
  const t0 = performance.now();
  const step = (now: number) => {
    const k = Math.min(1, (now - t0) / 700);
    el.textContent = fmt(Math.round(to * (1 - (1 - k) ** 3)));
    if (k < 1 && el.isConnected) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}

function togglePause() {
  if (!S.on || S.dying) return;
  S.paused = !S.paused;
  if (S.paused) {
    music.stop();
    screenEl.hidden = false;
    screenEl.innerHTML = `<div class="sheet"><p class="kicker">${esc(ZONES[S.zone % ZONES.length].name)} · ${fmt(Math.round(S.score))}</p><h1>Paused</h1><button id="go" class="pill big go" type="button">RESUME</button></div>`;
    $('#go').onclick = togglePause;
  } else {
    screenEl.hidden = true;
    music.start();
    last = performance.now();
  }
}

function gameOver() {
  music.stop();
  S.on = false;
  S.over = true;
  const prev = best();
  const score = Math.floor(S.score);
  if (score > prev) localStorage.setItem(BEST, String(score));
  const shelves = S.shelves
    .map(
      (
        sh,
      ) => `<div class="shelf" style="--c:${catColor(sh.cat)}"><div class="sh-h">${esc(CATS.find((c) => c.name === sh.cat)?.short ?? sh.cat)}${sh.match ? ' · x3' : ''}<span>+${fmt(sh.pts)}</span></div>
      ${sh.bots
        .map(
          (b) =>
            `<div class="row">${b.avatar ? `<img src="${esc(b.avatar)}" alt="">` : '<i></i>'}<div><a href="${esc(b.url ?? '#')}" target="_blank" rel="noopener">${esc(b.emoji)} ${esc(b.name)}</a>${b.handle ? `<a class="h" href="https://x.com/${esc(b.handle)}" target="_blank" rel="noopener">@${esc(b.handle)}</a>` : `<span class="h">${esc(byline(b))}</span>`}</div></div>`,
        )
        .join('')}</div>`,
    )
    .join('');
  screenEl.hidden = false;
  const tile = (v: string | number, label: string) => `<span><b>${v}</b>${label}</span>`;
  screenEl.innerHTML = `<div class="sheet over">
    <p class="kicker">Run over</p>
    <div class="final">0</div>
    <p class="best${score > prev ? ' new' : ''}">${score > prev ? 'New best' : `Best ${fmt(prev)}`}</p>
    <p class="cause">${esc(S.cause)}</p>
    <div class="stats">${tile(fmt(S.dist), 'meters')}${tile(S.grabbed, 'bots')}${tile(S.shelves.length, 'shelves')}${tile(S.dodged, 'dodged')}${tile(S.close, 'close calls')}${S.smashed ? tile(S.smashed, 'smashed') : ''}${S.zone ? tile(S.zone + 1, 'zones') : ''}</div>
    <div class="acts"><button id="go" class="pill big go" type="button">RUN AGAIN</button><button id="share" class="pill big ghost" type="button">Share</button></div>
    <div id="lb" class="lb" hidden></div>
    ${shelves ? `<h2>Your shelves</h2>${shelves}` : '<p class="sub">Fill all 4 slots on your cart to publish a shelf.</p>'}
  </div>`;
  countUp(screenEl.querySelector<HTMLElement>('.final')!, score);
  $('#go').onclick = start;
  $('#share').onclick = () => share(score);
  const result = {
    score,
    t: S.t,
    dist: Math.floor(S.dist),
    grabbed: S.grabbed,
    shelves: S.shelves.length,
    close: S.close + S.smashed,
    likes: S.likes,
    bots: S.shelves.flatMap((sh) => sh.bots.map((b) => b.url?.split('/').pop() ?? '')).filter(Boolean),
  };
  void runEnded(result).then((f) => leaderboard(f, score));
}

// ---------- leaderboard ----------

const ordinal = (n: number) => `#${fmt(n)}`;

function rankLine(r: Ranks) {
  return `<p class="lb-rank"><b>${ordinal(r.today)}</b> today · <b>${ordinal(r.all)}</b> all time</p>`;
}

// Fills the game-over leaderboard box once /api/finish answers. Stays hidden
// when the API isn't there (offline, or the plain Vite dev server).
function leaderboard(f: Finish | null, score: number) {
  const box = document.querySelector<HTMLElement>('#lb');
  if (!f || !box || !S.over) return;
  box.hidden = false;
  if ('ranks' in f) {
    named(box, f.ranks);
    return;
  }
  const w = f.wouldRank;
  box.innerHTML = `<p class="lb-rank">This run would be <b>${ordinal(w.today)}</b> today and <b>${ordinal(w.all)}</b> all time.</p>
    <form class="lb-form"><input id="lb-name" maxlength="20" autocomplete="nickname" autocapitalize="off" spellcheck="false" placeholder="Your name or @handle" value="${esc(savedName())}"><button class="pill" type="submit">Post</button></form>
    <p class="lb-err">${f.nameError ? "That name isn't allowed. Try another." : ''}</p>
    <div class="lb-top"></div>`;
  const form = box.querySelector('form')!;
  const input = box.querySelector<HTMLInputElement>('#lb-name')!;
  form.onsubmit = async (e) => {
    e.preventDefault();
    const name = input.value.trim();
    if (name.length < 2) {
      box.querySelector('.lb-err')!.textContent = 'Use at least 2 characters.';
      return;
    }
    form.querySelector('button')!.disabled = true;
    const r = await claimName(f.claim, name);
    if (r.ranks) {
      saveName(name);
      named(box, r.ranks);
    } else {
      form.querySelector('button')!.disabled = false;
      box.querySelector('.lb-err')!.textContent = r.error ?? '';
    }
  };
  void topList(box, null, score);
}

function named(box: HTMLElement, r: Ranks) {
  const name = savedName();
  box.innerHTML = `${rankLine(r)}<p class="lb-as">Posted as <b>${esc(name)}</b>. <button class="lb-change" type="button">Change name</button></p><div class="lb-top"></div>`;
  box.querySelector<HTMLButtonElement>('.lb-change')!.onclick = () => {
    const as = box.querySelector('.lb-as')!;
    as.innerHTML = `<form class="lb-form"><input id="lb-name" maxlength="20" autocomplete="nickname" autocapitalize="off" spellcheck="false" value="${esc(name)}"><button class="pill" type="submit">Save</button></form><small>Used from your next run.</small>`;
    const input = as.querySelector<HTMLInputElement>('input')!;
    input.focus();
    as.querySelector('form')!.onsubmit = (e) => {
      e.preventDefault();
      if (input.value.trim().length >= 2) saveName(input.value.trim());
      as.innerHTML = `Next run posts as <b>${esc(savedName())}</b>.`;
    };
  };
  void topList(box, name, r.best);
}

// Today's top 5, with the player's own score merged in so it shows right away
// even though /api/stats is cached for a couple of minutes.
async function topList(box: HTMLElement, name: string | null, score: number) {
  const s = await stats();
  const el = box.querySelector<HTMLElement>('.lb-top');
  if (!s || !el) return;
  let rows: Board = s.board.today.slice();
  if (name) {
    const key = name.replace(/^@/, '').toLowerCase();
    const mine = rows.find((r) => r.name.replace(/^@/, '').toLowerCase() === key);
    if (mine) mine.score = Math.max(mine.score, score);
    else rows.push({ name, score });
    rows.sort((a, b) => b.score - a.score);
  }
  rows = rows.slice(0, 5);
  if (!rows.length) return;
  const me = name?.replace(/^@/, '').toLowerCase();
  el.innerHTML = `<h2>Today's top runs</h2><ol>${rows
    .map((r) => `<li${me && r.name.replace(/^@/, '').toLowerCase() === me ? ' class="me"' : ''}><span>${esc(r.name)}</span><b>${fmt(r.score)}</b></li>`)
    .join('')}</ol><a class="lb-link" href="/stats">Full leaderboard and stats</a>`;
}

// Shares the run, crediting up to 3 of the creators whose bots made the shelves.
async function share(score: number) {
  const handles = [...new Set(S.shelves.flatMap((sh) => sh.bots.map((b) => b.handle)))].filter(Boolean).slice(0, 3);
  const n = S.shelves.length;
  const text =
    `I pushed my shelf ${fmt(S.dist)} m in Shelf Run and published ${n} shelf${n === 1 ? '' : 's'} of real Grok bots. Score ${fmt(score)}.` +
    (handles.length ? ` Bots by ${handles.map((h) => `@${h}`).join(', ')}.` : '');
  const btn = $('#share');
  try {
    if (navigator.share) await navigator.share({ title: 'Shelf Run', text, url: location.href });
    else {
      await navigator.clipboard.writeText(`${text} ${location.href}`);
      btn.textContent = 'Copied';
    }
  } catch {
    // the person closed the share sheet
  }
}

const muteEl = $('#mute');
const muteIcon = () => {
  muteEl.innerHTML = isMuted() ? IC.muted : IC.sound;
  muteEl.classList.toggle('off', isMuted());
};
function muteBtn() {
  toggleMute();
  muteIcon();
}
$('#pause').innerHTML = IC.pause;
$('#pause').onclick = togglePause;
muteEl.onclick = muteBtn;
muteIcon();

// preload a few avatars so the first cards have faces
for (let i = 0; i < 6; i++) avatar(realBot(rand(PLAY_CATS), new Set()).avatar);
resetPools();

Scene.init(cv);
intro();
hud();
requestAnimationFrame(frame);

if (import.meta.env.DEV) {
  (window as unknown as Record<string, unknown>).run = {
    get S() {
      return S;
    },
    move,
    jump,
    start,
    stats: () => Scene.stats(),
    debug: () => Scene.debug(),
    programs: () => Scene.programs(),
    perf() {
      const q = (a: number[], p: number) => [...a].sort((x, y) => x - y)[Math.floor(a.length * p)]?.toFixed(1);
      const r = {
        workP50: q(work, 0.5),
        workP95: q(work, 0.95),
        workMax: q(work, 0.999),
        gapP50: q(gaps, 0.5),
        gapP95: q(gaps, 0.95),
        gapMax: q(gaps, 0.999),
        long: gaps.filter((g) => g > 25).length,
        n: gaps.length,
      };
      const sp = spikes.splice(0);
      work.length = 0;
      gaps.length = 0;
      return { ...r, spikes: sp.slice(0, 8) };
    },
    power(kind: Power, lane = 0) {
      S.ents.push({ kind: 'power', lane, z: 9, seed: 1, power: kind });
    },
    spawn(kind: EKind, lane = 0, z = 30) {
      S.ents.push({ kind, lane, z, seed: Math.random() * 1000 });
    },
    zone(i: number) {
      enterZone(i);
    },
    setTime(t: number) {
      S.t = t;
    },
  };
}
