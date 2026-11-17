// Shelf Run's music: a small synth loop scheduled ahead on the Web Audio
// clock. A minor, four chords, 100 BPM at the start and up to 138 at top
// speed. A high combo adds an arpeggio. A hit muffles everything for a beat.
import { audioContext, isMuted } from '../audio';

const LOOKAHEAD = 0.14;
// Am, F, C, G as MIDI roots plus chord tones
const BARS = [
  [45, [57, 60, 64]],
  [41, [53, 57, 60]],
  [48, [55, 60, 64]],
  [43, [55, 59, 62]],
] as const;
const hz = (m: number) => 440 * Math.pow(2, (m - 69) / 12);

let ctx: AudioContext | null = null;
let bus: GainNode | null = null;
let lp: BiquadFilterNode | null = null;
let noiseBuf: AudioBuffer | null = null;
let timer = 0;
let next = 0;
let step = 0;
let bpm = 100;
let hype = 0;

function setup() {
  ctx = audioContext();
  if (!ctx || bus) return !!ctx;
  lp = ctx.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.value = 18000;
  bus = ctx.createGain();
  bus.gain.value = 0.5;
  bus.connect(lp).connect(ctx.destination);
  noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
  const d = noiseBuf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  return true;
}

function osc(type: OscillatorType, f: number, t: number, dur: number, vol: number, to?: number) {
  const o = ctx!.createOscillator();
  const g = ctx!.createGain();
  o.type = type;
  o.frequency.setValueAtTime(f, t);
  if (to) o.frequency.exponentialRampToValueAtTime(to, t + dur);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(vol, t + 0.008);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(bus!);
  o.start(t);
  o.stop(t + dur + 0.02);
}

function hiss(t: number, dur: number, freq: number, vol: number) {
  const s = ctx!.createBufferSource();
  s.buffer = noiseBuf;
  const f = ctx!.createBiquadFilter();
  f.type = 'highpass';
  f.frequency.value = freq;
  const g = ctx!.createGain();
  g.gain.setValueAtTime(vol, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  s.connect(f).connect(g).connect(bus!);
  s.start(t, Math.random() * 0.5);
  s.stop(t + dur + 0.02);
}

function play(i: number, t: number, sixteenth: number) {
  const bar = BARS[Math.floor(i / 16) % BARS.length];
  const s = i % 16;
  const [root, chord] = bar;
  // kick on the beat, clap on 2 and 4, hats on the off-beats
  if (s % 4 === 0) osc('sine', 150, t, 0.16, 0.5, 45);
  if (s === 4 || s === 12) {
    hiss(t, 0.12, 1400, 0.16);
    osc('triangle', 210, t, 0.06, 0.08, 150);
  }
  if (s % 4 === 2) hiss(t, 0.03, 7000, 0.06);
  if (hype && s % 2 === 1) hiss(t, 0.02, 9000, 0.03);
  // bass on eighths: root, root, octave, root
  if (s % 2 === 0) {
    const n = s % 8 === 4 ? root + 12 : root;
    osc('sawtooth', hz(n), t, sixteenth * 1.7, 0.07);
    osc('sine', hz(n - 12), t, sixteenth * 1.8, 0.12);
  }
  // a soft pad at the top of each bar
  if (s === 0) for (const n of chord) osc('triangle', hz(n), t, sixteenth * 15, 0.025);
  // the arpeggio, only while the combo is up
  if (hype) osc('square', hz(chord[s % 3] + 12 + (s % 6 === 5 ? 12 : 0)), t, sixteenth * 0.8, 0.022);
}

function tick() {
  if (!ctx || !bus) return;
  bus.gain.setTargetAtTime(isMuted() ? 0 : 0.5, ctx.currentTime, 0.05);
  if (isMuted()) {
    next = ctx.currentTime + 0.05;
    return;
  }
  const sixteenth = 60 / bpm / 4;
  while (next < ctx.currentTime + LOOKAHEAD) {
    play(step, next, sixteenth);
    step++;
    next += sixteenth;
  }
}

export const music = {
  start() {
    if (!setup() || timer) return;
    next = ctx!.currentTime + 0.06;
    timer = window.setInterval(tick, 25);
  },
  stop() {
    clearInterval(timer);
    timer = 0;
  },
  restart() {
    step = 0;
    this.stop();
    this.start();
  },
  // speed is the run speed in lanes per second (10 to 27)
  speed(v: number) {
    bpm = 100 + Math.max(0, v - 10) * 2.25;
  },
  hype(on: boolean) {
    hype = on ? 1 : 0;
  },
  hit() {
    if (!ctx || !lp) return;
    const t = ctx.currentTime;
    lp.frequency.cancelScheduledValues(t);
    lp.frequency.setValueAtTime(500, t);
    lp.frequency.exponentialRampToValueAtTime(18000, t + 0.9);
  },
};
