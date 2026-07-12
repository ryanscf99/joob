import { NextRequest, NextResponse } from "next/server";
import { fetchJobscallJobs, JOBSCALL_BASE } from "@/lib/jobscall";
import type { JobPosting } from "@/lib/types";

export const dynamic = "force-dynamic";

interface JobscallJobsPayload {
  ok: true;
  source: string;
  sourceUrl: string;
  note: string;
  fetchedAt: string;
  cached?: boolean;
  stats: {
    companies: number;
    returned: number;
  };
  jobs: JobPosting[];
}

type CacheEntry = {
  expiresAt: number;
  payload: JobscallJobsPayload;
};

const g = globalThis as unknown as {
  __myeibJobscallCache?: Map<string, CacheEntry>;
  __myeibJobscallInflight?: Map<string, Promise<JobscallJobsPayload>>;
};

const CACHE_TTL_MS = 15 * 60 * 1000; // 15 min — commercial board; avoid re-crawl on every click

function cacheMap() {
  if (!g.__myeibJobscallCache) g.__myeibJobscallCache = new Map();
  return g.__myeibJobscallCache;
}

function inflightMap() {
  if (!g.__myeibJobscallInflight) g.__myeibJobscallInflight = new Map();
  return g.__myeibJobscallInflight;
}

async function buildPayload(
  maxPages: number,
  maxJobs: number
): Promise<JobscallJobsPayload> {
  const result = await fetchJobscallJobs({ maxPages, maxJobs });
  return {
    ok: true,
    source: "Jobscall.me",
    sourceUrl: JOBSCALL_BASE,
    note:
      "Commercial Macau job board (employer pages on jobscall.me). Listings are aggregated from public employer posts; always apply on the original Jobscall page. Not official DSAL data.",
    fetchedAt: result.fetchedAt,
    cached: false,
    stats: {
      companies: result.companies,
      returned: result.jobs.length,
    },
    jobs: result.jobs,
  };
}

/**
 * GET /api/jobscall/jobs
 * Query:
 *  - pages= (default 10, max 18 — full Jobscall catalog is ~18 pages)
 *  - limit= (default 400, max 600)
 *  - force=1  bypass server cache
 */
export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const force = searchParams.get("force") === "1";
  const maxPages = Math.min(
    18,
    Math.max(1, Number(searchParams.get("pages") || 10))
  );
  const maxJobs = Math.min(
    600,
    Math.max(20, Number(searchParams.get("limit") || 400))
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
          note: `Serving cached Jobscall data after error: ${message}`,
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
        note: "Could not reach jobscall.me.",
      },
      { status: 502 }
    );
  }
}
