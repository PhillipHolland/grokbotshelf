// localStorage that never throws. Browsers block storage in some setups
// (cookies blocked, some private modes, sandboxed iframes) and reading
// window.localStorage then throws. The game must still boot and play; it just
// forgets the best score, name, mute switch and coaching between visits.

function store(): Storage | null {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}

export function load(key: string): string | null {
  try {
    return store()?.getItem(key) ?? null;
  } catch {
    return null;
  }
}

export function save(key: string, value: string) {
  try {
    store()?.setItem(key, value);
  } catch {
    // full or blocked: keep playing without saving
  }
}

/** Parses a JSON value, falling back when it is missing or broken. */
export function loadJSON<T>(key: string, fallback: T): T {
  const raw = load(key);
  if (raw == null) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}
