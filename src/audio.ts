// Tiny Web Audio synth for Shelf Life. No files, everything is generated.
// Exports: tone, noise, sfx, audioContext, isMuted, toggleMute.
// sfx: pick, pop, build, chime, perfect, coin, bad, sad, trash, arrive, door, scam,
// featured, streak, post, stack, goal, builder, trend, glitch, fix, hammer, stamp,
// warn, levelUp, fanfare, land, chord, shred, whoosh, thunk, tick, nail,
// perfectNail, clatter, crack, siren, arp.
import { load, save } from './storage';

let ctx: AudioContext | null = null;
let noiseBuf: AudioBuffer | null = null;
// The key predates the Shelf Run name. Keep it so players keep their setting.
const MUTED = 'shelf-life-muted';
let muted = load(MUTED) === '1';

interface ToneOpts {
  type?: OscillatorType;
  vol?: number;
  delay?: number;
  to?: number;
}

// The shared context, or null when muted or audio is unavailable.
function audio(): AudioContext | null {
  if (muted) return null;
  try {
    ctx ??= new AudioContext();
    if (ctx.state === 'suspended') void ctx.resume();
    return ctx;
  } catch {
    return null;
  }
}

export function tone(freq: number, dur: number, { type = 'sine', vol = 0.12, delay = 0, to }: ToneOpts = {}) {
  const c = audio();
  if (!c) return;
  try {
    const t = c.currentTime + delay;
    const o = c.createOscillator();
    const g = c.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (to) o.frequency.exponentialRampToValueAtTime(to, t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(c.destination);
    o.start(t);
    o.stop(t + dur + 0.03);
  } catch {
    // audio is optional
  }
}

// Band-passed white noise. `to` sweeps the filter frequency over the sound.
export function noise(dur: number, freq: number, q: number, vol: number, delay = 0, to?: number) {
  const c = audio();
  if (!c) return;
  try {
    if (!noiseBuf || noiseBuf.sampleRate !== c.sampleRate) {
      noiseBuf = c.createBuffer(1, c.sampleRate, c.sampleRate);
      const d = noiseBuf.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    }
    const t = c.currentTime + delay;
    const src = c.createBufferSource();
    src.buffer = noiseBuf;
    const f = c.createBiquadFilter();
    f.type = 'bandpass';
    f.Q.value = q;
    f.frequency.setValueAtTime(freq, t);
    if (to) f.frequency.exponentialRampToValueAtTime(to, t + dur);
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f).connect(g).connect(c.destination);
    // random start point so repeats don't sound identical
    src.start(t, Math.random() * Math.max(0, 1 - dur));
    src.stop(t + dur + 0.03);
  } catch {
    // audio is optional
  }
}

// Rises 600 to 900 and back to 600 Hz over 0.8s.
function sirenSweep(delay: number) {
  const c = audio();
  if (!c) return;
  try {
    const t = c.currentTime + delay;
    const o = c.createOscillator();
    const g = c.createGain();
    o.type = 'sawtooth';
    o.frequency.setValueAtTime(600, t);
    o.frequency.linearRampToValueAtTime(900, t + 0.4);
    o.frequency.linearRampToValueAtTime(600, t + 0.8);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.04, t + 0.03);
    g.gain.setValueAtTime(0.04, t + 0.72);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.8);
    o.connect(g).connect(c.destination);
    o.start(t);
    o.stop(t + 0.83);
  } catch {
    // audio is optional
  }
}

function nailAt(delay: number) {
  tone(900, 0.04, { type: 'triangle', vol: 0.09, delay });
  tone(140, 0.06, { type: 'square', vol: 0.08, to: 60, delay });
}

const semi = (n: number) => 2 ** (n / 12);
// C E G B over two octaves, from C4
const ARP = [262, 330, 392, 494, 523, 659, 784, 988];

