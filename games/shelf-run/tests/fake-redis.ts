// An in-memory stand-in for the parts of @upstash/redis the score API uses.
// API tests swap it in with vi.mock('@upstash/redis'), so they run the real
// handlers end to end with no network and no database.
//
// It follows Upstash's behaviour where the API depends on it: values are
// stored as JSON and parsed back, pipelines answer with an array in call
// order, and zrange withScores answers a flat [member, score, ...] list.
// If you call a new Redis command from api/, add it here (the tests fail with
// "fake redis: no command X" until you do).

interface Values {
  str: string;
  hash: Map<string, string>;
  zset: Map<string, number>;
  list: string[];
  hll: Set<string>;
}
type Kind = keyof Values;
type Entry = { [K in Kind]: { kind: K; v: Values[K] } }[Kind];

const enc = (v: unknown) => (typeof v === 'string' ? v : JSON.stringify(v));
function dec(v: string | undefined | null): unknown {
  if (v == null) return null;
  try {
    return JSON.parse(v);
  } catch {
    return v;
  }
}

function bound(v: number | string) {
  const s = String(v);
  if (s === '-inf') return { n: -Infinity, open: false };
  if (s === '+inf') return { n: Infinity, open: false };
  if (s.startsWith('(')) return { n: Number(s.slice(1)), open: true };
  return { n: Number(s), open: false };
}
function inRange(score: number, min: number | string, max: number | string) {
  const a = bound(min);
  const b = bound(max);
  return (a.open ? score > a.n : score >= a.n) && (b.open ? score < b.n : score <= b.n);
}
const sliceEnd = (len: number, stop: number) => (stop < 0 ? len + stop + 1 : stop + 1);

export class FakeRedis {
  data = new Map<string, Entry>();
  expiry = new Map<string, number>();
  /** Every command run, in order, for tests that check what was written. */
  log: string[] = [];
  /** The clock used for expiry. Tests can move it. */
  now = () => Date.now();

  reset() {
    this.data.clear();
    this.expiry.clear();
    this.log = [];
    this.now = () => Date.now();
  }

  private live(key: string) {
    const at = this.expiry.get(key);
    if (at !== undefined && at <= this.now()) {
      this.data.delete(key);
      this.expiry.delete(key);
    }
    return this.data.get(key);
  }
  private of<K extends Kind>(key: string, kind: K, create = true): Values[K] | undefined {
    const e = this.live(key);
    if (e) {
      if (e.kind !== kind) throw new Error(`WRONGTYPE ${key} is a ${e.kind}, not a ${kind}`);
      return e.v as Values[K];
    }
    if (!create) return undefined;
    const fresh = { str: '', hash: new Map(), zset: new Map(), list: [], hll: new Set() }[kind];
    this.data.set(key, { kind, v: fresh } as Entry);
    return fresh as Values[K];
  }

  // ---- keys and strings ----
  async get<T>(key: string) {
    const e = this.live(key);
    return (e?.kind === 'str' ? dec(e.v) : null) as T | null;
  }
  async getdel<T>(key: string) {
    const v = await this.get<T>(key);
    this.data.delete(key);
    this.expiry.delete(key);
    return v;
  }
  async set(key: string, value: unknown, opts?: { ex?: number }) {
    this.data.set(key, { kind: 'str', v: enc(value) });
    if (opts?.ex) this.expiry.set(key, this.now() + opts.ex * 1000);
    else this.expiry.delete(key);
    return 'OK';
  }
  async del(...keys: string[]) {
    let n = 0;
    for (const k of keys) if (this.data.delete(k)) n++;
    return n;
  }
  async incr(key: string) {
    const e = this.live(key);
    const n = (e?.kind === 'str' ? Number(e.v) : 0) + 1;
    this.data.set(key, { kind: 'str', v: String(n) });
    return n;
  }
  async expire(key: string, seconds: number) {
    if (!this.live(key)) return 0;
    this.expiry.set(key, this.now() + seconds * 1000);
    return 1;
  }
  /** Seconds left on a key, like TTL: -1 with no expiry, -2 when missing. */
  ttl(key: string) {
    if (!this.live(key)) return -2;
    const at = this.expiry.get(key);
    return at === undefined ? -1 : Math.ceil((at - this.now()) / 1000);
  }

  // ---- hashes ----
  async hincrby(key: string, field: string, by: number) {
    const h = this.of(key, 'hash')!;
    const n = Number(h.get(field) ?? 0) + by;
    h.set(field, String(n));
    return n;
  }
  async hset(key: string, fields: Record<string, unknown>) {
    const h = this.of(key, 'hash')!;
    for (const [f, v] of Object.entries(fields)) h.set(f, enc(v));
    return Object.keys(fields).length;
  }
  async hgetall(key: string) {
    const h = this.of(key, 'hash', false);
    if (!h || !h.size) return null;
    return Object.fromEntries([...h].map(([f, v]) => [f, dec(v)]));
  }
  async hmget(key: string, ...fields: string[]) {
    const h = this.of(key, 'hash', false);
    if (!h) return null;
    return Object.fromEntries(fields.map((f) => [f, dec(h.get(f))]));
  }
  async hdel(key: string, ...fields: string[]) {
    const h = this.of(key, 'hash', false);
    let n = 0;
    for (const f of fields) if (h?.delete(f)) n++;
    return n;
  }

