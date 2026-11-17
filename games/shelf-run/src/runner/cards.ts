// Card faces for Shelf Run. Each bot is drawn once to an offscreen canvas and
// then scaled in the world. Creator avatars load in the background and the
// card redraws itself when its avatar arrives.
import { byline, catColor, type Sub } from '../bots';

export const VIRAL = '#ff4fa3';
export const CARD_W = 220;
export const CARD_H = 280;
// Card canvases are drawn at 2x so they stay sharp up close. WebGL mipmaps
// keep them clean when they're far away.
const RES = 2;
const version = new WeakMap<HTMLCanvasElement, number>();
export const cardVersion = (c: HTMLCanvasElement) => version.get(c) ?? 0;

const imgs = new Map<string, HTMLImageElement>();
const waiting = new Map<string, Array<() => void>>();

export function avatar(url: string | null, onLoad?: () => void): HTMLImageElement | null {
  if (!url) return null;
  let img = imgs.get(url);
  if (!img) {
    img = new Image();
    img.decoding = 'async';
    img.src = url;
    imgs.set(url, img);
    img.onload = () => {
      for (const f of waiting.get(url) ?? []) f();
      waiting.delete(url);
    };
  }
  if (img.complete && img.naturalWidth) return img;
  if (onLoad) waiting.set(url, [...(waiting.get(url) ?? []), onLoad]);
  return null;
}

function rr(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  g.beginPath();
  g.roundRect(x, y, w, h, r);
}

function fitLines(g: CanvasRenderingContext2D, text: string, max: number, lines: number) {
  const words = text.split(/\s+/);
  const out: string[] = [];
  let cur = '';
  for (const w of words) {
    const t = cur ? `${cur} ${w}` : w;
    if (g.measureText(t).width <= max) cur = t;
    else {
      if (cur) out.push(cur);
      cur = w;
    }
    if (out.length === lines) break;
  }
  if (out.length < lines && cur) out.push(cur);
  if (out.length === lines && words.join(' ') !== out.join(' ')) {
    let last = out[lines - 1];
    while (last.length > 1 && g.measureText(`${last}…`).width > max) last = last.slice(0, -1);
    out[lines - 1] = `${last}…`;
  }
  return out.slice(0, lines);
}

const SANS = '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif';
const MONO = 'ui-monospace, "SF Mono", Menlo, Consolas, monospace';

// which bot each canvas shows now, so a late avatar never repaints a canvas
// that has since been handed to another card
const owner = new WeakMap<HTMLCanvasElement, number>();

function paint(c: HTMLCanvasElement, s: Sub) {
  if (owner.get(c) !== s.uid) return;
  const g = c.getContext('2d')!;
  const col = s.viral ? VIRAL : catColor(s.cat);
  version.set(c, cardVersion(c) + 1);
  g.setTransform(RES, 0, 0, RES, 0, 0);
  g.clearRect(0, 0, CARD_W, CARD_H);
  // body
  rr(g, 3, 3, CARD_W - 6, CARD_H - 6, 20);
  g.fillStyle = '#16181c';
  g.fill();
  g.lineWidth = 6;
  g.strokeStyle = col;
  g.stroke();
  // emoji tile
  rr(g, CARD_W / 2 - 40, 18, 80, 80, 18);
  g.fillStyle = `${col}33`;
  g.fill();
  g.font = `52px ${SANS}`;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillStyle = '#fff';
  g.fillText(s.emoji || '🤖', CARD_W / 2, 60);
  // name
  g.fillStyle = '#e7e9ea';
  g.font = `700 23px ${SANS}`;
  const lines = fitLines(g, s.name, CARD_W - 28, 2);
  lines.forEach((l, i) => g.fillText(l, CARD_W / 2, 122 + i * 26 + (lines.length === 1 ? 12 : 0)));
  // creator row
  const ay = 196;
  const img = avatar(s.avatar, () => paint(c, s));
  g.save();
  g.beginPath();
  g.arc(36, ay, 20, 0, Math.PI * 2);
  g.clip();
  if (img) g.drawImage(img, 16, ay - 20, 40, 40);
  else {
    g.fillStyle = '#2f3336';
    g.fillRect(16, ay - 20, 40, 40);
  }
  g.restore();
  g.textAlign = 'left';
  g.fillStyle = '#e7e9ea';
  g.font = `700 18px ${SANS}`;
  const who = fitLines(g, byline(s), CARD_W - 76, 1)[0];
  g.fillText(who, 64, ay);
  // the tell zone: link, or the ask for a tier 2 scam
  rr(g, 12, 228, CARD_W - 24, 38, 10);
  g.fillStyle = '#0a0b0d';
  g.fill();
  g.font = `600 16px ${MONO}`;
  g.textAlign = 'center';
  if (s.kind === 'scam' && s.tellZone === 'tag') {
    g.fillStyle = '#ffb3b8';
    g.font = `700 15px ${SANS}`;
    g.fillText(fitLines(g, s.tagline, CARD_W - 36, 1)[0], CARD_W / 2, 248);
  } else {
    const dom = s.link.split('/')[0];
    const host = s.link.startsWith('x.ai/bot') ? 'x.ai/bot' : dom;
    const tail = s.link.slice(host.length);
    g.fillStyle = '#e7e9ea';
    const full = `${host}${tail.slice(0, 5)}`;
    g.fillText(fitLines(g, full, CARD_W - 36, 1)[0], CARD_W / 2, 248);
  }
  if (s.viral) {
    rr(g, CARD_W - 86, 8, 76, 26, 13);
    g.fillStyle = VIRAL;
    g.fill();
    g.fillStyle = '#fff';
    g.font = `800 14px ${SANS}`;
    g.fillText('VIRAL ♥', CARD_W - 48, 22);
  }
}

// Card canvases belong to the pooled card views in scene.ts and get reused:
// a fresh canvas and GPU texture per card cost a few milliseconds each on a
// phone, enough to drop a frame.
export function newCardCanvas(): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = CARD_W * RES;
  c.height = CARD_H * RES;
  return c;
}

export function drawCard(c: HTMLCanvasElement, s: Sub) {
  owner.set(c, s.uid);
  paint(c, s);
}

// A small square emoji tile for the cart's slots.
const tiles = new Map<string, HTMLCanvasElement>();
export function emojiTile(s: Sub): HTMLCanvasElement {
  const col = s.viral ? VIRAL : catColor(s.cat);
  const k = `${s.emoji}|${col}`;
  let c = tiles.get(k);
  if (c) return c;
  c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d')!;
  const grad = g.createLinearGradient(0, 0, 0, 128);
  grad.addColorStop(0, `${col}aa`);
  grad.addColorStop(1, `${col}44`);
  rr(g, 4, 4, 120, 120, 22);
  g.fillStyle = '#0f1419';
  g.fill();
  g.fillStyle = grad;
  g.fill();
  g.font = `78px ${SANS}`;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillStyle = '#fff';
  g.fillText(s.emoji || '🤖', 64, 70);
  tiles.set(k, c);
  return c;
}
