import type { JobPosting, Lang, YouthProfile } from "./types";
import type { EmployerWorkforce } from "./employer-transparency";
import type { SectorWageBenchmark } from "./wage-benchmark";
import {
  compareJobToBenchmark,
  formatDeviationPct,
} from "./wage-benchmark";
import { matchJobsWithCv } from "./cv-match";
import type { CvFeatures } from "./cv-extract";
import { buildHeuristicAdvice } from "./job-ai-advice";
import type {
  AiVerdict,
  BatchRankResult,
  JobAiAdvice,
  JobAiStrip,
} from "./job-ai-types";
import { createXaiClient, isXaiConfigured, XAI_MODEL } from "./xai";
import { assessProfessionFit } from "./profession-fit";

export type { JobAiStrip, BatchRankResult } from "./job-ai-types";

export interface BatchRankInput {
  youth: YouthProfile;
  jobs: JobPosting[];
  lang: Lang;
  topN?: number;
  /** jobId → workforce */
  workforceByJobId?: Record<string, EmployerWorkforce | null | undefined>;
  benchmarks?: Record<string, SectorWageBenchmark> | null;
}

function cvFromYouth(youth: YouthProfile): CvFeatures | null {
  if (!youth.cv?.features) return null;
  const f = youth.cv.features;
  return {
    name: f.name,
    emails: f.emails || [],
    phones: f.phones || [],
    languages: f.languages || [],
    skills: f.skills || [],
    keywords: f.keywords || [],
    preferredSectors: f.preferredSectors || [],
    preferredLanes: f.preferredLanes || [],
    educationLevel: (f.educationLevel as CvFeatures["educationLevel"]) || null,
    educationHints: f.educationHints || [],
    isStudent: !!f.isStudent,
    experienceYears: f.experienceYears ?? null,
    districts: f.districts || [],
    summary: f.summary || "",
    textLength: f.textLength || 0,
    careerStage:
      (f.careerStage as CvFeatures["careerStage"]) || "early_career",
    estimatedAge: f.estimatedAge ?? null,
    researchInterests: f.researchInterests,
  };
}

function compactJob(
  job: JobPosting,
  ruleScore: number,
  workforce?: EmployerWorkforce | null,
  benchmarks?: Record<string, SectorWageBenchmark> | null,
  youth?: YouthProfile | null,
  cv?: CvFeatures | null
) {
  const cmp =
    benchmarks && job.sector
      ? compareJobToBenchmark(
          job,
          benchmarks as Record<import("./types").Sector, SectorWageBenchmark>
        )
      : null;

  const prof = youth ? assessProfessionFit(youth, job, cv) : null;

  return {
    id: job.id,
    title: job.title,
    titleZh: job.titleZh,
    company: job.company,
    companyZh: job.companyZh,
    sector: job.sector,
    lane: job.lane,
    payMin: job.payMin,
    payMax: job.payMax,
    payUnit: job.payUnit,
    skills: (job.skills || []).slice(0, 8),
    youthFriendly: job.youthFriendly,
    trainingProvided: job.trainingProvided,
    source: job.source,
    desc: (job.description || job.descriptionZh || "").slice(0, 280),
    ruleMatchScore: ruleScore,
    profession: prof
      ? {
          seekerDomains: prof.seekerDomains,
          jobDomains: prof.jobDomains,
          hardMismatch: prof.hardMismatch,
          credentialBlock: prof.credentialBlock,
          compatible: prof.compatible,
          scoreDelta: prof.scoreDelta,
          requiredCredentials: prof.credentials?.required || [],
          missingCredentials: prof.credentials?.missing || [],
          matchedCredentials: prof.credentials?.matched || [],
        }
      : null,
    payDeviationPct:
      cmp?.hasListingPay != null && cmp.hasListingPay
        ? Math.round(cmp.deviationPct)
        : null,
    payDeviationLabel:
      cmp?.hasListingPay ? formatDeviationPct(cmp.deviationPct) : null,
    workforce: workforce
      ? {
          localSharePct: workforce.localSharePct,
          foreignSharePct: workforce.foreignSharePct,
          foreignEmployees: workforce.foreignEmployees,
          localEmployees: workforce.localEmployees,
          confidence: workforce.confidence,
        }
      : null,
  };
}

