import type { JobPosting } from "./types";

export interface DsalJobsPayload {
  ok: true;
  source: string;
  sourceUrl: string;
  note: string;
  fetchedAt: string;
  cached?: boolean;
  cacheAgeMs?: number;
  stats: {
    officialTotalVacancies: number | null;
    officialProfessionCount: number | null;
    returned: number;
  };
  jobs: JobPosting[];
}

/** In-memory cache shared across hot reloads in the same Node process */
type CacheEntry = {
  expiresAt: number;
  payload: DsalJobsPayload;
};

const g = globalThis as unknown as {
  __myeibDsalCache?: Map<string, CacheEntry>;
  __myeibDsalInflight?: Map<string, Promise<DsalJobsPayload>>;
};

function cacheMap() {
  if (!g.__myeibDsalCache) g.__myeibDsalCache = new Map();
  return g.__myeibDsalCache;
}

function inflightMap() {
  if (!g.__myeibDsalInflight) g.__myeibDsalInflight = new Map();
  return g.__myeibDsalInflight;
}

/** Default: serve cached DSAL results for 15 minutes */
export const DSAL_CACHE_TTL_MS = 15 * 60 * 1000;

export function getDsalCache(key: string): DsalJobsPayload | null {
  const entry = cacheMap().get(key);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    cacheMap().delete(key);
    return null;
  }
  return {
    ...entry.payload,
    cached: true,
    cacheAgeMs: Date.now() - (entry.expiresAt - DSAL_CACHE_TTL_MS),
  };
}

export function setDsalCache(key: string, payload: DsalJobsPayload) {
  const m = cacheMap();
  // Bound size — keep last ~16 modes only
  if (m.size >= 16) {
    const first = m.keys().next().value;
    if (first !== undefined) m.delete(first);
  }
  m.set(key, {
    expiresAt: Date.now() + DSAL_CACHE_TTL_MS,
    payload: { ...payload, cached: false },
  });
}

/** Deduplicate concurrent identical requests (one network fan-out). */
export async function withDsalInflight(
  key: string,
  factory: () => Promise<DsalJobsPayload>
): Promise<DsalJobsPayload> {
  const inflight = inflightMap();
  const existing = inflight.get(key);
  if (existing) return existing;

  const promise = factory().finally(() => {
    inflight.delete(key);
  });
  inflight.set(key, promise);
  return promise;
}
