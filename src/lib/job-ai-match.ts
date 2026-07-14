/**
 * LLM-first job ↔ seeker matching (speed-tuned).
 * One compact Grok call over a short shortlist + local guardrails.
 */

import type { JobPosting, Lang, YouthProfile } from "./types";
import type { CvFeatures } from "./cv-extract";
import type { AiVerdict } from "./job-ai-types";
import type { EmployerWorkforce } from "./employer-transparency";
import type { SectorWageBenchmark } from "./wage-benchmark";
import { matchJobsWithCv } from "./cv-match";
import { assessProfessionFit } from "./profession-fit";
import {
  createXaiClient,
  isXaiConfigured,
  XAI_MATCH_MODEL,
} from "./xai";
import {
  applyLocalHireAndSalaryToMatchResults,
  computeJobRankSignals,
  finalizeMatchScore,
  type JobRankSignals,
} from "./match-rank-signals";
import { lookupEmployerWorkforce } from "./employer-transparency";

export interface LlmMatchScore {
  jobId: string;
  fitScore: number;
  verdict: AiVerdict;
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
  scoredCount: number;
  poolSize: number;
  /** Wall time for debugging / UI */
  durationMs?: number;
}

export interface LlmMatchInput {
  youth: YouthProfile;
  jobs: JobPosting[];
  lang: Lang;
  /** Max jobs to send to the LLM (default 12, hard cap 20) */
  maxJobs?: number;
  cv?: CvFeatures | null;
  workforceByJobId?: Record<string, EmployerWorkforce | null | undefined>;
  benchmarks?: Record<string, SectorWageBenchmark> | null;
}

/** Prefer a single API call — larger batches are slower and more failure-prone */
const LLM_BATCH_SIZE = 16;
/** Default shortlist size — one Grok call, good latency/quality tradeoff */
const DEFAULT_MAX_LLM_JOBS = 8;
const HARD_MAX_LLM_JOBS = 16;

/** Short-lived server cache: same youth + shortlist → reuse scores */
const matchCache = new Map<
  string,
  { at: number; result: LlmMatchResult }
>();
const MATCH_CACHE_TTL_MS = 8 * 60 * 1000;
const MATCH_CACHE_MAX = 40;

function cvFromYouth(
  youth: YouthProfile,
  cv?: CvFeatures | null
): CvFeatures | null {
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
    languages: (youth.languages || []).slice(0, 6),
    skills: (youth.skills || []).slice(0, 12),
    preferredLanes: youth.preferredLanes,
    preferredSectors: youth.preferredSectors,
    district: youth.district,
    educationLevel: cv?.educationLevel || youth.cv?.features?.educationLevel,
    careerStage: cv?.careerStage,
    experienceYears: cv?.experienceYears,
    cvSkills: (cv?.skills || []).slice(0, 12),
    cvKeywords: (cv?.keywords || []).slice(0, 12),
    cvSummary: (cv?.summary || youth.bio || "").slice(0, 280),
  };
}

