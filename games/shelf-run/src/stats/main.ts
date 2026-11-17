// The /stats page: leaderboards, play counts, when people play, and the bots
// and creators that end up on the most shelves. Data comes from /api/stats,
// which the server caches for 2 minutes. This page refreshes every minute.
import '@fontsource-variable/newsreader';
import './style.css';
import raw from '../bots.json';
import type { Stats } from '../score-types';

const $ = <T extends HTMLElement = HTMLElement>(sel: string) => document.querySelector(sel) as T;
const esc = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
const full = (n: number) => Math.round(n).toLocaleString('en-US');
const compact = (n: number) => (n < 10_000 ? full(n) : new Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 1 }).format(n));
const plural = (n: number, one: string, many = `${one}s`) => `${full(n)} ${n === 1 ? one : many}`;

interface RawBot {
  n: string;
  e: string;
  h: string;
  cn: string;
  u: string;
  a: string;
}
const BOTS = raw as RawBot[];
const botById = new Map(BOTS.map((b) => [b.u, b]));
const creatorByKey = new Map<string, RawBot>();
for (const b of BOTS) if (!creatorByKey.has(b.h || b.cn)) creatorByKey.set(b.h || b.cn, b);

let data: Stats | null = null;
let boardTab: 'today' | 'all' = 'today';

// ---------- tooltip ----------

const tip = $('#tip');
function showTip(x: number, y: number, value: string, label: string) {
  tip.replaceChildren();
  const b = document.createElement('b');
  b.textContent = value;
  const s = document.createElement('span');
  s.textContent = label;
  tip.append(b, s);
  tip.hidden = false;
  const w = tip.offsetWidth;
  tip.style.left = `${Math.max(8, Math.min(innerWidth - w - 8, x - w / 2))}px`;
  tip.style.top = `${Math.max(8, y - tip.offsetHeight - 12)}px`;
}
const hideTip = () => (tip.hidden = true);
addEventListener('scroll', hideTip, { passive: true });

// ---------- column chart ----------

interface Col {
  value: number;
  label: string; // full label for the tooltip and table, like "Fri, Nov 6"
  tick: string | null; // short x-axis label, or null to skip
}

function niceStep(max: number) {
  const raw = max / 4;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const norm = raw / mag;
  return (norm <= 1 ? 1 : norm <= 2 ? 2 : norm <= 5 ? 5 : 10) * mag;
}

const SVGNS = 'http://www.w3.org/2000/svg';
function svg<K extends keyof SVGElementTagNameMap>(tag: K, attrs: Record<string, string | number>, parent?: Element) {
  const el = document.createElementNS(SVGNS, tag);
  for (const k in attrs) el.setAttribute(k, String(attrs[k]));
  parent?.append(el);
  return el;
}

// Single-series columns: 4px rounded tops, square at the baseline, hairline
// grid, a hover/focus tooltip per column and a table view underneath.
function columns(host: HTMLElement, cols: Col[], unit: [string, string], tableHead: string) {
  const wasOpen = host.querySelector('details')?.open ?? false; // keep an open table open across refreshes
  host.replaceChildren();
  const max = Math.max(0, ...cols.map((c) => c.value));
  if (!max) {
    host.innerHTML = '<p class="empty">No runs yet.</p>';
    return;
  }
  const W = Math.max(280, host.clientWidth);
  const H = 180;
  const L = 34;
  const R = 4;
  const T = 8;
  const B = 22;
  const step = niceStep(max) || 1;
  const top = Math.ceil(max / step) * step;
  const pw = W - L - R;
  const ph = H - T - B;
  const s = svg('svg', { width: W, height: H, viewBox: `0 0 ${W} ${H}`, role: 'img', 'aria-label': tableHead }, host);
  for (let v = 0; v <= top + 1e-9; v += step) {
    const y = T + ph - (v / top) * ph;
    svg('line', { x1: L, x2: W - R, y1: y, y2: y, class: v === 0 ? 'base' : 'grid' }, s);
    const t = svg('text', { x: L - 6, y: y + 4, class: 'ytick', 'text-anchor': 'end' }, s);
    t.textContent = compact(v);
  }
  const band = pw / cols.length;
  const bw = Math.min(24, Math.max(2, band - 2));
  cols.forEach((c, i) => {
    const x = L + i * band + (band - bw) / 2;
    const h = (c.value / top) * ph;
    const y0 = T + ph;
    if (h > 0) {
      const r = Math.min(4, h, bw / 2);
      svg('path', { class: 'bar', d: `M${x},${y0} V${y0 - h + r} Q${x},${y0 - h} ${x + r},${y0 - h} H${x + bw - r} Q${x + bw},${y0 - h} ${x + bw},${y0 - h + r} V${y0} Z` }, s);
    }
    if (c.tick) {
      const t = svg('text', { x: L + i * band + band / 2, y: H - 6, class: 'xtick', 'text-anchor': 'middle' }, s);
      t.textContent = c.tick;
    }
    // hit target: the whole band, taller than the bar
    const hit = svg('rect', { x: L + i * band, y: T, width: band, height: ph, class: 'hit', tabindex: 0, 'aria-label': `${c.label}: ${plural(c.value, ...unit)}` }, s);
    const show = () => {
      const r = hit.getBoundingClientRect();
      showTip(r.left + r.width / 2, r.top + ph - (c.value / top) * ph, plural(c.value, ...unit), c.label);
    };
    hit.addEventListener('pointerenter', show);
    hit.addEventListener('focus', show);
    hit.addEventListener('pointerleave', hideTip);
    hit.addEventListener('blur', hideTip);
  });
  const det = document.createElement('details');
  det.innerHTML = `<summary>Show as table</summary><table><thead><tr><th>${esc(tableHead)}</th><th>${esc(unit[1][0].toUpperCase() + unit[1].slice(1))}</th></tr></thead><tbody>${cols
    .map((c) => `<tr><td>${esc(c.label)}</td><td>${full(c.value)}</td></tr>`)
    .join('')}</tbody></table>`;
  det.open = wasOpen;
  host.append(det);
}

