// 1200x630 share cards for category and hub pages. No Chrome: a flat PNG with a bitmap font.
// scripts/build.js writes public/og/category/<slug>.png and public/og/hub/<slug>.png.
const zlib = require("zlib");

const W = 1200, H = 630;
// 5x7 glyphs, row-major, '1' is ink. Missing characters are skipped.
const G = {
  " ": ["00000", "00000", "00000", "00000", "00000", "00000", "00000"],
  "-": ["00000", "00000", "00000", "11111", "00000", "00000", "00000"],
  ".": ["00000", "00000", "00000", "00000", "00000", "01100", "01100"],
  ",": ["00000", "00000", "00000", "00000", "01100", "01100", "01000"],
  "'": ["01100", "01100", "01000", "00000", "00000", "00000", "00000"],
  ":": ["00000", "01100", "01100", "00000", "01100", "01100", "00000"],
  "&": ["01100", "10010", "10100", "01000", "10101", "10010", "01101"],
  "0": ["01110", "10001", "10011", "10101", "11001", "10001", "01110"],
  "1": ["00100", "01100", "00100", "00100", "00100", "00100", "01110"],
  "2": ["01110", "10001", "00001", "00010", "00100", "01000", "11111"],
  "3": ["11110", "00001", "00001", "01110", "00001", "00001", "11110"],
  "4": ["00010", "00110", "01010", "10010", "11111", "00010", "00010"],
  "5": ["11111", "10000", "10000", "11110", "00001", "00001", "11110"],
  "6": ["01110", "10000", "10000", "11110", "10001", "10001", "01110"],
  "7": ["11111", "00001", "00010", "00100", "01000", "01000", "01000"],
  "8": ["01110", "10001", "10001", "01110", "10001", "10001", "01110"],
  "9": ["01110", "10001", "10001", "01111", "00001", "00001", "01110"],
  A: ["01110", "10001", "10001", "11111", "10001", "10001", "10001"],
  B: ["11110", "10001", "10001", "11110", "10001", "10001", "11110"],
  C: ["01110", "10001", "10000", "10000", "10000", "10001", "01110"],
  D: ["11110", "10001", "10001", "10001", "10001", "10001", "11110"],
  E: ["11111", "10000", "10000", "11110", "10000", "10000", "11111"],
  F: ["11111", "10000", "10000", "11110", "10000", "10000", "10000"],
  G: ["01110", "10001", "10000", "10111", "10001", "10001", "01110"],
  H: ["10001", "10001", "10001", "11111", "10001", "10001", "10001"],
  I: ["01110", "00100", "00100", "00100", "00100", "00100", "01110"],
  J: ["00111", "00010", "00010", "00010", "10010", "10010", "01100"],
  K: ["10001", "10010", "10100", "11000", "10100", "10010", "10001"],
  L: ["10000", "10000", "10000", "10000", "10000", "10000", "11111"],
  M: ["10001", "11011", "10101", "10101", "10001", "10001", "10001"],
  N: ["10001", "11001", "10101", "10011", "10001", "10001", "10001"],
  O: ["01110", "10001", "10001", "10001", "10001", "10001", "01110"],
  P: ["11110", "10001", "10001", "11110", "10000", "10000", "10000"],
  Q: ["01110", "10001", "10001", "10001", "10101", "10010", "01101"],
  R: ["11110", "10001", "10001", "11110", "10100", "10010", "10001"],
  S: ["01111", "10000", "10000", "01110", "00001", "00001", "11110"],
  T: ["11111", "00100", "00100", "00100", "00100", "00100", "00100"],
  U: ["10001", "10001", "10001", "10001", "10001", "10001", "01110"],
  V: ["10001", "10001", "10001", "10001", "10001", "01010", "00100"],
  W: ["10001", "10001", "10001", "10101", "10101", "10101", "01010"],
  X: ["10001", "10001", "01010", "00100", "01010", "10001", "10001"],
  Y: ["10001", "10001", "01010", "00100", "00100", "00100", "00100"],
  Z: ["11111", "00001", "00010", "00100", "01000", "10000", "11111"],
};

function crc32(buf) {
  let c = ~0;
  for (let i = 0; i < buf.length; i++) {
    c ^= buf[i];
    for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1));
  }
  return ~c >>> 0;
}
function chunk(type, data) {
  const t = Buffer.from(type);
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length, 0);
  const body = Buffer.concat([t, data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(body), 0);
  return Buffer.concat([len, body, crc]);
}
function ascii(s) {
  return String(s || "").normalize("NFKD").replace(/[\u0300-\u036f]/g, "").replace(/&/g, " and ").replace(/[^A-Za-z0-9 .,'\-:&]/g, " ").replace(/\s+/g, " ").trim();
}
function wrap(text, maxChars) {
  const words = ascii(text).split(" ").filter(Boolean);
  const lines = [];
  let line = "";
  for (const w of words) {
    const next = line ? line + " " + w : w;
    if (next.length > maxChars && line) { lines.push(line); line = w; }
    else line = next;
  }
  if (line) lines.push(line);
  return lines.slice(0, 3);
}
function drawText(set, text, x, y, scale, rgb) {
  let cx = x;
  const gap = scale;
  for (const ch of text) {
    const g = G[ch] || G[ch.toUpperCase()];
    if (!g) { cx += 6 * scale; continue; }
    for (let row = 0; row < 7; row++) {
      for (let col = 0; col < 5; col++) {
        if (g[row][col] !== "1") continue;
        for (let dy = 0; dy < scale; dy++) for (let dx = 0; dx < scale; dx++) set(cx + col * scale + dx, y + row * scale + dy, rgb);
      }
    }
    cx += 5 * scale + gap;
  }
}
function cardPng({ kicker, title, line }) {
  const raw = Buffer.alloc((W * 4 + 1) * H);
  const set = (x, y, rgb) => {
    if (x < 0 || y < 0 || x >= W || y >= H) return;
    const i = y * (W * 4 + 1) + 1 + x * 4;
    raw[i] = rgb[0]; raw[i + 1] = rgb[1]; raw[i + 2] = rgb[2]; raw[i + 3] = 255;
  };
  for (let y = 0; y < H; y++) {
    raw[y * (W * 4 + 1)] = 0;
    for (let x = 0; x < W; x++) set(x, y, [0, 0, 0]);
  }
  for (let y = 0; y < H; y++) for (let x = 0; x < 18; x++) set(x, y, [29, 155, 240]);
  const ink = [231, 233, 234], mute = [113, 118, 123], blue = [29, 155, 240];
  drawText(set, ascii(kicker).toUpperCase(), 72, 150, 4, blue);
  const titleLines = wrap(title, 22);
  const titleScale = titleLines.some((l) => l.length > 18) ? 7 : 9;
  titleLines.forEach((l, i) => drawText(set, l, 72, 210 + i * (titleScale * 8 + 8), titleScale, ink));
  const subY = 210 + titleLines.length * (titleScale * 8 + 8) + 16;
  wrap(line, 52).slice(0, 2).forEach((l, i) => drawText(set, l, 72, subY + i * 36, 3, mute));
  drawText(set, "grokbotshelf.com", 72, 560, 4, ink);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(W, 0); ihdr.writeUInt32BE(H, 4); ihdr[8] = 8; ihdr[9] = 6;
  const idat = zlib.deflateSync(raw, { level: 9 });
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk("IHDR", ihdr),
    chunk("IDAT", idat),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

module.exports = { cardPng, ascii };
