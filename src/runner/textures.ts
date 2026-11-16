// Canvas-made textures for the Shelf Run aisle. Nothing is downloaded.

const SANS = '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif';

function canvas(w: number, h: number) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return [c, c.getContext('2d')!] as const;
}

// Seeded random, so the aisle looks the same every run.
export function rng(seed: number) {
  let s = seed >>> 0 || 1;
  return () => {
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    return (s >>> 0) / 4294967296;
  };
}

// Floor: dark polished tiles with lane dashes. One canvas covers 3.6 lanes
// across and 3.6 lanes along the aisle, and repeats along it.
export const FLOOR_W = 3.6;
export function floorTex() {
  const S = 1024;
  const [c, g] = canvas(S, S);
  g.fillStyle = '#0d1117';
  g.fillRect(0, 0, S, S);
  const r = rng(3);
  // tile seams
  const tiles = 4;
  const tw = S / tiles;
  for (let i = 0; i < tiles; i++)
    for (let j = 0; j < tiles; j++) {
      const v = 13 + Math.floor(r() * 5);
      g.fillStyle = `rgb(${v},${v + 3},${v + 8})`;
      g.fillRect(i * tw + 2, j * tw + 2, tw - 4, tw - 4);
    }
  // faint scuffs
  for (let i = 0; i < 260; i++) {
    g.fillStyle = `rgba(255,255,255,${0.01 + r() * 0.025})`;
    const w = 6 + r() * 40;
    g.fillRect(r() * S, r() * S, w, 1 + r() * 2);
  }
  // lane dashes at x = -0.5 and 0.5
  for (const lx of [-0.5, 0.5]) {
    const u = ((lx + FLOOR_W / 2) / FLOOR_W) * S;
    g.fillStyle = 'rgba(200,220,255,0.28)';
    g.fillRect(u - 4, S * 0.1, 8, S * 0.4);
  }
  // edge lines near the shelves
  for (const lx of [-1.55, 1.55]) {
    const u = ((lx + FLOOR_W / 2) / FLOOR_W) * S;
    g.fillStyle = 'rgba(255,212,0,0.35)';
    g.fillRect(u - 5, 0, 10, S);
  }
  return c;
}

export function cardboardTex() {
  const [c, g] = canvas(256, 256);
  const grad = g.createLinearGradient(0, 0, 256, 256);
  grad.addColorStop(0, '#c99a62');
  grad.addColorStop(1, '#a87a45');
  g.fillStyle = grad;
  g.fillRect(0, 0, 256, 256);
  const r = rng(11);
  for (let i = 0; i < 900; i++) {
    g.fillStyle = `rgba(80,50,20,${r() * 0.08})`;
    g.fillRect(r() * 256, r() * 256, 2, 2);
  }
  // tape
  g.fillStyle = 'rgba(232,214,170,0.9)';
  g.fillRect(110, 0, 36, 256);
  // label
  g.fillStyle = '#f4ead6';
  g.fillRect(24, 150, 70, 46);
  g.fillStyle = '#b3261e';
  g.font = `900 15px ${SANS}`;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText('FRAGILE', 59, 164);
  g.fillText('▲ ▲', 59, 184);
  return c;
}

// Striped barrier panel with a sign plate. The default is the yellow
// RESTOCKING wall; other zones pass their own colors and words.
export function hazardTex(text = 'RESTOCKING', stripe = '#ffcc00', ink = '#111418', plate = '#fff') {
  const [c, g] = canvas(512, 512);
  g.fillStyle = stripe;
  g.fillRect(0, 0, 512, 512);
  g.fillStyle = ink;
  for (let i = -8; i < 12; i++) {
    g.beginPath();
    g.moveTo(i * 80, 512);
    g.lineTo(i * 80 + 40, 512);
    g.lineTo(i * 80 + 40 + 512, 0);
    g.lineTo(i * 80 + 512, 0);
    g.closePath();
    g.fill();
  }
  // sign plate
  g.fillStyle = plate;
  g.beginPath();
  g.roundRect(36, 150, 440, 120, 18);
  g.fill();
  g.strokeStyle = ink;
  g.lineWidth = 8;
  g.stroke();
  g.fillStyle = ink;
  g.font = `900 64px ${SANS}`;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(text, 256, 213, 410);
  return c;
}

