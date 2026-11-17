// The score API must never reject a run the game can really produce. These
// tests play the best possible runs with the game's own numbers
// (api/_lib/balance.ts) and check them against the API's limits.
import { describe, expect, it } from 'vitest';
import { COMBO_STEP, MAX_MULT, POINTS, POWER_GAP, TURBO_T, TURBO_V, multFor, speedAt } from '../api/_lib/balance';
import { implausible, maxDist, maxScore, type Result } from '../api/_lib/rules';

// Moves the cart the way update() in src/runner/main.ts does, taking a Turbo
// the moment each power-up can first appear. Returns meters covered by each
// whole second.
function fastestRun(seconds: number, dt = 1 / 60) {
  let t = 0;
  let dist = 0;
  let turbo = 0;
  let boost = 0;
  let lastPower = 0;
  const at: number[] = [0];
  while (t < seconds) {
    t += dt;
    if (t - lastPower > POWER_GAP) {
      lastPower = t;
      turbo = TURBO_T;
    }
    turbo = Math.max(0, turbo - dt);
    boost += ((turbo > 0 ? TURBO_V : 0) - boost) * (1 - Math.exp(-dt * 3));
    dist += (speedAt(t) + boost) * dt;
    if (Math.floor(t) > at.length - 1) at.push(dist);
  }
  return at;
}

describe('speed', () => {
  it('ramps from 10 m/s to a 27 m/s top speed at 100 s', () => {
    expect(speedAt(0)).toBe(10);
    expect(speedAt(50)).toBeCloseTo(18.5);
    expect(speedAt(100)).toBeCloseTo(27);
    expect(speedAt(1000)).toBe(27);
  });

  it('maxDist covers the fastest possible run at every second', () => {
    const run = fastestRun(900);
    for (let s = 1; s < run.length; s++) expect(run[s], `at ${s}s`).toBeLessThanOrEqual(maxDist(s));
  });

  it('maxDist is not wildly loose either', () => {
    const run = fastestRun(300);
    expect(maxDist(300)).toBeLessThan(run[300] * 1.1);
  });
});

describe('multiplier', () => {
  it('steps up every COMBO_STEP hits and stops at MAX_MULT', () => {
    expect(multFor(0)).toBe(1);
    expect(multFor(COMBO_STEP - 1)).toBe(1);
    expect(multFor(COMBO_STEP)).toBe(2);
    expect(multFor(COMBO_STEP * 10)).toBe(MAX_MULT);
  });
});

describe('score limit', () => {
  // A run where every point is earned at the top multiplier, every shelf
  // matches and a featured bot lands at full hearts every 20 s.
  function bestScore(r: Result) {
    return (
      r.dist * POINTS.perMeter +
      r.grabbed * POINTS.bot * MAX_MULT +
      r.shelves * POINTS.shelf * POINTS.matchX * MAX_MULT +
      r.close * POINTS.close * MAX_MULT +
      r.likes * POINTS.like * MAX_MULT +
      POINTS.featured * Math.floor(r.t / 20)
    );
  }

  for (const t of [30, 120, 600]) {
    it(`accepts the best possible ${t} s run`, () => {
      const dist = Math.floor(fastestRun(t)[t]);
      const grabbed = Math.floor(4 * t);
      const r: Result = { t, dist, grabbed, shelves: Math.floor(grabbed / 4), close: Math.floor(1.5 * t), likes: 10 * t, score: 0, bots: [] };
      r.score = Math.floor(bestScore(r));
      expect(r.score).toBeLessThanOrEqual(maxScore(r));
      expect(implausible(r, t + 1)).toBe('');
    });
  }
});
