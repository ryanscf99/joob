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
import { z } from "zod";
import { checkRateLimit, noStoreJson, requireApiUser } from "@/lib/api-security";

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
  consent?: boolean;
}

const bodySchema = z.object({
  youth: z
    .object({
      id: z.string().min(1).max(100),
      // Coerce common profile shapes so Grok match is not blocked by loose client data
      age: z.coerce.number().int().min(14).max(100).optional().default(22),
      parentalConsent: z.boolean().optional().default(true),
    })
    .passthrough(),
  jobs: z
    .array(z.object({ id: z.string().min(1).max(300) }).passthrough())
    .min(1)
    .max(150),
  lang: z.enum(["en", "zh"]).optional(),
  maxJobs: z.number().int().min(6).max(16).optional(),
  cv: z.record(z.string(), z.unknown()).nullable().optional(),
  officialJobs: z
    .array(z.object({ id: z.string() }).passthrough())
    .max(120)
    .optional(),
  /** Explicit consent to process profile/CV with AI (client sends true) */
  consent: z.union([z.literal(true), z.literal("true"), z.boolean()]).optional(),
});

/**
 * POST /api/ai/job-match
 * LLM-first matching: scores job description ↔ seeker profile/CV via Grok when XAI_API_KEY is set.
 * Guest use is allowed (rate-limited) so Smart Match works without forced login.
 */
export async function POST(req: NextRequest) {
  try {
    const limited = checkRateLimit(req, "ai-match", 8, 60_000);
    if (limited) return limited;
    // Optional auth: signed-in users get persistence; guests still get Grok match
    const auth = await requireApiUser({ optional: true });
    if (auth.response) return auth.response;
    const raw = await req.json();
    const parsed = bodySchema.safeParse(raw);
    if (!parsed.success) {
      return noStoreJson(
        {
          ok: false,
          error: "Invalid match request.",
          details: parsed.error.flatten(),
        },
        { status: 400 }
      );
    }
    if (parsed.data.consent !== true && parsed.data.consent !== "true") {
      return noStoreJson(
        {
          ok: false,
          error:
            "AI consent is required (send consent: true). Profile/CV is processed only for this match run.",
        },
        { status: 400 }
      );
    }
    const body = parsed.data as unknown as Body;
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
    // Default 8 jobs → one compact Grok call (best latency)
    const maxJobs = Math.min(16, Math.max(6, Number(body.maxJobs) || 8));
    const pool = jobs.slice(0, 48);

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

    return noStoreJson({
      ok: true,
      ...result,
      meta: {
        xaiConfigured: isXaiConfigured(),
        primaryScoring: result.provider === "xai" ? "llm" : "rules",
        usedGrok: result.provider === "xai",
        guest: auth.demoMode,
        durationMs: result.durationMs,
        rankPriorities: ["profession", "local_hiring", "expected_salary"],
        publicOnly: true,
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("[job-match]", message);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

export async function GET() {
  return NextResponse.json({
    ok: true,
    xaiConfigured: isXaiConfigured(),
    primaryScoring: isXaiConfigured() ? "llm" : "rules",
    model:
      process.env.XAI_MATCH_MODEL ||
      process.env.XAI_MODEL ||
      "grok-4.3",
  });
}