/** Heuristic one-pass ranking (no LLM). */
export function buildHeuristicBatchRank(
  input: BatchRankInput
): BatchRankResult {
  const topN = Math.min(20, Math.max(3, input.topN ?? 12));
  const cv = cvFromYouth(input.youth);
  const ruleRanked = matchJobsWithCv(input.youth, input.jobs, cv).slice(
    0,
    topN
  );

  const strips: JobAiStrip[] = ruleRanked.map((r, i) => {
    const advice: JobAiAdvice = buildHeuristicAdvice({
      job: r.job,
      youth: input.youth,
      lang: input.lang,
      workforce: input.workforceByJobId?.[r.job.id] ?? null,
      benchmarks: input.benchmarks,
    });
    const blurb =
      input.lang === "zh"
        ? `${advice.headline} — ${advice.summary.slice(0, 120)}${advice.summary.length > 120 ? "…" : ""}`
        : `${advice.headline} — ${advice.summary.slice(0, 140)}${advice.summary.length > 140 ? "…" : ""}`;

    return {
      jobId: r.job.id,
      fitScore: advice.fitScore,
      verdict: advice.verdict,
      blurb,
      rank: i + 1,
      ruleMatchScore: r.score,
      provider: "heuristic" as const,
    };
  });

  // Sort by AI fitScore (heuristic mirrors rule closely)
  strips.sort((a, b) => b.fitScore - a.fitScore);
  strips.forEach((s, i) => {
    s.rank = i + 1;
  });

  const overview =
    input.lang === "zh"
      ? `已用規則＋薪酬／人手訊號對前 ${strips.length} 個職位排序。設定 XAI_API_KEY 後可改用 Grok 一次重排並生成更短摘要。`
      : `Ranked top ${strips.length} roles with rules + pay/workforce signals. Set XAI_API_KEY to re-rank in one Grok pass with tighter blurbs.`;

  return {
    ranked: strips,
    overview,
    provider: "heuristic",
    generatedAt: new Date().toISOString(),
    topN: strips.length,
  };
}

/**
 * Batch AI rank: one LLM call over top-N rule-matched jobs.
 */