// ---------- sections ----------

function tiles(s: Stats) {
  const t = s.totals;
  const items: Array<[string, number]> = [
    ['Runs today', t.runsToday],
    ['Players today', t.playersToday],
    ['Runs all time', t.runs],
    ['Players all time', t.players],
    ['Shelves published', t.shelves],
    ['Meters pushed', t.meters],
  ];
  $('#tiles').innerHTML = items.map(([label, v]) => `<div class="tile"><span>${label}</span><b title="${full(v)}">${compact(v)}</b></div>`).join('');
  const live = $('#live');
  live.hidden = !s.live;
  live.textContent = `${full(s.live)} playing now`;
}

function board(s: Stats) {
  const rows = s.board[boardTab];
  $('#board').innerHTML = rows.length
    ? rows.map((r, i) => `<li${i < 3 ? ` class="p${i + 1}"` : ''}><i>${i + 1}</i><span>${esc(r.name)}</span><b>${full(r.score)}</b></li>`).join('')
    : `<li class="empty">${boardTab === 'today' ? 'No named runs yet today. Play one and post your name.' : 'No named runs yet.'}</li>`;
  document.querySelectorAll<HTMLButtonElement>('.tabs button').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.board === boardTab)));
}

const HOUR_FMT = new Intl.DateTimeFormat('en-US', { hour: 'numeric' });
const DAY_FMT = new Intl.DateTimeFormat('en-US', { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC' });
const DAY_TICK = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });

function hours(s: Stats) {
  const sum = Array<number>(24).fill(0);
  for (const h of s.hours) sum[new Date(`${h.hour}:00:00Z`).getHours()] += h.runs;
  const at = (h: number) => {
    const d = new Date();
    d.setHours(h, 0, 0, 0);
    return d;
  };
  const cols = sum.map((value, h) => ({
    value,
    label: `${HOUR_FMT.format(at(h))} to ${HOUR_FMT.format(at((h + 1) % 24))}`,
    tick: h % 6 === 0 ? HOUR_FMT.format(at(h)).replace(' ', '').toLowerCase() : null,
  }));
  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
  $('#hours-note').textContent = `Runs started by hour of day over the last 7 days, in your time zone${tz ? ` (${tz.replace(/_/g, ' ')})` : ''}.`;
  columns($('#hours'), cols, ['run', 'runs'], 'Hour');
}

function days(s: Stats) {
  const n = s.days.length;
  const cols = s.days.map((d, i) => {
    const date = new Date(`${d.day}T00:00:00Z`);
    return { value: d.runs, label: DAY_FMT.format(date), tick: (n - 1 - i) % 7 === 0 ? DAY_TICK.format(date) : null };
  });
  columns($('#days'), cols, ['run', 'runs'], 'Day');
}

function hist(s: Stats) {
  const cols = s.hist.map((b, i) => {
    const next = s.hist[i + 1]?.from;
    return { value: b.runs, label: next ? `${full(b.from)} to ${full(next - 1)}` : `${full(b.from)} and up`, tick: next ? compact(b.from) : `${compact(b.from)}+` };
  });
  columns($('#hist'), cols, ['run', 'runs'], 'Score');
}