// Wood planks running along u. Used for forest shelves, crates and signs.
export function woodTex(seed = 5, base = '#6b4426', dark = '#3e2513', light = '#9a6a3c', planks = 4) {
  const S = 512;
  const [c, g] = canvas(S, S);
  const r = rng(seed);
  const ph = S / planks;
  for (let p = 0; p < planks; p++) {
    const y0 = p * ph;
    const grad = g.createLinearGradient(0, y0, 0, y0 + ph);
    grad.addColorStop(0, light);
    grad.addColorStop(0.5, base);
    grad.addColorStop(1, dark);
    g.fillStyle = grad;
    g.globalAlpha = 0.85 + r() * 0.15;
    g.fillRect(0, y0, S, ph);
    g.globalAlpha = 1;
    // grain
    for (let i = 0; i < 26; i++) {
      g.strokeStyle = `rgba(40,22,8,${0.12 + r() * 0.2})`;
      g.lineWidth = 1 + r() * 2;
      g.beginPath();
      const y = y0 + r() * ph;
      g.moveTo(0, y);
      for (let x = 0; x <= S; x += 32) g.lineTo(x, y + Math.sin(x * 0.02 + i) * (2 + r() * 3));
      g.stroke();
    }
    // a knot or two
    for (let k = 0; k < 2; k++) {
      if (r() < 0.5) continue;
      g.fillStyle = 'rgba(40,20,6,0.55)';
      g.beginPath();
      g.ellipse(r() * S, y0 + ph * (0.3 + r() * 0.4), 9 + r() * 8, 4 + r() * 3, 0, 0, Math.PI * 2);
      g.fill();
    }
    // seam
    g.fillStyle = 'rgba(20,10,2,0.8)';
    g.fillRect(0, y0, S, 3);
  }
  return c;
}

// Brushed metal, mid gray. Materials tint it: dark for the store, white for orbit.
export function metalTex() {
  const S = 256;
  const [c, g] = canvas(S, S);
  g.fillStyle = '#b8bec6';
  g.fillRect(0, 0, S, S);
  const r = rng(21);
  for (let i = 0; i < 500; i++) {
    const v = 150 + Math.floor(r() * 90);
    g.fillStyle = `rgba(${v},${v + 4},${v + 10},0.35)`;
    g.fillRect(0, r() * S, S, 1);
  }
  return c;
}

// Forest floor: a packed dirt path with moss toward the shelves and pebble lane marks.
export function forestFloorTex() {
  const S = 1024;
  const [c, g] = canvas(S, S);
  g.fillStyle = '#2a2014';
  g.fillRect(0, 0, S, S);
  const r = rng(8);
  for (let i = 0; i < 2600; i++) {
    const v = r();
    g.fillStyle = v < 0.5 ? `rgba(70,52,30,${0.2 + r() * 0.3})` : `rgba(18,12,6,${0.2 + r() * 0.3})`;
    const w = 3 + r() * 14;
    g.fillRect(r() * S, r() * S, w, w * (0.4 + r() * 0.6));
  }
  // moss along both edges
  for (const side of [0, 1]) {
    const grad = g.createLinearGradient(side ? S : 0, 0, side ? S * 0.78 : S * 0.22, 0);
    grad.addColorStop(0, 'rgba(46,92,40,0.95)');
    grad.addColorStop(1, 'rgba(46,92,40,0)');
    g.fillStyle = grad;
    g.fillRect(side ? S * 0.78 : 0, 0, S * 0.22, S);
  }
  for (let i = 0; i < 900; i++) {
    const x = r() < 0.5 ? r() * S * 0.2 : S - r() * S * 0.2;
    g.fillStyle = `rgba(${70 + r() * 50},${120 + r() * 60},${50 + r() * 30},${0.3 + r() * 0.4})`;
    g.fillRect(x, r() * S, 2 + r() * 4, 2 + r() * 6);
  }
  // pebbles marking the lanes
  for (const lx of [-0.5, 0.5]) {
    const u = ((lx + FLOOR_W / 2) / FLOOR_W) * S;
    for (let y = 20; y < S; y += 46) {
      g.fillStyle = `rgba(${150 + r() * 40},${140 + r() * 30},${120 + r() * 30},0.55)`;
      g.beginPath();
      g.ellipse(u + (r() - 0.5) * 8, y + r() * 10, 6 + r() * 4, 4 + r() * 3, r(), 0, Math.PI * 2);
      g.fill();
    }
  }
  return c;
}

