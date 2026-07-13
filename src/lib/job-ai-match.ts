/**
 * LLM-first job ↔ seeker matching.
 * Uses xAI Grok to score fit from full job description vs profile/CV,
 * with rule-based shortlisting for scale and credential/profession guardrails.
 */

import type { JobPosting, Lang, YouthProfile } from "./types";
import type { CvFeatures } from "./cv-extract";
import type { AiVerdict } from "./job-ai-types";
import type { EmployerWorkforce } from "./employer-transparency";
import type { SectorWageBenchmark } from "./wage-benchmark";
import { matchJobsWithCv } from "./cv-match";
import { assessProfessionFit } from "./profession-fit";
import { createXaiClient, isXaiConfigured, XAI_MODEL } from "./xai";
import {
  applyLocalHireAndSalaryToMatchResults,
  computeJobRankSignals,
  finalizeMatchScore,
  signalsForLlm,
  type JobRankSignals,
} from "./match-rank-signals";
import { lookupEmployerWorkforce } from "./employer-transparency";

export interface LlmMatchScore {
  jobId: string;
  /** Primary credible score (LLM when available) */
  fitScore: number;
  verdict: AiVerdict;
  /** Short explainable reasons (from LLM or rules) */
  reasons: string[];
  blurb: string;
  ruleMatchScore?: number;
  provider: "xai" | "heuristic";
  rank?: number;
}

export interface LlmMatchResult {
  scores: LlmMatchScore[];
  overview: string;
  provider: "xai" | "heuristic";
  model?: string;
  generatedAt: string;
  /** How many jobs were LLM-scored */
  scoredCount: number;
  /** Pool size before shortlist */
  poolSize: number;
}

export interface LlmMatchInput {
  youth: YouthProfile;
  jobs: JobPosting[];
  lang: Lang;
  /** Max jobs to send to the LLM (default 30) */
  maxJobs?: number;
  cv?: CvFeatures | null;
  /** jobId → workforce (local vs NRW) for local-hire ranking */
  workforceByJobId?: Record<string, EmployerWorkforce | null | undefined>;
  /** Sector pay benchmarks for expected-salary propose */
  benchmarks?: Record<string, SectorWageBenchmark> | null;
}

const BATCH_SIZE = 12;

