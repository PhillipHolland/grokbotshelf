// The game's browser-side helpers that run without a page: storage and the
// score API client.
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { load, loadJSON, save } from '../src/storage';

class MemoryStorage {
  m = new Map<string, string>();
  getItem(k: string) {
    return this.m.get(k) ?? null;
  }
  setItem(k: string, v: string) {
    this.m.set(k, String(v));
  }
}

function blockedStorage() {
  // what Chrome and Safari do when site data is blocked
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    get() {
      throw new DOMException('The operation is insecure.', 'SecurityError');
    },
  });
}

beforeEach(() => {
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, writable: true, value: new MemoryStorage() });
});

describe('storage', () => {
  it('saves and loads', () => {
    save('k', 'v');
    expect(load('k')).toBe('v');
    expect(load('missing')).toBeNull();
  });

  it('never throws when storage is blocked', () => {
    blockedStorage();
    expect(() => save('k', 'v')).not.toThrow();
    expect(load('k')).toBeNull();
    expect(loadJSON('k', ['x'])).toEqual(['x']);
  });

  it('never throws when storage is full', () => {
    vi.spyOn(MemoryStorage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('full', 'QuotaExceededError');
    });
    expect(() => save('k', 'v')).not.toThrow();
  });

  it('falls back on broken JSON', () => {
    save('j', '{nope');
    expect(loadJSON('j', 5)).toBe(5);
    save('j', '[1,2]');
    expect(loadJSON('j', [])).toEqual([1, 2]);
  });
});

describe('score API client', () => {
  type Net = typeof import('../src/runner/net');
  let net: Net;
  let calls: Array<{ url: string; body: Record<string, unknown> | undefined }>;
  let replies: Record<string, { status: number; body: unknown; type?: string } | 'offline'>;

  beforeEach(async () => {
    vi.resetModules();
    net = await import('../src/runner/net');
    calls = [];
    replies = {};
    vi.stubGlobal('fetch', async (url: string, init?: RequestInit) => {
      calls.push({ url, body: init?.body ? JSON.parse(String(init.body)) : undefined });
      const r = replies[url];
      if (!r || r === 'offline') throw new TypeError('Failed to fetch');
      return new Response(typeof r.body === 'string' ? r.body : JSON.stringify(r.body), {
        status: r.status,
        headers: { 'content-type': r.type ?? 'application/json' },
      });
    });
  });

  const result = { score: 1000, t: 30, dist: 400, grabbed: 4, shelves: 1, close: 0, likes: 5, bots: ['abc'] };

  it('sends the run id from /api/start with the result and the saved name', async () => {
    replies['/api/start'] = { status: 200, body: { id: 'run1' } };
    replies['/api/finish'] = { status: 200, body: { ranks: { all: 3, today: 1, best: 1000 } } };
    net.saveName('Nick');
    net.runStarted();
    const f = await net.runEnded(result);
    expect(f).toEqual({ ranks: { all: 3, today: 1, best: 1000 } });
    expect(calls[1]).toEqual({ url: '/api/finish', body: { id: 'run1', ...result, name: 'Nick' } });
  });

  it('leaves the name out when none is saved', async () => {
    replies['/api/start'] = { status: 200, body: { id: 'run1' } };
    replies['/api/finish'] = { status: 200, body: { claim: 'run1', wouldRank: { all: 1, today: 1 } } };
    net.runStarted();
    await net.runEnded(result);
    expect(calls[1].body).not.toHaveProperty('name');
  });

  it('skips /api/finish when the run never got an id', async () => {
    replies['/api/start'] = 'offline';
    net.runStarted();
    expect(await net.runEnded(result)).toBeNull();
    expect(calls.map((c) => c.url)).toEqual(['/api/start']);
  });

  it('treats the dev server (no JSON) as no leaderboard', async () => {
    replies['/api/start'] = { status: 404, body: '<html></html>', type: 'text/html' };
    net.runStarted();
    expect(await net.runEnded(result)).toBeNull();
  });

  it('uses each run id once, even if a new run starts while the last one ends', async () => {
    replies['/api/start'] = { status: 200, body: { id: 'run1' } };
    replies['/api/finish'] = { status: 200, body: { ranks: { all: 1, today: 1, best: 1 } } };
    net.runStarted();
    await net.runEnded(result);
    expect(await net.runEnded(result)).toBeNull();
    expect(calls.filter((c) => c.url === '/api/finish')).toHaveLength(1);
  });

  it('returns null when /api/finish rejects the run', async () => {
    replies['/api/start'] = { status: 200, body: { id: 'run1' } };
    replies['/api/finish'] = { status: 422, body: { error: 'run rejected: too far' } };
    net.runStarted();
    expect(await net.runEnded(result)).toBeNull();
  });

  it('explains why a name claim failed', async () => {
    replies['/api/name'] = { status: 400, body: { error: 'name not allowed' } };
    expect(await net.claimName('c', 'bad')).toEqual({ error: "That name isn't allowed. Try another." });
    replies['/api/name'] = { status: 404, body: { error: 'gone' } };
    expect(await net.claimName('c', 'ok name')).toEqual({ error: 'This run can no longer take a name.' });
    replies['/api/name'] = 'offline';
    expect(await net.claimName('c', 'ok name')).toEqual({ error: "Couldn't reach the leaderboard." });
    replies['/api/name'] = { status: 200, body: { ranks: { all: 1, today: 1, best: 9 } } };
    expect(await net.claimName('c', 'ok name')).toEqual({ ranks: { all: 1, today: 1, best: 9 } });
  });

  it('fetches stats, or null when they are down', async () => {
    replies['/api/stats'] = { status: 200, body: { at: 1 } };
    expect(await net.stats()).toEqual({ at: 1 });
    replies['/api/stats'] = { status: 503, body: { error: 'down' } };
    expect(await net.stats()).toBeNull();
  });

  it('works with storage blocked', async () => {
    blockedStorage();
    expect(net.savedName()).toBe('');
    expect(() => net.saveName('Nick')).not.toThrow();
  });
});