/** Compact job card for LLM — small tokens, still enough for fit. */
function jobPayload(
  job: JobPosting,
  ruleScore: number,
  youth: YouthProfile,
  cv: CvFeatures | null,
  rankSignals: JobRankSignals | null | undefined,
  lang: Lang
) {
  const prof = assessProfessionFit(youth, job, cv);
  const desc =
    lang === "zh"
      ? (job.descriptionZh || job.description || "").slice(0, 280)
      : (job.description || job.descriptionZh || "").slice(0, 280);
  return {
    id: job.id,
    title: lang === "zh" ? job.titleZh || job.title : job.title,
    company: lang === "zh" ? job.companyZh || job.company : job.company,
    sector: job.sector,
    lane: job.lane,
    pay:
      job.payMin || job.payMax
        ? `${job.payMin || "?"}-${job.payMax || "?"} ${job.payUnit}`
        : null,
    skills: (job.skills || []).slice(0, 6),
    req: (job.requirements || []).slice(0, 4),
    desc,
    src: job.source,
    rule: ruleScore,
    prof: {
      hard: prof.hardMismatch,
      cred: prof.credentialBlock,
      miss: (prof.credentials?.missing || []).slice(0, 3),
      domains: (prof.jobDomains || []).slice(0, 4),
    },
    local: rankSignals
      ? {
          level: rankSignals.localHireLevel,
          steps: rankSignals.localHireSteps,
          raw: rankSignals.localHireRaw,
          payDev: rankSignals.payDeviationPct,
          propose: rankSignals.expectedProposeMonthly,
        }
      : null,
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
        input.workforceByJobId?.[job.id],
        { fast: true }
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
    (r) =>
      signalMap.get(r.job.id) ||
      computeJobRankSignals(r.job, youth, null, null, { fast: true })
  );
  const byId = new Map(shortlist.map((r) => [r.job.id, r.job]));

  return scores.map((s) => {
    const job = byId.get(s.jobId);
    const sig = signalMap.get(s.jobId);
    if (!job || !sig) return s;
    const fin = finalizeMatchScore(s.fitScore, job, sig, pool, youth, cv);
    const reasons = [...s.reasons];
    if (
      fin.reasonEn &&
      !reasons.some((r) => r.includes("Local hiring") || r.includes("本地招聘"))
    ) {
      reasons.unshift(
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
    if (
      prof.reasonsEn[0] &&
      !rs.some(
        (r) =>
          r.includes("credential") ||
          r.includes("licence") ||
          r.includes("資格")
      )
    ) {
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

function cacheKey(input: LlmMatchInput, shortlistIds: string[]): string {
  const y = input.youth;
  const cvBits = [
    y.id,
    y.age,
    (y.skills || []).slice(0, 8).join(","),
    (y.preferredSectors || []).join(","),
    (input.cv?.skills || []).slice(0, 8).join(","),
    (input.cv?.summary || "").slice(0, 40),
    input.lang,
  ].join("|");
  return `${cvBits}::${shortlistIds.join(",")}`;
}

function getCached(key: string): LlmMatchResult | null {
  const hit = matchCache.get(key);
  if (!hit) return null;
  if (Date.now() - hit.at > MATCH_CACHE_TTL_MS) {
    matchCache.delete(key);
    return null;
  }
  return { ...hit.result, generatedAt: new Date().toISOString() };
}

function setCache(key: string, result: LlmMatchResult) {
  if (matchCache.size >= MATCH_CACHE_MAX) {
    const oldest = [...matchCache.entries()].sort((a, b) => a[1].at - b[1].at)[0];
    if (oldest) matchCache.delete(oldest[0]);
  }
  matchCache.set(key, { at: Date.now(), result });
}

/** Heuristic fallback */
export function buildHeuristicLlmMatch(input: LlmMatchInput): LlmMatchResult {
  const t0 = Date.now();
  const cv = cvFromYouth(input.youth, input.cv);
  const maxJobs = Math.min(
    HARD_MAX_LLM_JOBS,
    Math.max(6, input.maxJobs ?? DEFAULT_MAX_LLM_JOBS)
  );

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
        ? "規則配對（未呼叫 Grok 或已回退）。本地招聘「低」有分數上限。"
        : "Rule ranking (Grok not used or unavailable). Low local-hire scores are capped.",
    provider: "heuristic",
    generatedAt: new Date().toISOString(),
    scoredCount: scores.length,
    poolSize: input.jobs.length,
    durationMs: Date.now() - t0,
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
      ? "reasons/blurb in Traditional Chinese."
      : "reasons/blurb in English.";

  // Compact system prompt = fewer tokens & faster time-to-first-token
  const completion = await client.chat.completions.create({
    model: XAI_MATCH_MODEL,
    temperature: 0,
    max_tokens: Math.min(1400, 120 + jobs.length * 90),
    response_format: { type: "json_object" },
    messages: [
      {
        role: "system",
        content: `Macau youth job scorer. Score EACH job vs seeker. ${langLine}
Rules: profession/credentials first. prof.cred or miss→fit≤18 not_recommended. prof.hard→fit≤28.
Local hire: local.level low→fit≤48; mixed→fit≤68. Prefer higher local.steps & propose when profession fits.
No keyword spam. JSON only:
{"scores":[{"jobId":"","fitScore":0,"verdict":"strong_fit|possible|weak_fit|not_recommended","reasons":["…"],"blurb":"≤100 chars"}]}
Include every jobId once.`,
      },
      {
        role: "user",
        content: JSON.stringify({
          seeker: seekerPayload(youth, cv),
          jobs,
        }),
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
      ? s.reasons.map(String).filter(Boolean).slice(0, 3)
      : [],
    blurb: String(s.blurb || "").slice(0, 140),
  }));
}

/**
 * Primary entry: LLM match scores for shortlisted jobs (fast path).
 */
export async function generateLlmMatchScores(
  input: LlmMatchInput
): Promise<LlmMatchResult> {
  const t0 = Date.now();
  if (!isXaiConfigured()) {
    return buildHeuristicLlmMatch(input);
  }

  const client = createXaiClient();
  if (!client) return buildHeuristicLlmMatch(input);

  const cv = cvFromYouth(input.youth, input.cv);
  const maxJobs = Math.min(
    HARD_MAX_LLM_JOBS,
    Math.max(6, input.maxJobs ?? DEFAULT_MAX_LLM_JOBS)
  );

  // Rule rank only a pre-trimmed pool (full 1000-job scan + signals was slow)
  const rulePool = matchJobsWithCv(input.youth, input.jobs, cv).slice(
    0,
    Math.min(input.jobs.length, maxJobs * 3 + 12)
  );
  const allRule = applyLocalHireAndSalaryToMatchResults(
    rulePool,
    input.youth,
    input.benchmarks,
    (job) =>
      input.workforceByJobId?.[job.id] ??
      lookupEmployerWorkforce(`${job.company} ${job.companyZh}`, job.sector),
    cv
  );

  // Split: blocked jobs skip LLM (saves tokens & time)
  const candidates = allRule.filter((r) => {
    const p = assessProfessionFit(input.youth, r.job, cv);
    return !p.credentialBlock && !p.hardMismatch;
  });
  const blocked = allRule.filter((r) => {
    const p = assessProfessionFit(input.youth, r.job, cv);
    return p.credentialBlock || p.hardMismatch;
  });

  const shortlist = candidates.slice(0, maxJobs);
  const byId = new Map(allRule.map((r) => [r.job.id, r]));

  if (shortlist.length === 0) {
    // Only blocked / empty pool — return heuristic top
    const fb = buildHeuristicLlmMatch(input);
    return { ...fb, durationMs: Date.now() - t0 };
  }

  const signalMap = buildPoolSignals(
    shortlist.map((r) => r.job),
    input.youth,
    input
  );

  const key = cacheKey(
    input,
    shortlist.map((r) => r.job.id)
  );
  const cached = getCached(key);
  if (cached) {
    return {
      ...cached,
      overview:
        (input.lang === "zh" ? "（快取）" : "(cached) ") + cached.overview,
      durationMs: Date.now() - t0,
    };
  }

  const payloads = shortlist.map((r) =>
    jobPayload(
      r.job,
      r.score,
      input.youth,
      cv,
      signalMap.get(r.job.id),
      input.lang
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
    // Prefer ONE call. Only split if above batch size (rare with max 16–20).
    const chunks: (typeof payloads)[] = [];
    for (let i = 0; i < payloads.length; i += LLM_BATCH_SIZE) {
      chunks.push(payloads.slice(i, i + LLM_BATCH_SIZE));
    }
    // Parallel max 2 chunks if ever split
    const results = await Promise.all(
      chunks.map((chunk) =>
        llmScoreBatch(client, input.youth, cv, chunk, input.lang)
      )
    );
    for (const rows of results) llmRows.push(...rows);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "LLM error";
    console.error("[job-ai-match] Grok batch failed:", msg);
    if (llmRows.length === 0) {
      const fb = buildHeuristicLlmMatch(input);
      return {
        ...fb,
        overview:
          input.lang === "zh"
            ? `Grok 呼叫失敗（${msg}），已回退規則分數。`
            : `Grok call failed (${msg}); showing rule scores.`,
        durationMs: Date.now() - t0,
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
    const verdict = (
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

  // Missing from LLM + blocked professions → rule scores
  for (const r of [...shortlist, ...blocked.slice(0, 8)]) {
    if (seen.has(r.job.id)) continue;
    seen.add(r.job.id);
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
    if (s.verdict !== "not_recommended") {
      s.verdict = verdictFromScore(s.fitScore);
    }
  });

  const strong = scores.filter((s) => s.fitScore >= 70).length;
  const ms = Date.now() - t0;
  const overview =
    input.lang === "zh"
      ? `Grok（${XAI_MATCH_MODEL}）已對 ${shortlist.length} 個職位打分（預篩自 ${input.jobs.length}），約 ${Math.round(ms / 100) / 10}s。其中 ${strong} 個 ≥ 70。`
      : `Grok (${XAI_MATCH_MODEL}) scored ${shortlist.length} roles (from ${input.jobs.length}) in ~${Math.round(ms / 100) / 10}s. ${strong} scored ≥ 70.`;

  const result: LlmMatchResult = {
    scores,
    overview,
    provider: "xai",
    model: XAI_MATCH_MODEL,
    generatedAt: new Date().toISOString(),
    scoredCount: scores.length,
    poolSize: input.jobs.length,
    durationMs: ms,
  };
  setCache(key, result);
  return result;
}