function cvFromYouth(youth: YouthProfile, cv?: CvFeatures | null): CvFeatures | null {
  if (cv && cv.textLength >= 40) return cv;
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

function seekerPayload(youth: YouthProfile, cv: CvFeatures | null) {
  return {
    name: youth.name,
    age: youth.age,
    isStudent: youth.isStudent,
    languages: youth.languages,
    skills: youth.skills,
    preferredLanes: youth.preferredLanes,
    preferredSectors: youth.preferredSectors,
    district: youth.district,
    availability: youth.availability,
    bio: (youth.bio || "").slice(0, 500),
    hasCv: !!cv,
    educationLevel: cv?.educationLevel || youth.cv?.features?.educationLevel,
    educationHints: (cv?.educationHints || []).slice(0, 10),
    careerStage: cv?.careerStage,
    experienceYears: cv?.experienceYears,
    cvSkills: (cv?.skills || []).slice(0, 25),
    cvKeywords: (cv?.keywords || []).slice(0, 30),
    cvSummary: (cv?.summary || "").slice(0, 600),
    researchInterests: (cv?.researchInterests || "").slice(0, 300),
  };
}

function jobPayload(
  job: JobPosting,
  ruleScore: number,
  youth: YouthProfile,
  cv: CvFeatures | null,
  rankSignals?: JobRankSignals | null
) {
  const prof = assessProfessionFit(youth, job, cv);
  return {
    id: job.id,
    title: job.title,
    titleZh: job.titleZh,
    company: job.company,
    companyZh: job.companyZh,
    sector: job.sector,
    lane: job.lane,
    district: job.district,
    payMin: job.payMin,
    payMax: job.payMax,
    payUnit: job.payUnit,
    languages: job.languages,
    skills: (job.skills || []).slice(0, 12),
    requirements: (job.requirements || []).slice(0, 10),
    requirementsZh: (job.requirementsZh || []).slice(0, 8),
    /** Full-ish job description for semantic matching */
    description: (job.description || "").slice(0, 900),
    descriptionZh: (job.descriptionZh || "").slice(0, 900),
    youthFriendly: job.youthFriendly,
    trainingProvided: job.trainingProvided,
    source: job.source,
    ruleMatchScore: ruleScore,
    profession: {
      seekerDomains: prof.seekerDomains,
      jobDomains: prof.jobDomains,
      hardMismatch: prof.hardMismatch,
      credentialBlock: prof.credentialBlock,
      requiredCredentials: prof.credentials?.required || [],
      missingCredentials: prof.credentials?.missing || [],
      matchedCredentials: prof.credentials?.matched || [],
    },
    /** Prefer higher local-hire likelihood and higher expected propose salary */
    rankSignals: rankSignals ? signalsForLlm(rankSignals) : null,
  };
}

function buildPoolSignals(
  jobs: JobPosting[],
  youth: YouthProfile,
  input: LlmMatchInput
): Map<string, JobRankSignals> {
  const map = new Map<string, JobRankSignals>();
  for (const job of jobs) {
    map.set(
      job.id,
      computeJobRankSignals(
        job,
        youth,
        input.benchmarks,
        input.workforceByJobId?.[job.id]
      )
    );
  }
  return map;
}

function applyLocalHireSalaryBlend(
  scores: LlmMatchScore[],
  shortlist: { job: JobPosting; score: number }[],
  youth: YouthProfile,
  cv: CvFeatures | null,
  signalMap: Map<string, JobRankSignals>
): LlmMatchScore[] {
  const pool = shortlist.map(
    (r) => signalMap.get(r.job.id) || computeJobRankSignals(r.job, youth, null)
  );
  const byId = new Map(shortlist.map((r) => [r.job.id, r.job]));

  return scores.map((s) => {
    const job = byId.get(s.jobId);
    const sig = signalMap.get(s.jobId);
    if (!job || !sig) return s;
    const fin = finalizeMatchScore(s.fitScore, job, sig, pool, youth, cv);
    const reasons = [...s.reasons];
    if (fin.reasonEn && !reasons.some((r) => r.includes("Local hiring") || r.includes("本地招聘"))) {
      reasons.unshift(
        // Prefer language already in reasons list style
        reasons.some((r) => /[\u4e00-\u9fff]/.test(r))
          ? fin.reasonZh || fin.reasonEn
          : fin.reasonEn
      );
    }
    return { ...s, fitScore: fin.fitScore, reasons: reasons.slice(0, 4) };
  });
}

function applyGuardrails(
  youth: YouthProfile,
  job: JobPosting,
  cv: CvFeatures | null,
  fitScore: number,
  verdict: AiVerdict,
  reasons: string[]
): { fitScore: number; verdict: AiVerdict; reasons: string[] } {
  const prof = assessProfessionFit(youth, job, cv);
  let score = fitScore;
  let v = verdict;
  const rs = [...reasons];

  if (prof.credentialBlock) {
    score = Math.min(score, 18);
    v = "not_recommended";
    if (prof.reasonsEn[0] && !rs.some((r) => r.includes("credential") || r.includes("licence") || r.includes("資格"))) {
      rs.unshift(prof.reasonsEn[0]);
    }
  } else if (prof.hardMismatch) {
    score = Math.min(score, 28);
    if (v === "strong_fit" || v === "possible") v = "weak_fit";
    if (score < 25) v = "not_recommended";
    if (prof.reasonsEn[0]) rs.unshift(prof.reasonsEn[0]);
  }

  return {
    fitScore: Math.max(0, Math.min(100, Math.round(score))),
    verdict: v,
    reasons: rs.slice(0, 4),
  };
}

function verdictFromScore(score: number): AiVerdict {
  if (score >= 72) return "strong_fit";
  if (score >= 50) return "possible";
  if (score >= 32) return "weak_fit";
  return "not_recommended";
}

/** Heuristic fallback: use rule scores as primary, then local-hire + salary hard caps. */
export function buildHeuristicLlmMatch(input: LlmMatchInput): LlmMatchResult {
  const cv = cvFromYouth(input.youth, input.cv);
  const maxJobs = Math.min(50, Math.max(8, input.maxJobs ?? 30));

  const adjusted = applyLocalHireAndSalaryToMatchResults(
    matchJobsWithCv(input.youth, input.jobs, cv),
    input.youth,
    input.benchmarks,
    (job) =>
      input.workforceByJobId?.[job.id] ??
      lookupEmployerWorkforce(`${job.company} ${job.companyZh}`, job.sector),
    cv
  ).slice(0, maxJobs);

  const scores: LlmMatchScore[] = adjusted.map((r, i) => {
    const reasons =
      input.lang === "zh" ? r.reasonsZh.slice(0, 4) : r.reasons.slice(0, 4);
    return {
      jobId: r.job.id,
      fitScore: r.score,
      verdict: verdictFromScore(r.score),
      reasons,
      blurb:
        input.lang === "zh"
          ? `規則＋本地招聘／薪酬 ${r.score}：${reasons[0] || "綜合檔案與職位"}`
          : `Rules + local-hire/pay ${r.score}: ${reasons[0] || "profile vs role"}`,
      ruleMatchScore: r.score,
      provider: "heuristic" as const,
      rank: i + 1,
    };
  });

  return {
    scores,
    overview:
      input.lang === "zh"
        ? "規則配對已強制：本地招聘可能性「低」的職位配對分上限約 48，不會再以 100 分排第一。同時加權可提出預期薪酬。設定 XAI_API_KEY 後改用 Grok，但仍保留此護欄。"
        : "Rules enforce: Low local-hiring roles are capped (~48) and cannot rank #1 with a perfect score. Expected proposed salary is also weighted. With XAI_API_KEY, Grok scores semantics under the same guardrails.",
    provider: "heuristic",
    generatedAt: new Date().toISOString(),
    scoredCount: scores.length,
    poolSize: input.jobs.length,
  };
}

async function llmScoreBatch(
  client: NonNullable<ReturnType<typeof createXaiClient>>,
  youth: YouthProfile,
  cv: CvFeatures | null,
  jobs: ReturnType<typeof jobPayload>[],
  lang: Lang
): Promise<
  {
    jobId: string;
    fitScore: number;
    verdict: string;
    reasons: string[];
    blurb: string;
  }[]
> {
  const langLine =
    lang === "zh"
      ? "Write all reasons and blurbs in Traditional Chinese (繁體中文)."
      : "Write all reasons and blurbs in clear English.";

  const completion = await client.chat.completions.create({
    model: XAI_MODEL,
    temperature: 0.2,
    max_tokens: 2800,
    response_format: { type: "json_object" },
    messages: [
      {
        role: "system",
        content: `You are jOOB's Macau job-matching engine. Score how well EACH job fits THIS seeker by comparing:
1) Job title, full description, requirements, skills
2) Seeker profile, CV summary, skills, education, experience, preferred sectors/lanes

${langLine}

Scoring principles (credible fit, not keyword spam):
- PRIMARY: profession, field of study, skills required vs skills held, and regulated credentials.
- If profession.credentialBlock or missingCredentials: fitScore ≤ 18, verdict not_recommended. Licences cannot be inferred from soft keywords.
- If profession.hardMismatch (e.g. Statistics PhD vs Tea Master): fitScore ≤ 28, verdict weak_fit or not_recommended.
- Do NOT give high scores just because both mention "teamwork" or "Macau".
- Strong fits need clear overlap in occupation, hard skills, education field, or career path.

PRIORITY BOOSTS (among roles that pass profession fit — these MUST move the ranking):
1) LOCAL HIRING: Prefer higher rankSignals.localHiringLikelihood. HARD CAPS:
   - level "low" / steps1to4 ≤ 1 → fitScore MUST be ≤ maxFitScoreIfLow (48). NEVER give 80–100.
   - level "mixed" → fitScore MUST be ≤ maxFitScoreIfMixed (68).
   - Roles with Low local-hire MUST rank below High/Fair local-hire when profession fit is similar.
2) EXPECTED SALARY: Prefer higher rankSignals.expectedSalary.proposeTargetMonthlyMop. Negative payDeviationPct should lower the score.
- Among two similar profession fits, better local-hire + higher expected propose salary MUST score higher.
- ruleMatchScore is a weak prior only.
- fitScore 0–100 integer. verdict: strong_fit | possible | weak_fit | not_recommended
- reasons: 2–3 short bullets — mention local-hire when Low/capped.
- blurb: max 140 chars.

Output ONLY valid JSON.`,
      },
      {
        role: "user",
        content: `SEEKER PROFILE:
${JSON.stringify(seekerPayload(youth, cv))}

JOBS TO SCORE (${jobs.length}) — each has rankSignals for local hiring + expected salary:
${JSON.stringify(jobs)}

Return JSON:
{
  "scores": [
    {
      "jobId": "exact id",
      "fitScore": 0,
      "verdict": "strong_fit|possible|weak_fit|not_recommended",
      "reasons": ["...", "..."],
      "blurb": "..."
    }
  ]
}
Include every jobId exactly once. Rank order implied by fitScore: profession first, then higher local hiring likelihood, then higher expected propose salary.`,
      },
    ],
  });

  const raw = completion.choices[0]?.message?.content || "";
  let text = raw.trim();
  if (text.startsWith("```")) {
    text = text.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  }
  const parsed = JSON.parse(text) as {
    scores?: {
      jobId?: string;
      fitScore?: number;
      verdict?: string;
      reasons?: string[];
      blurb?: string;
    }[];
  };

  return (parsed.scores || []).map((s) => ({
    jobId: String(s.jobId || ""),
    fitScore: Number(s.fitScore) || 0,
    verdict: String(s.verdict || "possible"),
    reasons: Array.isArray(s.reasons)
      ? s.reasons.map(String).filter(Boolean).slice(0, 4)
      : [],
    blurb: String(s.blurb || "").slice(0, 200),
  }));
}

/**
 * Primary entry: LLM match scores for shortlisted jobs.
 */
export async function generateLlmMatchScores(
  input: LlmMatchInput
): Promise<LlmMatchResult> {
  if (!isXaiConfigured()) {
    return buildHeuristicLlmMatch(input);
  }

  const client = createXaiClient();
  if (!client) return buildHeuristicLlmMatch(input);

  const cv = cvFromYouth(input.youth, input.cv);
  const maxJobs = Math.min(40, Math.max(8, input.maxJobs ?? 30));

  // Shortlist with local-hire / pay caps so Low local-hire doesn't dominate the pool
  const allRule = applyLocalHireAndSalaryToMatchResults(
    matchJobsWithCv(input.youth, input.jobs, cv),
    input.youth,
    input.benchmarks,
    (job) =>
      input.workforceByJobId?.[job.id] ??
      lookupEmployerWorkforce(`${job.company} ${job.companyZh}`, job.sector),
    cv
  );
  const shortlist = allRule.slice(0, maxJobs);
  const byId = new Map(shortlist.map((r) => [r.job.id, r]));

  if (shortlist.length === 0) {
    return {
      scores: [],
      overview:
        input.lang === "zh" ? "沒有可配對職位。" : "No jobs to match.",
      provider: "xai",
      generatedAt: new Date().toISOString(),
      scoredCount: 0,
      poolSize: input.jobs.length,
    };
  }

  const signalMap = buildPoolSignals(
    shortlist.map((r) => r.job),
    input.youth,
    input
  );

  const payloads = shortlist.map((r) =>
    jobPayload(
      r.job,
      r.score,
      input.youth,
      cv,
      signalMap.get(r.job.id) || null
    )
  );

  const llmRows: {
    jobId: string;
    fitScore: number;
    verdict: string;
    reasons: string[];
    blurb: string;
  }[] = [];

  try {
    // Batch to stay within context / output limits
    for (let i = 0; i < payloads.length; i += BATCH_SIZE) {
      const chunk = payloads.slice(i, i + BATCH_SIZE);
      const rows = await llmScoreBatch(
        client,
        input.youth,
        cv,
        chunk,
        input.lang
      );
      llmRows.push(...rows);
    }
  } catch (err) {
    // Fall back entirely to rules if LLM fails mid-way with no results
    if (llmRows.length === 0) {
      const fb = buildHeuristicLlmMatch(input);
      const msg = err instanceof Error ? err.message : "LLM error";
      return {
        ...fb,
        overview:
          input.lang === "zh"
            ? `AI 配對暫時失敗（${msg}），已回退規則分數（含本地招聘／預期薪酬優先）。`
            : `AI matching failed (${msg}); showing rule scores (local-hire + expected salary priority).`,
      };
    }
  }

  const allowed: AiVerdict[] = [
    "strong_fit",
    "possible",
    "weak_fit",
    "not_recommended",
  ];
  const seen = new Set<string>();
  let scores: LlmMatchScore[] = [];

  for (const row of llmRows) {
    if (!row.jobId || seen.has(row.jobId) || !byId.has(row.jobId)) continue;
    seen.add(row.jobId);
    const match = byId.get(row.jobId)!;
    let verdict = (
      allowed.includes(row.verdict as AiVerdict)
        ? row.verdict
        : verdictFromScore(row.fitScore)
    ) as AiVerdict;

    const guarded = applyGuardrails(
      input.youth,
      match.job,
      cv,
      row.fitScore,
      verdict,
      row.reasons.length
        ? row.reasons
        : input.lang === "zh"
          ? match.reasonsZh
          : match.reasons
    );

    scores.push({
      jobId: row.jobId,
      fitScore: guarded.fitScore,
      verdict: guarded.verdict,
      reasons: guarded.reasons,
      blurb:
        row.blurb ||
        (input.lang === "zh"
          ? `AI 適合度 ${guarded.fitScore}`
          : `AI fit ${guarded.fitScore}`),
      ruleMatchScore: match.score,
      provider: "xai",
    });
  }

  // Any shortlist job missing from LLM response → rule fallback for that item
  for (const r of shortlist) {
    if (seen.has(r.job.id)) continue;
    const prof = assessProfessionFit(input.youth, r.job, cv);
    let fitScore = r.score;
    if (prof.credentialBlock) fitScore = Math.min(fitScore, 18);
    else if (prof.hardMismatch) fitScore = Math.min(fitScore, 28);
    scores.push({
      jobId: r.job.id,
      fitScore,
      verdict: verdictFromScore(fitScore),
      reasons:
        input.lang === "zh" ? r.reasonsZh.slice(0, 3) : r.reasons.slice(0, 3),
      blurb:
        input.lang === "zh"
          ? `規則備援 ${fitScore}`
          : `Rule fallback ${fitScore}`,
      ruleMatchScore: r.score,
      provider: "heuristic",
    });
  }

  // Deterministic re-blend: local hiring + expected salary among profession-safe fits
  scores = applyLocalHireSalaryBlend(
    scores,
    shortlist,
    input.youth,
    cv,
    signalMap
  );

  scores.sort((a, b) => b.fitScore - a.fitScore);
  scores.forEach((s, i) => {
    s.rank = i + 1;
    // Keep hard not_recommended from guardrails; refresh others from blended score
    if (s.verdict !== "not_recommended") {
      s.verdict = verdictFromScore(s.fitScore);
    }
  });

  const strong = scores.filter((s) => s.fitScore >= 70).length;
  const overview =
    input.lang === "zh"
      ? `已用 Grok 對 ${scores.length} 個職位（從 ${input.jobs.length} 個公開空缺中預篩）打分：專業適合度優先，其次本地招聘可能性與可提出的預期薪酬。其中 ${strong} 個適合度 ≥ 70。`
      : `Grok scored ${scores.length} roles (shortlisted from ${input.jobs.length} public vacancies): profession fit first, then local hiring likelihood and higher expected proposed salary. ${strong} scored ≥ 70.`;

  return {
    scores,
    overview,
    provider: "xai",
    model: XAI_MODEL,
    generatedAt: new Date().toISOString(),
    scoredCount: scores.length,
    poolSize: input.jobs.length,
  };
}
