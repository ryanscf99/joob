import { NextRequest, NextResponse } from "next/server";
import { fetchJobscallJobs, JOBSCALL_BASE } from "@/lib/jobscall";
import type { JobPosting } from "@/lib/types";
import { slimJobs } from "@/lib/job-slim";
import { createBoundedCache, createInflightMap } from "@/lib/server-cache";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

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

const CACHE_TTL_MS = 20 * 60 * 1000;
const cache = createBoundedCache<JobscallJobsPayload>({
  maxEntries: 12,
  name: "jobscall",
});
const inflight = createInflightMap<JobscallJobsPayload>("jobscall");

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
    jobs: slimJobs(result.jobs),
  };
}

/**
 * GET /api/jobscall/jobs
 * pages= (default 30, max 60)  limit= (default 500, max 800)
 */
export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const force = searchParams.get("force") === "1";
  const maxPages = Math.min(
    60,
    Math.max(1, Number(searchParams.get("pages") || 30) || 30)
  );
  const maxJobs = Math.min(
    800,
    Math.max(20, Number(searchParams.get("limit") || 500) || 500)
  );
  const cacheKey = `jc|p=${maxPages}|l=${maxJobs}`;

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