const avatar = (b: RawBot | undefined, fallback: string) =>
  b?.a ? `<img src="/avatars/${esc(b.a)}" alt="" loading="lazy">` : `<i class="ph">${esc((fallback.replace(/^@/, '')[0] ?? '?').toUpperCase())}</i>`;

function people(s: Stats) {
  $('#creators').innerHTML = s.creators.length
    ? s.creators
        .map((c) => {
          const b = creatorByKey.get(c.key);
          const who = b?.h ? `<a href="https://x.com/${esc(b.h)}" target="_blank" rel="noopener">@${esc(b.h)}</a>` : `<span>${esc(b?.cn || c.key)}</span>`;
          return `<li>${avatar(b, c.key)}<div>${who}</div><b>${full(c.bots)}</b></li>`;
        })
        .join('')
    : '<li class="empty">No shelves published yet.</li>';
  $('#bots').innerHTML = s.bots.length
    ? s.bots
        .map((x) => {
          const b = botById.get(x.id);
          if (!b) return '';
          return `<li>${avatar(b, b.n)}<div><a href="https://x.ai/bot/${esc(b.u)}" target="_blank" rel="noopener">${esc(b.e)} ${esc(b.n)}</a><small>${esc(b.h ? `@${b.h}` : b.cn)}</small></div><b>${full(x.times)}</b></li>`;
        })
        .join('')
    : '<li class="empty">No shelves published yet.</li>';
}

function ago(ms: number) {
  const s = Math.max(0, Math.round((Date.now() - ms) / 1000));
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86400) return `${Math.floor(s / 3600)} h ago`;
  return `${Math.floor(s / 86400)} d ago`;
}
const dur = (t: number) => (t < 60 ? `${t}s` : `${Math.floor(t / 60)}m ${t % 60}s`);

function recent(s: Stats) {
  $('#recent').innerHTML = s.recent.length
    ? s.recent
        .map(
          (r) =>
            `<li><div><span class="${r.name ? '' : 'anon'}">${esc(r.name ?? 'Someone')}</span><small>${plural(r.shelves, 'shelf', 'shelves')} · ${dur(r.t)} · ${ago(r.at)}</small></div><b>${full(r.score)}</b></li>`,
        )
        .join('')
    : '<li class="empty">No runs yet.</li>';
}

function render() {
  if (!data) return;
  tiles(data);
  board(data);
  hours(data);
  days(data);
  hist(data);
  people(data);
  recent(data);
  const t = data.totals;
  $('#foot').textContent =
    `Updated ${new Date(data.at).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}. Player counts are estimates and never store IP addresses.` +
    (t.rejected ? ` The cheat checks threw out ${plural(t.rejected, 'run')}.` : '');
}

// One failed request shouldn't strand the page, so a first load that fails
// retries after 2, 5 and 10 seconds before it says so. A render error is
// reported as itself, not as a network problem.
let tries = 0;
async function load() {
  let next: Stats;
  try {
    const res = await fetch('/api/stats', { cache: 'no-store' });
    if (!res.ok || !(res.headers.get('content-type') ?? '').includes('json')) throw new Error(String(res.status));
    next = (await res.json()) as Stats;
  } catch {
    if (data) return; // keep showing the last good answer
    const wait = [2, 5, 10][tries++];
    if (wait) {
      $('#status').textContent = 'Loading…';
      setTimeout(() => void load(), wait * 1000);
    } else {
      $('#status').innerHTML = `Couldn't load the stats. <button type="button" id="retry">Try again</button>`;
      $('#retry').onclick = () => {
        tries = 0;
        $('#status').textContent = 'Loading…';
        void load();
      };
    }
    return;
  }
  tries = 0;
  data = next;
  $('#status').hidden = true;
  $('#content').hidden = false;
  render();
}

document.querySelectorAll<HTMLButtonElement>('.tabs button').forEach((b) => {
  b.onclick = () => {
    boardTab = b.dataset.board === 'all' ? 'all' : 'today';
    if (data) board(data);
  };
});
let resizeTimer = 0;
addEventListener('resize', () => {
  clearTimeout(resizeTimer);
  resizeTimer = window.setTimeout(() => {
    if (!data) return;
    hours(data);
    days(data);
    hist(data);
  }, 150);
});
void load();
setInterval(() => {
  if (!document.hidden) void load();
}, 60_000);
