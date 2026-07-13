import { NextRequest, NextResponse } from "next/server";
import { fetchHelloJobs, HELLOJOBS_BASE } from "@/lib/hellojobs";
import type { JobPosting } from "@/lib/types";

export const dynamic = "force-dynamic";

interface HelloJobsPayload {
  ok: true;
  source: string;
  sourceUrl: string;
  note: string;
  fetchedAt: string;
  cached?: boolean;
  stats: {
    pagesFetched: number;
    totalOnBoard: number | null;
    returned: number;
  };
  jobs: JobPosting[];
}

type CacheEntry = {
  expiresAt: number;
  payload: HelloJobsPayload;
};

const g = globalThis as unknown as {
  __myeibHelloJobsCache?: Map<string, CacheEntry>;
  __myeibHelloJobsInflight?: Map<string, Promise<HelloJobsPayload>>;
};

const CACHE_TTL_MS = 15 * 60 * 1000; // 15 min

function cacheMap() {
  if (!g.__myeibHelloJobsCache) g.__myeibHelloJobsCache = new Map();
  return g.__myeibHelloJobsCache;
}

function inflightMap() {
  if (!g.__myeibHelloJobsInflight) g.__myeibHelloJobsInflight = new Map();
  return g.__myeibHelloJobsInflight;
}

async function buildPayload(
  maxPages: number,
  maxJobs: number
): Promise<HelloJobsPayload> {
  const result = await fetchHelloJobs({ maxPages, maxJobs });
  return {
    ok: true,
    source: "Hello-Jobs.com",
    sourceUrl: HELLOJOBS_BASE,
    note:
      "Commercial Macau job board (hello-jobs.com / jobsearch). Listings are aggregated from public search results; always apply on the original Hello-Jobs page. Not official DSAL data.",
    fetchedAt: result.fetchedAt,
    cached: false,
    stats: {
      pagesFetched: result.pagesFetched,
      totalOnBoard: result.totalOnBoard,
      returned: result.jobs.length,
    },
    jobs: result.jobs,
  };
}

/**
 * GET /api/hellojobs/jobs
 * Query:
 *  - pages= (default 67 ≈ 1000 jobs @ ~15/page, max 120)
 *  - limit= (default 1000, max 1000)
 *  - force=1  bypass server cache
 */
export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const force = searchParams.get("force") === "1";
  const maxPages = Math.min(
    120,
    Math.max(1, Number(searchParams.get("pages") || 67))
  );
  const maxJobs = Math.min(
    1000,
    Math.max(20, Number(searchParams.get("limit") || 1000))
  );
  const cacheKey = `pages=${maxPages}|limit=${maxJobs}`;

  try {
    if (!force) {
      const entry = cacheMap().get(cacheKey);
      if (entry && Date.now() <= entry.expiresAt) {
        return NextResponse.json(
          { ...entry.payload, cached: true },
          {
            headers: {
              "Cache-Control": `public, max-age=60, s-maxage=${Math.floor(CACHE_TTL_MS / 1000)}, stale-while-revalidate=180`,
              "X-MYEIB-Cache": "HIT",
            },
          }
        );
      }
    }

    const inflight = inflightMap();
    let promise = inflight.get(cacheKey);
    if (!promise) {
      promise = buildPayload(maxPages, maxJobs).finally(() => {
        inflight.delete(cacheKey);
      });
      inflight.set(cacheKey, promise);
    }

    const payload = await promise;
    cacheMap().set(cacheKey, {
      expiresAt: Date.now() + CACHE_TTL_MS,
      payload: { ...payload, cached: false },
    });

    return NextResponse.json(
      { ...payload, cached: false },
      {
        headers: {
          "Cache-Control": `public, max-age=60, s-maxage=${Math.floor(CACHE_TTL_MS / 1000)}, stale-while-revalidate=180`,
          "X-MYEIB-Cache": force ? "BYPASS" : "MISS",
        },
      }
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    const stale = cacheMap().get(cacheKey);
    if (stale) {
      return NextResponse.json(
        {
          ...stale.payload,
          note: `Serving cached Hello-Jobs data after error: ${message}`,
          cached: true,
        },
        { headers: { "X-MYEIB-Cache": "STALE" } }
      );
    }
    return NextResponse.json(
      {
        ok: false,
        error: message,
        jobs: [],
        note: "Could not reach hello-jobs.com.",
      },
      { status: 502 }
    );
  }
}
