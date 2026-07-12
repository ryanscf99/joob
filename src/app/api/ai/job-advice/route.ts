import { NextRequest, NextResponse } from "next/server";
import type { JobPosting, Lang, YouthProfile } from "@/lib/types";
import { generateJobAiAdvice } from "@/lib/job-ai-advice";
import { buildSectorBenchmarks } from "@/lib/wage-benchmark";
import {
  lookupEmployerWorkforce,
  type EmployerWorkforce,
} from "@/lib/employer-transparency";
import { resolveDsalWorkforceGroup } from "@/lib/dsal-nrw";
import { isXaiConfigured } from "@/lib/xai";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

interface Body {
  job?: JobPosting;
  youth?: YouthProfile | null;
  lang?: Lang;
  /** Optional client-resolved workforce (official match map) */
  workforce?: EmployerWorkforce | null;
  /** DSAL jobs for sector median (preferred) */
  officialJobs?: JobPosting[];
}

/**
 * POST /api/ai/job-advice
 * Body: { job, youth?, lang?, workforce?, officialJobs? }
 * Uses xAI Grok when XAI_API_KEY is set; otherwise heuristic summary.
 */
export async function POST(req: NextRequest) {
  let body: Body = {};
  try {
    body = (await req.json()) as Body;
    const job = body.job;
    if (!job?.id || !job?.title) {
      return NextResponse.json(
        { ok: false, error: "Missing job payload" },
        { status: 400 }
      );
    }

    const lang: Lang = body.lang === "zh" ? "zh" : "en";
    const youth = body.youth || null;

    // Prefer official DSAL A3 group aggregate (sum related legal entities)
    let workforce = body.workforce || null;
    const companyKey =
      job.company && job.companyZh && job.company === job.companyZh
        ? job.company
        : `${job.company || ""} ${job.companyZh || ""}`.trim();
    try {
      const officialGroup = companyKey
        ? resolveDsalWorkforceGroup(companyKey)
        : null;
      if (officialGroup) {
        workforce = officialGroup;
      } else if (!workforce) {
        workforce = lookupEmployerWorkforce(companyKey, job.sector);
      }
    } catch {
      // A3 index / match must never take down AI advice
      if (!workforce) {
        try {
          workforce = lookupEmployerWorkforce(companyKey, job.sector);
        } catch {
          workforce = null;
        }
      }
    }

    const officialJobs = (body.officialJobs || []).filter(
      (j) => j && (j.source === "dsal" || !j.source)
    );
    // If client sent the job itself as dsal-only list is empty, still ok — static fallback
    let benchmarks = null as ReturnType<typeof buildSectorBenchmarks> | null;
    try {
      benchmarks = buildSectorBenchmarks(
        officialJobs.length ? officialJobs : job.source === "dsal" ? [job] : []
      );
    } catch {
      benchmarks = null;
    }

    const advice = await generateJobAiAdvice({
      job,
      youth,
      lang,
      workforce,
      benchmarks,
    });

    return NextResponse.json({
      ok: true,
      advice,
      meta: {
        xaiConfigured: isXaiConfigured(),
        workforceId: workforce?.id || null,
        workforceConfidence: workforce?.confidence || null,
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    // Bare heuristic so the UI is never stuck on a red error alone
    try {
      if (body?.job?.id) {
        const { buildHeuristicAdvice } = await import("@/lib/job-ai-advice");
        const advice = buildHeuristicAdvice({
          job: body.job,
          youth: body.youth || null,
          lang: body.lang === "zh" ? "zh" : "en",
          workforce: null,
          benchmarks: null,
        });
        return NextResponse.json({
          ok: true,
          advice: {
            ...advice,
            summary: `${advice.summary}\n\n[${body.lang === "zh" ? "部分功能降級" : "Degraded mode"}: ${message}]`,
          },
          meta: {
            xaiConfigured: isXaiConfigured(),
            degraded: true,
            error: message,
          },
        });
      }
    } catch {
      /* fall through */
    }
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

/** Health: whether LLM is configured (does not call the model). */
export async function GET() {
  return NextResponse.json({
    ok: true,
    xaiConfigured: isXaiConfigured(),
    provider: isXaiConfigured() ? "xai" : "heuristic",
  });
}