// Orbit floor: bright deck plates with cyan lane lines.
export function orbitFloorTex() {
  const S = 1024;
  const [c, g] = canvas(S, S);
  g.fillStyle = '#1a1d2a';
  g.fillRect(0, 0, S, S);
  const r = rng(13);
  const tiles = 4;
  const tw = S / tiles;
  for (let i = 0; i < tiles; i++)
    for (let j = 0; j < tiles; j++) {
      const v = 34 + Math.floor(r() * 8);
      g.fillStyle = `rgb(${v},${v + 2},${v + 12})`;
      g.fillRect(i * tw + 3, j * tw + 3, tw - 6, tw - 6);
      // rivets
      g.fillStyle = 'rgba(160,170,210,0.35)';
      for (const [dx, dy] of [[14, 14], [tw - 14, 14], [14, tw - 14], [tw - 14, tw - 14]]) {
        g.beginPath();
        g.arc(i * tw + dx, j * tw + dy, 4, 0, Math.PI * 2);
        g.fill();
      }
    }
  for (const lx of [-0.5, 0.5]) {
    const u = ((lx + FLOOR_W / 2) / FLOOR_W) * S;
    g.fillStyle = 'rgba(80,230,255,0.75)';
    g.fillRect(u - 3, 0, 6, S * 0.45);
    g.fillRect(u - 3, S * 0.55, 6, S * 0.45);
  }
  for (const lx of [-1.55, 1.55]) {
    const u = ((lx + FLOOR_W / 2) / FLOOR_W) * S;
    g.fillStyle = 'rgba(190,120,255,0.6)';
    g.fillRect(u - 5, 0, 10, S);
  }
  return c;
}

// Metal cargo crate for orbit boxes.
export function cargoTex() {
  const [c, g] = canvas(256, 256);
  g.fillStyle = '#c8ced8';
  g.fillRect(0, 0, 256, 256);
  g.fillStyle = '#9aa3b2';
  for (let i = 0; i < 5; i++) g.fillRect(0, 20 + i * 50, 256, 10);
  g.fillStyle = '#ff7a1a';
  g.fillRect(0, 0, 256, 18);
  g.fillRect(0, 238, 256, 18);
  g.fillStyle = '#1b1e28';
  g.font = `900 30px ${SANS}`;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText('CARGO', 128, 128);
  return c;
}

// The crossbar you slide under. Each zone has its own: a SALE banner, a
// mossy branch, a laser.
export function barTex(kind: 'sale' | 'branch' | 'laser') {
  const [c, g] = canvas(512, 128);
  if (kind === 'sale') {
    g.fillStyle = '#e8243c';
    g.fillRect(0, 0, 512, 128);
    g.fillStyle = '#fff';
    for (let x = 0; x < 512; x += 64) g.fillRect(x, 0, 32, 10), g.fillRect(x + 32, 118, 32, 10);
    g.font = `900 72px ${SANS}`;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText('SALE ▼ DUCK', 256, 66, 480);
  } else if (kind === 'branch') {
    const grad = g.createLinearGradient(0, 0, 0, 128);
    grad.addColorStop(0, '#6e4a2a');
    grad.addColorStop(0.5, '#4a301a');
    grad.addColorStop(1, '#2a1a0c');
    g.fillStyle = grad;
    g.fillRect(0, 0, 512, 128);
    const r = rng(4);
    for (let i = 0; i < 40; i++) {
      g.strokeStyle = `rgba(20,10,4,${0.3 + r() * 0.3})`;
      g.lineWidth = 2 + r() * 3;
      g.beginPath();
      const y = r() * 128;
      g.moveTo(0, y);
      g.bezierCurveTo(170, y + (r() - 0.5) * 20, 340, y + (r() - 0.5) * 20, 512, y);
      g.stroke();
    }
    for (let i = 0; i < 260; i++) {
      g.fillStyle = `rgba(${60 + r() * 50},${120 + r() * 70},${40 + r() * 30},${0.6 + r() * 0.4})`;
      g.fillRect(r() * 512, r() * 36, 3 + r() * 6, 3 + r() * 6);
    }
  } else {
    const grad = g.createLinearGradient(0, 0, 0, 128);
    grad.addColorStop(0, 'rgba(255,40,80,0)');
    grad.addColorStop(0.35, '#ff3a5c');
    grad.addColorStop(0.5, '#fff2f4');
    grad.addColorStop(0.65, '#ff3a5c');
    grad.addColorStop(1, 'rgba(255,40,80,0)');
    g.fillStyle = '#000';
    g.fillRect(0, 0, 512, 128);
    g.fillStyle = grad;
    g.fillRect(0, 0, 512, 128);
  }
  return c;
}