export const sfx = {
  pick: () => tone(440, 0.05, { type: 'triangle', vol: 0.06 }),
  pop: () => {
    tone(660, 0.09, { type: 'triangle' });
    tone(990, 0.08, { type: 'triangle', delay: 0.05, vol: 0.08 });
  },
  build: () => {
    tone(150, 0.16, { type: 'square', vol: 0.07, to: 70 });
    tone(240, 0.09, { type: 'triangle', delay: 0.07 });
    tone(320, 0.09, { type: 'triangle', delay: 0.14, vol: 0.08 });
  },
  chime: () => {
    tone(784, 0.14);
    tone(1175, 0.22, { delay: 0.09 });
  },
  perfect: (delay = 0) => {
    tone(784, 0.12, { delay });
    tone(988, 0.12, { delay: delay + 0.08 });
    tone(1319, 0.25, { delay: delay + 0.16 });
  },
  coin: () => {
    tone(1320, 0.06, { type: 'square', vol: 0.04 });
    tone(1760, 0.1, { type: 'square', vol: 0.04, delay: 0.06 });
  },
  bad: () => tone(220, 0.18, { type: 'sawtooth', vol: 0.05, to: 130 }),
  sad: (delay = 0) => {
    tone(392, 0.18, { vol: 0.07, delay });
    tone(311, 0.3, { vol: 0.07, delay: delay + 0.15 });
  },
  trash: () => tone(520, 0.22, { type: 'triangle', vol: 0.07, to: 110 }),
  arrive: () => tone(880, 0.05, { vol: 0.035 }),
  door: () => {
    tone(1047, 0.1, { vol: 0.04 });
    tone(1319, 0.14, { vol: 0.035, delay: 0.08 });
  },
  // quiet halves the volume, for a scam that was caught
  scam: (quiet = false) => {
    const v = quiet ? 0.5 : 1;
    tone(180, 0.35, { type: 'sawtooth', vol: 0.08 * v, to: 60 });
    tone(170, 0.35, { type: 'square', vol: 0.03 * v, to: 55, delay: 0.02 });
  },
  featured: () => [784, 988, 1175, 1568].forEach((f, i) => tone(f, 0.16, { type: 'triangle', delay: i * 0.07, vol: 0.08 })),
  // old combo melody, replaced by land()
  streak: (n: number) => {
    const f = 523 * Math.pow(2, Math.min(n, 12) / 12);
    tone(f, 0.1, { type: 'triangle', vol: 0.08 });
    tone(f * 1.5, 0.14, { type: 'triangle', vol: 0.06, delay: 0.06 });
  },
  post: () => {
    tone(300, 0.18, { type: 'sine', vol: 0.06, to: 1400 });
    tone(1568, 0.1, { type: 'triangle', vol: 0.05, delay: 0.16 });
  },
  stack: () => [523, 659, 784, 1047, 1319].forEach((f, i) => tone(f, 0.18, { type: 'square', vol: 0.045, delay: i * 0.07 })),
  goal: () => {
    tone(880, 0.1, { type: 'triangle', vol: 0.08 });
    tone(1320, 0.18, { type: 'triangle', vol: 0.08, delay: 0.08 });
  },
  builder: () => [659, 831, 988].forEach((f, i) => tone(f, 0.14, { type: 'sine', vol: 0.08, delay: i * 0.08 })),
  trend: () => [440, 554, 659, 880].forEach((f, i) => tone(f, 0.12, { type: 'sawtooth', vol: 0.03, delay: i * 0.05 })),
  glitch: () => {
    tone(880, 0.05, { type: 'square', vol: 0.04 });
    tone(220, 0.08, { type: 'square', vol: 0.04, delay: 0.05 });
    tone(660, 0.05, { type: 'square', vol: 0.04, delay: 0.12 });
  },
  fix: () => {
    tone(392, 0.08, { type: 'triangle', vol: 0.08, to: 784 });
    tone(1047, 0.12, { type: 'triangle', vol: 0.06, delay: 0.08 });
  },
  hammer: (n: number) => {
    tone(140 + n * 40, 0.07, { type: 'square', vol: 0.09, to: 60 });
    tone(900 + n * 120, 0.03, { type: 'triangle', vol: 0.05, delay: 0.01 });
  },
  stamp: () => {
    tone(90, 0.12, { type: 'square', vol: 0.1, to: 45 });
    tone(300, 0.05, { type: 'triangle', vol: 0.05 });
  },
  warn: () => {
    tone(330, 0.08, { type: 'square', vol: 0.035 });
    tone(330, 0.08, { type: 'square', vol: 0.035, delay: 0.14 });
  },
  levelUp: () => [523, 659, 784, 1047, 1319].forEach((f, i) => tone(f, 0.12, { type: 'triangle', delay: i * 0.06, vol: 0.07 })),
  fanfare: () => [523, 659, 784, 1047].forEach((f, i) => tone(f, 0.22, { type: 'triangle', delay: i * 0.11, vol: 0.09 })),

  // landing pop, one semitone higher per combo step, wrapping each octave
  land: (combo: number) => {
    const f = 523 * semi(((combo % 12) + 12) % 12);
    tone(f, 0.09, { type: 'triangle', vol: 0.09 });
    tone(f * 1.5, 0.09, { type: 'triangle', vol: 0.06 });
  },
  // major triad on C5 shifted up by mult semitones, for the x2, x3, x4 steps
  chord: (mult: number) => [523.25, 659.25, 783.99].forEach((f) => tone(f * semi(mult), 0.25, { type: 'triangle', vol: 0.07 })),
  shred: () => {
    noise(0.18, 1800, 0.8, 0.25);
    sfx.stamp();
  },
  whoosh: () => noise(0.12, 600, 1, 0.14, 0, 2400),
  thunk: () => tone(110, 0.12, { type: 'square', vol: 0.1, to: 70 }),
  tick: (urgent = false) => tone(urgent ? 1600 : 1200, 0.03, { type: 'square', vol: 0.03 }),
  nail: () => nailAt(0),
  perfectNail: () => {
    nailAt(0);
    nailAt(0.07);
    sfx.perfect(0.1);
  },
  clatter: () => [2500, 1800, 2200, 1500].forEach((f, i) => noise(0.05, f, 3, 0.2 * 0.7 ** i, i * 0.06)),
  crack: () => {
    noise(0.1, 3000, 1, 0.2);
    sfx.sad(0.05);
  },
  // two-tone raid siren, 0.8s
  siren: () => sirenSweep(0),
  // one 16th note of the Rush arpeggio; call every 107ms of game time
  arp: (step: number) => {
    const i = ((step % ARP.length) + ARP.length) % ARP.length;
    tone(ARP[i], 0.08, { type: 'triangle', vol: i % 4 === 0 ? 0.07 : 0.05 });
  },
};

// The shared context for other synths, such as Shelf Run's music.
export function audioContext() {
  return audio();
}

export function isMuted() {
  return muted;
}

export function toggleMute() {
  muted = !muted;
  save(MUTED, muted ? '1' : '0');
  return muted;
}
