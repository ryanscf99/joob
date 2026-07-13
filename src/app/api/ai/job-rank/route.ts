import { NextRequest, NextResponse } from "next/server";
import type { JobPosting, Lang, YouthProfile } from "@/lib/types";
import { generateBatchJobRank } from "@/lib/job-ai-batch";
import { buildSectorBenchmarks } from "@/lib/wage-benchmark";
import {
  lookupEmployerWorkforce,
  type EmployerWorkforce,
} from "@/lib/employer-transparency";
import { resolveDsalWorkforceGroup } from "@/lib/dsal-nrw";
import { isXaiConfigured } from "@/lib/xai";

export const dynamic = "force-dynamic";
export const maxDuration = 90;

interface Body {
  youth?: YouthProfile;
  jobs?: JobPosting[];
  lang?: Lang;
  topN?: number;
  officialJobs?: JobPosting[];
}

/**
 * POST /api/ai/job-rank
 * One-pass AI ranking of top-N rule-matched jobs for a seeker.
 */
export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as Body;
    if (!body.youth?.id) {
      return NextResponse.json(
        { ok: false, error: "Missing youth profile" },
        { status: 400 }
      );
    }
    const jobs = (body.jobs || []).filter((j) => j?.id);
    if (jobs.length === 0) {
      return NextResponse.json(
        { ok: false, error: "Missing jobs array" },
        { status: 400 }
      );
    }

    const lang: Lang = body.lang === "zh" ? "zh" : "en";
    const topN = Math.min(20, Math.max(3, Number(body.topN) || 12));

    // Cap payload — public boards only (no seed / in-app demos)
    const PUBLIC = new Set(["dsal", "jobscall", "hellojobs"]);
    const pool = jobs
      .filter((j) => !j.source || PUBLIC.has(j.source))
      .slice(0, 120);

    if (pool.length === 0) {
      return NextResponse.json(
        { ok: false, error: "No public vacancies to rank" },
        { status: 400 }
      );
    }

    const officialJobs = (body.officialJobs || pool).filter(
      (j) => j.source === "dsal" || !j.source
    );
    const benchmarks = buildSectorBenchmarks(
      officialJobs.length ? officialJobs.slice(0, 120) : []
    );

    // Resolve workforce for companies that will appear in the shortlist
    // (pre-compute for all pool entries used in rule match — capped)
    const workforceByJobId: Record<string, EmployerWorkforce | null> = {};
    for (const job of pool) {
      const key = `${job.company} ${job.companyZh}`;
      workforceByJobId[job.id] =
        resolveDsalWorkforceGroup(key) ||
        lookupEmployerWorkforce(key, job.sector);
    }

    const result = await generateBatchJobRank({
      youth: body.youth,
      jobs: pool,
      lang,
      topN,
      workforceByJobId,
      benchmarks,
    });

    return NextResponse.json({
      ok: true,
      ...result,
      meta: {
        xaiConfigured: isXaiConfigured(),
        poolSize: pool.length,
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

export async function GET() {
  return NextResponse.json({
    ok: true,
    xaiConfigured: isXaiConfigured(),
    provider: isXaiConfigured() ? "xai" : "heuristic",
  });
}
