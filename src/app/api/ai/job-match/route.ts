import { NextRequest, NextResponse } from "next/server";
import type { JobPosting, Lang, YouthProfile } from "@/lib/types";
import type { CvFeatures } from "@/lib/cv-extract";
import { generateLlmMatchScores } from "@/lib/job-ai-match";
import { isXaiConfigured } from "@/lib/xai";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

interface Body {
  youth?: YouthProfile;
  jobs?: JobPosting[];
  lang?: Lang;
  maxJobs?: number;
  cv?: CvFeatures | null;
}

/**
 * POST /api/ai/job-match
 * LLM-first matching: scores job description ↔ seeker profile/CV.
 * Rule engine shortlists candidates; Grok produces credible fit scores.
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
    const maxJobs = Math.min(40, Math.max(8, Number(body.maxJobs) || 30));

    const result = await generateLlmMatchScores({
      youth: body.youth,
      jobs: jobs.slice(0, 150),
      lang,
      maxJobs,
      cv: body.cv ?? null,
    });

    return NextResponse.json({
      ok: true,
      ...result,
      meta: {
        xaiConfigured: isXaiConfigured(),
        primaryScoring: result.provider === "xai" ? "llm" : "rules",
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
