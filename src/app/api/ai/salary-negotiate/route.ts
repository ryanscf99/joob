import { NextRequest, NextResponse } from "next/server";
import type { JobPosting, Lang, YouthProfile } from "@/lib/types";
import { buildSectorBenchmarks } from "@/lib/wage-benchmark";
import { generateSalaryNegotiateAdvice } from "@/lib/salary-negotiate";
import { isXaiConfigured } from "@/lib/xai";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

interface Body {
  job?: JobPosting;
  youth?: YouthProfile | null;
  lang?: Lang;
  officialJobs?: JobPosting[];
}

/**
 * POST /api/ai/salary-negotiate
 * Expected salary + thinking process for negotiation (LLM + market/profile).
 */
export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as Body;
    const job = body.job;
    if (!job?.id || !job?.title) {
      return NextResponse.json(
        { ok: false, error: "Missing job payload" },
        { status: 400 }
      );
    }
    const lang: Lang = body.lang === "zh" ? "zh" : "en";
    const youth = body.youth || null;
    const officialJobs = (body.officialJobs || []).filter(
      (j) => j && (j.source === "dsal" || !j.source)
    );
    const benchmarks = buildSectorBenchmarks(
      officialJobs.length
        ? officialJobs
        : job.source === "dsal"
          ? [job]
          : []
    );

    const advice = await generateSalaryNegotiateAdvice({
      job,
      youth,
      lang,
      benchmarks,
    });

    return NextResponse.json({
      ok: true,
      advice,
      meta: {
        xaiConfigured: isXaiConfigured(),
        hasProfile: !!youth,
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
  });
}
