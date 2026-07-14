/**
 * Bounded in-memory cache + inflight dedupe for serverless/Node.
 * Prevents unbounded Map growth across hot reloads / long-lived processes.
 */

type Entry<T> = { expiresAt: number; value: T };

export function createBoundedCache<T>(opts?: {
  maxEntries?: number;
  name?: string;
}) {
  const maxEntries = opts?.maxEntries ?? 24;
  const g = globalThis as unknown as Record<string, Map<string, Entry<T>> | undefined>;
  const key = `__joob_cache_${opts?.name || "default"}`;

  function map(): Map<string, Entry<T>> {
    if (!g[key]) g[key] = new Map();
    return g[key] as Map<string, Entry<T>>;
  }

  function prune(m: Map<string, Entry<T>>) {
    const now = Date.now();
    for (const [k, v] of m) {
      if (v.expiresAt <= now) m.delete(k);
    }
    while (m.size > maxEntries) {
      const first = m.keys().next().value;
      if (first === undefined) break;
      m.delete(first);
    }
  }

  return {
    get(k: string): T | null {
      const m = map();
      const e = m.get(k);
      if (!e) return null;
      if (Date.now() > e.expiresAt) {
        m.delete(k);
        return null;
      }
      // refresh LRU-ish: re-insert
      m.delete(k);
      m.set(k, e);
      return e.value;
    },
    set(k: string, value: T, ttlMs: number) {
      const m = map();
      m.delete(k);
      m.set(k, { expiresAt: Date.now() + ttlMs, value });
      prune(m);
    },
    delete(k: string) {
      map().delete(k);
    },
  };
}

export function createInflightMap<T>(name = "default") {
  const g = globalThis as unknown as Record<
    string,
    Map<string, Promise<T>> | undefined
  >;
  const storeKey = `__joob_inflight_${name}`;
  if (!g[storeKey]) g[storeKey] = new Map();
  return {
    async run(key: string, factory: () => Promise<T>): Promise<T> {
      const m = g[storeKey] as Map<string, Promise<T>>;
      const existing = m.get(key);
      if (existing) return existing;
      const p = factory().finally(() => m.delete(key));
      m.set(key, p);
      return p;
    },
  };
}

/** fetch with abort timeout (browser + node 18+) */
export async function fetchWithTimeout(
  input: RequestInfo | URL,
  init: RequestInit & { timeoutMs?: number } = {}
): Promise<Response> {
  const { timeoutMs = 25_000, ...rest } = init;
  const controller = new AbortController();
  const outer = rest.signal;
  const onAbort = () => controller.abort();
  if (outer) {
    if (outer.aborted) controller.abort();
    else outer.addEventListener("abort", onAbort, { once: true });
  }
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(input, { ...rest, signal: controller.signal });
  } finally {
    clearTimeout(timer);
    if (outer) outer.removeEventListener("abort", onAbort);
  }
}