  // ---- sorted sets ----
  async zadd(key: string, ...args: unknown[]) {
    const opts = args.length > 1 && !('member' in (args[0] as object)) ? (args.shift() as { gt?: boolean }) : {};
    const z = this.of(key, 'zset')!;
    let added = 0;
    for (const { score, member } of args as Array<{ score: number; member: unknown }>) {
      const m = enc(member);
      const old = z.get(m);
      if (old === undefined) added++;
      if (opts.gt && old !== undefined && score <= old) continue;
      z.set(m, score);
    }
    return added;
  }
  async zincrby(key: string, by: number, member: string) {
    const z = this.of(key, 'zset')!;
    const n = (z.get(member) ?? 0) + by;
    z.set(member, n);
    return n;
  }
  async zrem(key: string, ...members: string[]) {
    const z = this.of(key, 'zset', false);
    let n = 0;
    for (const m of members) if (z?.delete(m)) n++;
    return n;
  }
  async zcard(key: string) {
    return this.of(key, 'zset', false)?.size ?? 0;
  }
  async zscore(key: string, member: string) {
    return this.of(key, 'zset', false)?.get(member) ?? null;
  }
  private sorted(key: string, rev: boolean) {
    const z = this.of(key, 'zset', false) ?? new Map<string, number>();
    const rows = [...z].sort((a, b) => a[1] - b[1] || (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));
    return rev ? rows.reverse() : rows;
  }
  async zrevrank(key: string, member: string) {
    const i = this.sorted(key, true).findIndex(([m]) => m === member);
    return i < 0 ? null : i;
  }
  async zrange(key: string, start: number, stop: number, opts?: { rev?: boolean; withScores?: boolean }) {
    const rows = this.sorted(key, !!opts?.rev);
    const out = rows.slice(start, sliceEnd(rows.length, stop));
    return opts?.withScores ? out.flatMap(([m, s]) => [dec(m), s]) : out.map(([m]) => dec(m));
  }
  async zcount(key: string, min: number | string, max: number | string) {
    return this.sorted(key, false).filter(([, s]) => inRange(s, min, max)).length;
  }
  async zremrangebyscore(key: string, min: number | string, max: number | string) {
    const z = this.of(key, 'zset', false);
    if (!z) return 0;
    let n = 0;
    for (const [m, s] of [...z]) {
      if (!inRange(s, min, max)) continue;
      z.delete(m);
      n++;
    }
    return n;
  }

  // ---- lists ----
  async lpush(key: string, ...values: unknown[]) {
    const l = this.of(key, 'list')!;
    for (const v of values) l.unshift(enc(v));
    return l.length;
  }
  async ltrim(key: string, start: number, stop: number) {
    const l = this.of(key, 'list', false);
    if (l) l.splice(0, l.length, ...l.slice(start, sliceEnd(l.length, stop)));
    return 'OK';
  }
  async lrange(key: string, start: number, stop: number) {
    const l = this.of(key, 'list', false) ?? [];
    return l.slice(start, sliceEnd(l.length, stop)).map(dec);
  }

  // ---- HyperLogLog (exact here) ----
  async pfadd(key: string, ...items: string[]) {
    const s = this.of(key, 'hll')!;
    const before = s.size;
    for (const i of items) s.add(i);
    return s.size > before ? 1 : 0;
  }
  async pfcount(key: string) {
    return this.of(key, 'hll', false)?.size ?? 0;
  }

  // ---- pipelines ----
  pipeline() {
    const calls: Array<() => Promise<unknown>> = [];
    const self = this as unknown as Record<string, unknown>;
    const target: Record<string, unknown> = {
      exec: async () => {
        const out: unknown[] = [];
        for (const c of calls) out.push(await c());
        return out;
      },
    };
    const proxy: Record<string, unknown> = new Proxy(target, {
      get: (t, prop: string) => {
        if (prop in t) return t[prop];
        const fn = self[prop];
        if (typeof fn !== 'function' || prop === 'pipeline') throw new Error(`fake redis: no command ${prop}`);
        return (...args: unknown[]) => {
          calls.push(() => {
            this.log.push(prop);
            return (fn as (...a: unknown[]) => Promise<unknown>).apply(this, args);
          });
          return proxy;
        };
      },
    });
    return proxy;
  }
}

/** The one instance every API module gets from Redis.fromEnv() in tests. */
export const fakeRedis = new FakeRedis();
