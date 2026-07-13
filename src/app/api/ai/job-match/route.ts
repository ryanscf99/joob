import { NextRequest, NextResponse } from "next/server";
import type { JobPosting, Lang, YouthProfile } from "@/lib/types";
import type { CvFeatures } from "@/lib/cv-extract";
import { generateLlmMatchScores } from "@/lib/job-ai-match";
import { isXaiConfigured } from "@/lib/xai";
import { buildSectorBenchmarks } from "@/lib/wage-benchmark";
import {
  lookupEmployerWorkforce,
  type EmployerWorkforce,
} from "@/lib/employer-transparency";
import { resolveDsalWorkforceGroup } from "@/lib/dsal-nrw";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

const PUBLIC_SOURCES = new Set(["dsal", "jobscall", "hellojobs"]);

interface Body {
  youth?: YouthProfile;
  jobs?: JobPosting[];
  lang?: Lang;
  maxJobs?: number;
  cv?: CvFeatures | null;
  officialJobs?: JobPosting[];
}

/**
 * POST /api/ai/job-match
 * LLM-first matching: scores job description ↔ seeker profile/CV.
 * Prioritises local hiring likelihood + higher expected propose salary
 * among profession-safe roles. Public vacancies only.
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
    const jobs = (body.jobs || [])
      .filter((j) => j?.id)
      .filter(
        (j) =>
          !j.source ||
          PUBLIC_SOURCES.has(j.source) ||
          j.source === "dsal"
      );
    if (jobs.length === 0) {
      return NextResponse.json(
        { ok: false, error: "Missing public jobs array" },
        { status: 400 }
      );
    }

    const lang: Lang = body.lang === "zh" ? "zh" : "en";
    const maxJobs = Math.min(40, Math.max(8, Number(body.maxJobs) || 30));
    const pool = jobs.slice(0, 150);

    const officialJobs = (body.officialJobs || pool).filter(
      (j) => j.source === "dsal" || !j.source
    );
    const benchmarks = buildSectorBenchmarks(
      officialJobs.length ? officialJobs.slice(0, 120) : []
    );

    const workforceByJobId: Record<string, EmployerWorkforce | null> = {};
    for (const job of pool) {
      const key = `${job.company} ${job.companyZh}`;
      workforceByJobId[job.id] =
        resolveDsalWorkforceGroup(key) ||
        lookupEmployerWorkforce(key, job.sector);
    }

    const result = await generateLlmMatchScores({
      youth: body.youth,
      jobs: pool,
      lang,
      maxJobs,
      cv: body.cv ?? null,
      workforceByJobId,
      benchmarks,
    });

    return NextResponse.json({
      ok: true,
      ...result,
      meta: {
        xaiConfigured: isXaiConfigured(),
        primaryScoring: result.provider === "xai" ? "llm" : "rules",
        rankPriorities: ["profession", "local_hiring", "expected_salary"],
        publicOnly: true,
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
    primaryScoring: isXaiConfigured() ? "llm" : "rules",
    model: process.env.XAI_MODEL || "grok-4.5",
  });
}