// Stars on black, for the orbit sky behind the racks.
export function starsTex() {
  const S = 1024;
  const [c, g] = canvas(S, S);
  g.fillStyle = '#000';
  g.fillRect(0, 0, S, S);
  const r = rng(77);
  for (let i = 0; i < 1400; i++) {
    const a = r();
    g.fillStyle = `rgba(${200 + r() * 55},${200 + r() * 55},255,${0.2 + a * 0.8})`;
    const s = a > 0.97 ? 2.4 : a > 0.85 ? 1.6 : 1;
    g.fillRect(r() * S, r() * S, s, s);
  }
  // a faint nebula
  for (let i = 0; i < 6; i++) {
    const x = r() * S, y = r() * S, rad = 120 + r() * 220;
    const grad = g.createRadialGradient(x, y, 0, x, y, rad);
    const col = r() < 0.5 ? '140,80,255' : '60,170,255';
    grad.addColorStop(0, `rgba(${col},0.16)`);
    grad.addColorStop(1, `rgba(${col},0)`);
    g.fillStyle = grad;
    g.fillRect(x - rad, y - rad, rad * 2, rad * 2);
  }
  return c;
}

// Drop-ceiling panels for the store: dark tiles, lighter seams, a few vents.
export function ceilingTex() {
  const S = 256;
  const [c, g] = canvas(S, S);
  g.fillStyle = '#0a0e15';
  g.fillRect(0, 0, S, S);
  const r = rng(31);
  const n = 4, t = S / n;
  for (let y = 0; y < n; y++)
    for (let x = 0; x < n; x++) {
      const v = r();
      g.fillStyle = v > 0.9 ? '#05070b' : `rgba(160,190,255,${v * 0.035})`;
      g.fillRect(x * t + 2, y * t + 2, t - 4, t - 4);
      if (v > 0.9) {
        // a vent: thin slats
        g.fillStyle = '#18202c';
        for (let k = 10; k < t - 8; k += 8) g.fillRect(x * t + 10, y * t + k, t - 20, 2);
      }
    }
  g.fillStyle = '#1a2330';
  for (let i = 0; i <= n; i++) {
    g.fillRect(i * t - 1, 0, 2, S);
    g.fillRect(0, i * t - 1, S, 2);
  }
  return c;
}

// A moon for the forest sky: pale disc, a few soft craters, darker on one side.
export function moonTex() {
  const S = 256;
  const [c, g] = canvas(S, S);
  const R = S / 2 - 6;
  g.beginPath();
  g.arc(S / 2, S / 2, R, 0, Math.PI * 2);
  g.clip();
  const grad = g.createRadialGradient(S * 0.4, S * 0.38, 10, S / 2, S / 2, R);
  grad.addColorStop(0, '#fffbe6');
  grad.addColorStop(0.7, '#e9e2bf');
  grad.addColorStop(1, '#a9a785');
  g.fillStyle = grad;
  g.fillRect(0, 0, S, S);
  const r = rng(9);
  for (let i = 0; i < 9; i++) {
    const x = S * (0.2 + r() * 0.6), y = S * (0.2 + r() * 0.6), rad = 8 + r() * 22;
    const cr = g.createRadialGradient(x, y, 0, x, y, rad);
    cr.addColorStop(0, 'rgba(120,118,95,0.38)');
    cr.addColorStop(1, 'rgba(120,118,95,0)');
    g.fillStyle = cr;
    g.fillRect(x - rad, y - rad, rad * 2, rad * 2);
  }
  return c;
}

// Soft round glow, used for halos, sparks and light pools.
export function glowTex() {
  const [c, g] = canvas(128, 128);
  const grad = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.25, 'rgba(255,255,255,0.55)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 128, 128);
  return c;
}

// Neon sign hung over the aisle.
export function signTex(text = 'GROK BOT SHELF', color = '#1d9bf0', fill = '#d8eeff') {
  const [c, g] = canvas(1024, 192);
  g.fillStyle = '#05080d';
  g.beginPath();
  g.roundRect(4, 4, 1016, 184, 30);
  g.fill();
  g.strokeStyle = color;
  g.lineWidth = 8;
  g.stroke();
  g.font = `800 96px ${SANS}`;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.shadowColor = color;
  g.shadowBlur = 24;
  g.fillStyle = fill;
  g.fillText(text, 512, 100, 940);
  return c;
}

// A soft horizontal band: bright in the middle, fading up and down. Used
// for the glow around the neon shelf strips.
export function bandTex() {
  const [c, g] = canvas(4, 128);
  const grad = g.createLinearGradient(0, 0, 0, 128);
  grad.addColorStop(0, 'rgba(255,255,255,0)');
  grad.addColorStop(0.42, 'rgba(255,255,255,0.35)');
  grad.addColorStop(0.5, 'rgba(255,255,255,1)');
  grad.addColorStop(0.58, 'rgba(255,255,255,0.35)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 4, 128);
  return c;
}