export async function generateBatchJobRank(
  input: BatchRankInput
): Promise<BatchRankResult> {
  const topN = Math.min(20, Math.max(3, input.topN ?? 12));
  const cv = cvFromYouth(input.youth);
  const ruleRanked = matchJobsWithCv(input.youth, input.jobs, cv).slice(
    0,
    topN
  );

  if (ruleRanked.length === 0) {
    return {
      ranked: [],
      overview:
        input.lang === "zh"
          ? "沒有可配對的職位。"
          : "No jobs available to rank.",
      provider: isXaiConfigured() ? "xai" : "heuristic",
      generatedAt: new Date().toISOString(),
      topN: 0,
    };
  }

  if (!isXaiConfigured()) {
    return buildHeuristicBatchRank({ ...input, topN });
  }

  const client = createXaiClient();
  if (!client) return buildHeuristicBatchRank({ ...input, topN });

  const compactJobs = ruleRanked.map((r) =>
    compactJob(
      r.job,
      r.score,
      input.workforceByJobId?.[r.job.id],
      input.benchmarks,
      input.youth,
      cv
    )
  );

  const seeker = {
    name: input.youth.name,
    age: input.youth.age,
    isStudent: input.youth.isStudent,
    skills: input.youth.skills,
    preferredLanes: input.youth.preferredLanes,
    preferredSectors: input.youth.preferredSectors,
    district: input.youth.district,
    availability: input.youth.availability,
    hasCv: !!input.youth.cv,
    cvSkills: input.youth.cv?.features?.skills?.slice(0, 15) || [],
    cvKeywords: input.youth.cv?.features?.keywords?.slice(0, 20) || [],
    cvSummary: (input.youth.cv?.features?.summary || "").slice(0, 300),
    educationLevel: input.youth.cv?.features?.educationLevel,
    educationHints: input.youth.cv?.features?.educationHints?.slice(0, 8) || [],
    researchInterests: (
      input.youth.cv?.features?.researchInterests || ""
    ).slice(0, 200),
    careerStage: input.youth.cv?.features?.careerStage,
  };

  const langLine =
    input.lang === "zh"
      ? "Write all text fields in Traditional Chinese (繁體中文)."
      : "Write all text fields in clear English.";

  try {
    const completion = await client.chat.completions.create({
      model: XAI_MODEL,
      temperature: 0.25,
      max_tokens: 2200,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content: `You are jOOB Macau youth career coach. Rank a shortlist of job vacancies for ONE seeker in a single pass.
${langLine}
PRIMARY criteria: (1) regulated professional credentials, (2) profession/skills domain.
- If profession.credentialBlock is true or missingCredentials is non-empty, fitScore MUST be ≤ 20 and verdict not_recommended. Doctors, nurses, physiotherapists, psychologists, lawyers, CPAs, etc. cannot be matched by keywords alone without CV evidence of the licence/registration.
- If profession.hardMismatch is true, fitScore MUST be ≤ 30 and verdict not_recommended or weak_fit.
- A Statistics/Data PhD must NOT rank high for Tea Master, barista, waiter, cashier, or similar craft/service roles.
- Rank roles that match seeker domains AND credentials first.
Secondary: payDeviationPct, workforce mix, youth-friendly, ruleMatchScore.
Use ONLY provided facts. Do not invent salaries or headcounts.
Output ONLY valid JSON.`,
        },
        {
          role: "user",
          content: `Seeker:
${JSON.stringify(seeker)}

Jobs shortlist (with profession fit tags):
${JSON.stringify(compactJobs)}

Return JSON:
{
  "overview": "2–3 sentences — emphasise profession fit across the shortlist",
  "ranked": [
    {
      "jobId": "exact id from input",
      "fitScore": 0-100,
      "verdict": "strong_fit|possible|weak_fit|not_recommended",
      "blurb": "max 160 chars — profession/skills reason first"
    }
  ]
}
Include EVERY jobId exactly once. Order ranked best → worst by profession fit, then other factors.`,
        },
      ],
    });

    const raw = completion.choices[0]?.message?.content || "";
    let text = raw.trim();
    if (text.startsWith("```")) {
      text = text.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
    }
    const parsed = JSON.parse(text) as {
      overview?: string;
      ranked?: {
        jobId?: string;
        fitScore?: number;
        verdict?: string;
        blurb?: string;
      }[];
    };

    const allowed: AiVerdict[] = [
      "strong_fit",
      "possible",
      "weak_fit",
      "not_recommended",
    ];
    const byId = new Map(ruleRanked.map((r) => [r.job.id, r]));
    const seen = new Set<string>();
    const ranked: JobAiStrip[] = [];

    for (const row of parsed.ranked || []) {
      const id = String(row.jobId || "");
      if (!byId.has(id) || seen.has(id)) continue;
      seen.add(id);
      const match = byId.get(id)!;
      const prof = assessProfessionFit(input.youth, match.job, cv);
      let fitScore = Math.max(
        0,
        Math.min(100, Math.round(Number(row.fitScore) || 0))
      );
      let v = String(row.verdict || "possible") as AiVerdict;
      // Guardrails: never let LLM overscore credential/profession failures
      if (prof.credentialBlock) {
        fitScore = Math.min(fitScore, 18);
        v = "not_recommended";
      } else if (prof.hardMismatch) {
        fitScore = Math.min(fitScore, 28);
        if (v === "strong_fit" || v === "possible") v = "not_recommended";
      }
      ranked.push({
        jobId: id,
        fitScore,
        verdict: allowed.includes(v) ? v : "possible",
        blurb: String(row.blurb || "").slice(0, 220),
        ruleMatchScore: match.score,
        provider: "xai",
      });
    }

    // Append any missing jobs from rule order
    for (const r of ruleRanked) {
      if (seen.has(r.job.id)) continue;
      const fb = buildHeuristicAdvice({
        job: r.job,
        youth: input.youth,
        lang: input.lang,
        workforce: input.workforceByJobId?.[r.job.id] ?? null,
        benchmarks: input.benchmarks,
      });
      ranked.push({
        jobId: r.job.id,
        fitScore: fb.fitScore,
        verdict: fb.verdict,
        blurb: fb.headline,
        ruleMatchScore: r.score,
        provider: "heuristic",
      });
    }

    ranked.sort((a, b) => b.fitScore - a.fitScore);
    ranked.forEach((s, i) => {
      s.rank = i + 1;
    });

    return {
      ranked,
      overview:
        String(parsed.overview || "").trim() ||
        (input.lang === "zh"
          ? "已完成 AI 批次排序。"
          : "AI batch ranking complete."),
      provider: "xai",
      model: completion.model || XAI_MODEL,
      generatedAt: new Date().toISOString(),
      topN: ranked.length,
    };
  } catch {
    return buildHeuristicBatchRank({ ...input, topN });
  }
}

/** Convert full single-job advice into a card strip */
export function adviceToStrip(
  jobId: string,
  advice: JobAiAdvice,
  rank?: number
): JobAiStrip {
  return {
    jobId,
    fitScore: advice.fitScore,
    verdict: advice.verdict,
    blurb: `${advice.headline}${advice.summary ? ` — ${advice.summary.slice(0, 100)}` : ""}`.slice(
      0,
      200
    ),
    rank,
    ruleMatchScore: advice.ruleMatchScore,
    provider: advice.provider,
  };
}
