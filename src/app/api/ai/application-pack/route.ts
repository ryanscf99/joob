import { NextRequest, NextResponse } from "next/server";
import type { JobPosting, Lang, YouthProfile } from "@/lib/types";
import {
  lookupEmployerWorkforce,
  type EmployerWorkforce,
} from "@/lib/employer-transparency";
import { resolveDsalWorkforceGroup } from "@/lib/dsal-nrw";
import {
  cleanCompanyName,
  researchCompanyWeb,
} from "@/lib/company-research";
import { generateApplicationPack } from "@/lib/application-pack";
import { isXaiConfigured } from "@/lib/xai";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

interface Body {
  job?: JobPosting;
  youth?: YouthProfile | null;
  lang?: Lang;
  workforce?: EmployerWorkforce | null;
  /** Skip web crawl (faster) */
  skipWeb?: boolean;
}

/**
 * POST /api/ai/application-pack
 * Tailored CV + cover letter + company web research brief.
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

    // Decode HTML entities (e.g. A&amp;P → A&P) before research / match
    const jobClean: JobPosting = {
      ...job,
      company: cleanCompanyName(job.company),
      companyZh: cleanCompanyName(job.companyZh),
      title: cleanCompanyName(job.title) || job.title,
      titleZh: cleanCompanyName(job.titleZh) || job.titleZh,
    };

    const companyKey =
      jobClean.company &&
      jobClean.companyZh &&
      jobClean.company === jobClean.companyZh
        ? jobClean.company
        : `${jobClean.company || ""} ${jobClean.companyZh || ""}`.trim();

    let workforce = body.workforce || null;
    try {
      const group = companyKey ? resolveDsalWorkforceGroup(companyKey) : null;
      if (group) workforce = group;
      else if (!workforce) {
        workforce = lookupEmployerWorkforce(companyKey, jobClean.sector);
      }
    } catch {
      try {
        workforce =
          workforce || lookupEmployerWorkforce(companyKey, jobClean.sector);
      } catch {
        /* ignore */
      }
    }

    const research = body.skipWeb
      ? null
      : await researchCompanyWeb(jobClean.company, jobClean.companyZh, {
          externalUrl: jobClean.externalUrl,
        });

    const pack = await generateApplicationPack({
      job: jobClean,
      youth,
      lang,
      research,
      workforce,
    });

    return NextResponse.json({
      ok: true,
      pack,
      meta: {
        xaiConfigured: isXaiConfigured(),
        webHits: research?.hits?.length ?? 0,
        wiki: !!research?.wikiExtract,
        company: companyKey,
        workforceId: workforce?.id ?? null,
        queries: research?.queries ?? [],
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
