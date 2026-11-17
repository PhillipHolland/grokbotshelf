// Game balance numbers that the game and the score API must agree on.
//
// The game (src/runner/main.ts) uses these to move the cart and add up the
// score. The score API (api/_lib/rules.ts) uses the same numbers to decide
// whether a submitted run could be real. Change a number here and both sides
// change together, so a balance tweak can't quietly start rejecting real runs.
// tests/balance.test.ts simulates the best possible runs against the API's
// limits to catch a mismatch.
//
// This file lives under api/_lib so Vercel bundles it with the functions with
// no extra config. It must stay free of DOM, Node and Redis imports.

export const SPEED = {
  start: 10, // m/s at the start of a run
  ramp: 0.17, // m/s gained every second
  maxGain: 17, // the ramp stops here, so top speed is start + maxGain
};

/** Aisle speed in m/s after t seconds of game time, before Turbo. */
export const speedAt = (t: number) => SPEED.start + Math.min(SPEED.maxGain, t * SPEED.ramp);

export const TURBO_T = 5; // seconds of Turbo
export const TURBO_V = 9; // extra m/s while Turbo is on
export const POWER_GAP = 26; // a power-up shows up at most once every this many seconds
export const VIRAL_GAP = 25; // seconds between featured (viral) bots

export const SLOTS = 4; // bots on a cart before it publishes a shelf
export const COMBO_STEP = 6; // combo hits per multiplier step
export const MAX_MULT = 4;

/** Score multiplier for a combo: x1, then one more every COMBO_STEP hits, up to MAX_MULT. */
export const multFor = (combo: number) => 1 + Math.min(MAX_MULT - 1, Math.floor(combo / COMBO_STEP));

// Points before the multiplier unless noted.
export const POINTS = {
  perMeter: 0.5, // not multiplied
  bot: 100,
  shelf: 400,
  matchX: 3, // a shelf of one category pays this many times more
  close: 50, // a close call, or a Turbo smash
  like: 10,
  featured: 500, // a featured bot grabbed at full hearts, not multiplied
};
