// The places a run passes through. Every ZONE_T seconds a gate rolls up the
// aisle and the scenery behind it changes. Colors here are plain data;
// scene.ts turns them into materials and lights.

export type ZoneKey = 'store' | 'forest' | 'orbit';

export interface Zone {
  key: ZoneKey;
  name: string; // shown on the banner when you enter
  line: string; // the banner's second line
  sign: string; // the hanging sign over the aisle
  accent: string; // gate, sign and banner color
  bg: string; // sky and fog color
  fog: [number, number];
  hemi: [string, string, number]; // sky, ground, intensity
  key_: [string, number]; // key light color, intensity
  env: number;
  exposure: number;
  frame: { tint: string; rough: number; metal: number; wood: boolean };
  back: boolean; // solid back panels and a ceiling, like a store
  floor: { tint: string; opacity: number; rough: number };
  strip: number; // neon strip brightness
  stripGlow: number;
  pool: string; // light pools on the floor
  far: string; // glow at the end of the aisle
  dust: { color: string; size: number; n: number; flicker: number; rush: number };
}

export const ZONES: Zone[] = [
  {
    key: 'store',
    name: 'Night Store',
    line: 'Back where it started.',
    sign: 'GROK BOT SHELF',
    accent: '#1d9bf0',
    bg: '#05070c',
    fog: [26, 66],
    hemi: ['#8fb3ff', '#0b0b14', 0.45],
    key_: ['#ffffff', 0.75],
    env: 0.32,
    exposure: 0.95,
    frame: { tint: '#2a3340', rough: 0.55, metal: 0.45, wood: false },
    back: true,
    floor: { tint: '#9aa3b0', opacity: 0.74, rough: 0.28 },
    strip: 2.2,
    stripGlow: 0.55,
    pool: '#9cc8ff',
    far: '#1d5bd8',
    dust: { color: '#5d6f88', size: 0.045, n: 60, flicker: 0, rush: 0 },
  },
  {
    key: 'forest',
    name: 'Forest Market',
    line: 'Wooden shelves, lanterns, fireflies.',
    sign: 'FOREST MARKET',
    accent: '#7bdc6a',
    bg: '#07130f',
    fog: [20, 60],
    hemi: ['#a6e0a8', '#1a1208', 0.6],
    key_: ['#ffd9a0', 0.85],
    env: 0.22,
    exposure: 1.0,
    frame: { tint: '#c89a6a', rough: 0.85, metal: 0, wood: true },
    back: false,
    floor: { tint: '#b8a58a', opacity: 0.94, rough: 0.9 },
    strip: 1.1,
    stripGlow: 0.25,
    pool: '#ffb45e',
    far: '#3a8f4a',
    dust: { color: '#d8ff6a', size: 0.13, n: 120, flicker: 1, rush: 0 },
  },
  {
    key: 'orbit',
    name: 'Orbit Depot',
    line: 'Low gravity. Lasers. Mind the cargo.',
    sign: 'ORBIT DEPOT',
    accent: '#b47cff',
    bg: '#06041a',
    fog: [28, 72],
    hemi: ['#b49cff', '#0a0618', 0.55],
    key_: ['#e6ecff', 0.95],
    env: 0.45,
    exposure: 1.0,
    frame: { tint: '#e4e8f2', rough: 0.3, metal: 0.55, wood: false },
    back: false,
    floor: { tint: '#c7cde6', opacity: 0.8, rough: 0.2 },
    strip: 2.8,
    stripGlow: 0.7,
    pool: '#b18cff',
    far: '#6a3cff',
    dust: { color: '#7ff0ff', size: 0.06, n: 140, flicker: 0, rush: 1 },
  },
];

export const ZONE_T = 40; // seconds of game time per zone
