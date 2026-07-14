import { NextRequest, NextResponse } from "next/server";
import { fetchHelloJobs, HELLOJOBS_BASE } from "@/lib/hellojobs";
import type { JobPosting } from "@/lib/types";
import { slimJobs } from "@/lib/job-slim";
import { createBoundedCache, createInflightMap } from "@/lib/server-cache";

export const dynamic = "force-dynamic";
/** Vercel / long scrapes */
export const maxDuration = 60;

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

const CACHE_TTL_MS = 20 * 60 * 1000;
const cache = createBoundedCache<HelloJobsPayload>({
  maxEntries: 12,
  name: "hellojobs",
});
const inflight = createInflightMap<HelloJobsPayload>("hellojobs");

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
    // Slim for wire + serverless memory
    jobs: slimJobs(result.jobs),
  };
}

/**
 * GET /api/hellojobs/jobs
 * pages= (default 40, max 80)  limit= (default 500, max 800)
 */
export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const force = searchParams.get("force") === "1";
  const maxPages = Math.min(
    80,
    Math.max(1, Number(searchParams.get("pages") || 40) || 40)
  );
  const maxJobs = Math.min(
    800,
    Math.max(20, Number(searchParams.get("limit") || 500) || 500)
  );
  const cacheKey = `hj|p=${maxPages}|l=${maxJobs}`;

  try {
    if (!force) {
      const hit = cache.get(cacheKey);
      if (hit) {
        return NextResponse.json(
          { ...hit, cached: true },
          {
            headers: {
              "Cache-Control":
                "public, max-age=60, s-maxage=300, stale-while-revalidate=600",
              "X-MYEIB-Cache": "HIT",
            },
          }
        );
      }
    }

    const payload = await inflight.run(cacheKey, () =>
      buildPayload(maxPages, maxJobs)
    );
    cache.set(cacheKey, payload, CACHE_TTL_MS);

    return NextResponse.json(
      { ...payload, cached: false },
      {
        headers: {
          "Cache-Control":
            "public, max-age=60, s-maxage=300, stale-while-revalidate=600",
          "X-MYEIB-Cache": force ? "BYPASS" : "MISS",
        },
      }
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    const stale = cache.get(cacheKey);
    if (stale) {
      return NextResponse.json(
        {
          ...stale,
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
