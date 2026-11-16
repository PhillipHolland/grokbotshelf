// Talks to the score API in api/. Every call fails quietly and returns null:
// the game has to work offline and on the plain Vite dev server, which has no
// /api. Use `vercel dev` to run the game with the API.
import type { Ranks, Stats } from '../score-types';

const NAME = 'shelf-run-name';
export const savedName = () => localStorage.getItem(NAME) ?? '';
export const saveName = (name: string) => localStorage.setItem(NAME, name);

interface Reply<T> {
  ok: boolean;
  status: number;
  data: T & { error?: string };
}

async function call<T>(path: string, data?: unknown): Promise<Reply<T> | null> {
  try {
    const res = await fetch(path, data === undefined ? undefined : { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(data) });
    if (!(res.headers.get('content-type') ?? '').includes('json')) return null;
    return { ok: res.ok, status: res.status, data: await res.json() };
  } catch {
    return null;
  }
}

export interface RunResult {
  score: number;
  t: number;
  dist: number;
  grabbed: number;
  shelves: number;
  close: number;
  likes: number;
  bots: string[];
}

export type Finish = { ranks: Ranks } | { claim: string; wouldRank: { all: number; today: number }; nameError?: string };

let started: Promise<string | null> = Promise.resolve(null);

export function runStarted() {
  started = call<{ id: string }>('/api/start', {}).then((r) => (r?.ok ? r.data.id : null));
}

export async function runEnded(result: RunResult): Promise<Finish | null> {
  // reset before awaiting, so a run started meanwhile keeps its own id
  const pending = started;
  started = Promise.resolve(null);
  const id = await pending;
  if (!id) return null;
  const r = await call<Finish>('/api/finish', { id, ...result, name: savedName() || undefined });
  return r?.ok ? r.data : null;
}

// Puts an unnamed run on the board. Returns the ranks, or an error to show.
export async function claimName(claim: string, name: string): Promise<{ ranks?: Ranks; error?: string }> {
  const r = await call<{ ranks: Ranks }>('/api/name', { claim, name });
  if (!r) return { error: "Couldn't reach the leaderboard." };
  if (r.ok) return { ranks: r.data.ranks };
  if (r.status === 400) return { error: "That name isn't allowed. Try another." };
  return { error: 'This run can no longer take a name.' };
}

export async function stats(): Promise<Stats | null> {
  const r = await call<Stats>('/api/stats');
  return r?.ok ? r.data : null;
}
