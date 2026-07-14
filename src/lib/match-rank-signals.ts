/**
 * Ranking signals for smart match:
 * 1) Local Hiring Likelihood (prefer higher — hard caps when Low/Mixed)
 * 2) Expected salary the seeker can propose (prefer higher)
 *
 * Used by LLM prompts, rule matching, and deterministic post-score blending.
 */

import type { JobPosting, MatchResult, Sector, YouthProfile } from "./types";
import type { EmployerWorkforce } from "./employer-transparency";
import {
  compareJobToBenchmark,
  STANDARD_MONTHLY_HOURS,
  type SectorWageBenchmark,
} from "./wage-benchmark";
import { assessLocalHiringLikelihood } from "./nrw-intent";
import { buildHeuristicSalaryAdvice } from "./salary-negotiate";
import { assessProfessionFit } from "./profession-fit";
import type { CvFeatures } from "./cv-extract";

export interface JobRankSignals {
  jobId: string;
  /** 0–100 local-hire strength (higher = better for local seekers) */
  localHireRaw: number;
  localHireSteps: 1 | 2 | 3 | 4;
  localHireLevel: string;
  /** Expected salary target the seeker could propose, monthly MOP-equivalent */
  expectedProposeMonthly: number;
  /** Listed mid pay monthly when known; else 0 */
  listingMidMonthly: number;
  hasListingPay: boolean;
  /** % vs sector median (negative = below market) */
  payDeviationPct: number | null;
  localSharePct: number | null;
  foreignSharePct: number | null;
}

/** Hard ceiling so Low local-hire never displays as “perfect match” */
export const LOCAL_HIRE_SCORE_CAPS = {
  /** Low (1/4) — weak for residents */
  low: 48,
  /** Mixed (2/4) */
  mixed: 68,
  /** Far below market pay (≤ −25%) extra ceiling even if steps higher */
  payFarBelow: 55,
  /** Below market (≤ −15%) soft ceiling */
  payBelow: 72,
} as const;

export function listingMidMonthly(job: JobPosting): number {
  if (!(job.payMin > 0 || job.payMax > 0)) return 0;
  const lo = job.payMin > 0 ? job.payMin : job.payMax;
  const hi = job.payMax > 0 ? job.payMax : job.payMin;
  const mid = (lo + hi) / 2;
  if (job.payUnit === "hourly") return mid * STANDARD_MONTHLY_HOURS;
  return mid;
}

/**
 * Compute local-hire + expected-propose signals for one job.
 * @param opts.fast - skip full salary-negotiate heuristic (Smart Match speed path)
 */
export function computeJobRankSignals(
  job: JobPosting,
  youth: YouthProfile | null,
  benchmarks:
    | Record<Sector, SectorWageBenchmark>
    | Record<string, SectorWageBenchmark>
    | null
    | undefined,
  workforce?: EmployerWorkforce | null,
  opts?: { fast?: boolean }
): JobRankSignals {
  const bm = (benchmarks || {}) as Record<Sector, SectorWageBenchmark>;
  const local = assessLocalHiringLikelihood(job, bm, workforce ?? null);
  const cmp = compareJobToBenchmark(job, bm);
  const listingMid = cmp?.hasListingPay
    ? cmp.listingMidMonthly
    : listingMidMonthly(job);
  const payDeviationPct =
    cmp?.hasListingPay && Number.isFinite(cmp.deviationPct)
      ? cmp.deviationPct
      : null;

  // Prefer listing mid; only run full negotiate heuristic when needed
  // (fast path for Smart Match ranking — avoid per-job negotiate cost)
  let expectedProposeMonthly = listingMid || 0;
  if (!opts?.fast) {
    try {
      const advice = buildHeuristicSalaryAdvice({
        job,
        youth,
        lang: "en",
        benchmarks: bm as Record<string, SectorWageBenchmark>,
      });
      expectedProposeMonthly =
        advice.unit === "hourly"
          ? advice.proposeTarget * STANDARD_MONTHLY_HOURS
          : advice.proposeTarget;
    } catch {
      /* keep listing mid */
    }
  } else if (listingMid > 0) {
    // Lightweight propose estimate: listing mid * mild education bump
    expectedProposeMonthly = listingMid;
  }

  if (listingMid > 0) {
    expectedProposeMonthly = Math.max(
      expectedProposeMonthly,
      listingMid * 0.98
    );
  }

  return {
    jobId: job.id,
    localHireRaw: local._rawLocal,
    localHireSteps: local.steps,
    localHireLevel: local.level,
    expectedProposeMonthly: Math.round(expectedProposeMonthly),
    listingMidMonthly: Math.round(listingMid || 0),
    hasListingPay: !!(cmp?.hasListingPay || listingMid > 0),
    payDeviationPct,
    localSharePct: workforce?.localSharePct ?? null,
    foreignSharePct: workforce?.foreignSharePct ?? null,
  };
}

/**
 * Compact fields to send into LLM job payloads.
 */
export function signalsForLlm(s: JobRankSignals) {
  return {
    localHiringLikelihood: {
      raw0to100: s.localHireRaw,
      steps1to4: s.localHireSteps,
      level: s.localHireLevel,
      firmLocalSharePct: s.localSharePct,
      firmForeignSharePct: s.foreignSharePct,
      /** Model must not give fitScore above this when level is low/mixed */
      maxFitScoreIfLow: LOCAL_HIRE_SCORE_CAPS.low,
      maxFitScoreIfMixed: LOCAL_HIRE_SCORE_CAPS.mixed,
    },
    expectedSalary: {
      proposeTargetMonthlyMop: s.expectedProposeMonthly,
      listingMidMonthlyMop: s.listingMidMonthly,
      hasListingPay: s.hasListingPay,
      payDeviationPct: s.payDeviationPct,
      note: "Higher proposeTargetMonthlyMop = stronger pay opportunity; negative payDeviation hurts local-hire rank",
    },
  };
}

/**
 * Hard ceilings from local-hire tier + pay vs market.
 * Profession-blocked roles stay even lower.
 */
export function localHireScoreCeiling(signals: JobRankSignals): number {
  let cap = 100;

  if (signals.localHireLevel === "low" || signals.localHireSteps <= 1) {
    // Unknown uses steps 2 in assessLocalHiring — only cap true Low
    if (signals.localHireLevel === "low") {
      cap = Math.min(cap, LOCAL_HIRE_SCORE_CAPS.low);
    }
  }
  if (signals.localHireLevel === "mixed" || signals.localHireSteps === 2) {
    if (signals.localHireLevel === "mixed") {
      cap = Math.min(cap, LOCAL_HIRE_SCORE_CAPS.mixed);
    }
  }

  if (signals.payDeviationPct != null) {
    if (signals.payDeviationPct <= -25) {
      cap = Math.min(cap, LOCAL_HIRE_SCORE_CAPS.payFarBelow);
    } else if (signals.payDeviationPct <= -15) {
      cap = Math.min(cap, LOCAL_HIRE_SCORE_CAPS.payBelow);
    }
  }

  return cap;
}

export interface FinalizeScoreResult {
  fitScore: number;
  reasonEn: string | null;
  reasonZh: string | null;
  capped: boolean;
  ceiling: number;
}

/**
 * After profession-fit scoring: blend local-hire + expected salary, then hard-cap.
 * Blocked credentials / hard profession mismatch cannot be rescued.
 */
export function blendFitWithLocalHireAndSalary(
  baseFitScore: number,
  job: JobPosting,
  signals: JobRankSignals,
  poolSignals: JobRankSignals[],
  youth: YouthProfile | null,
  cv?: CvFeatures | null
): number {
  return finalizeMatchScore(
    baseFitScore,
    job,
    signals,
    poolSignals,
    youth,
    cv
  ).fitScore;
}

/**
 * Full finalize with reasons for UI “Why this match”.
 */
export function finalizeMatchScore(
  baseFitScore: number,
  job: JobPosting,
  signals: JobRankSignals,
  poolSignals: JobRankSignals[],
  youth: YouthProfile | null,
  cv?: CvFeatures | null
): FinalizeScoreResult {
  const prof = youth
    ? assessProfessionFit(youth, job, cv ?? null)
    : null;
  if (prof?.credentialBlock) {
    return {
      fitScore: Math.min(baseFitScore, 18),
      reasonEn: "Missing regulated professional credential",
      reasonZh: "缺少所需專業執業資格",
      capped: true,
      ceiling: 18,
    };
  }
  if (prof?.hardMismatch) {
    return {
      fitScore: Math.min(baseFitScore, 28),
      reasonEn: "Profession domain mismatch with this role",
      reasonZh: "專業領域與此職位不匹配",
      capped: true,
      ceiling: 28,
    };
  }

  const proposes = poolSignals
    .map((p) => p.expectedProposeMonthly)
    .filter((n) => n > 0);
  const minP = proposes.length ? Math.min(...proposes) : 0;
  const maxP = proposes.length ? Math.max(...proposes) : 0;
  const range = maxP - minP;

  let salaryNorm = 50;
  if (signals.expectedProposeMonthly > 0 && range > 0) {
    salaryNorm = ((signals.expectedProposeMonthly - minP) / range) * 100;
  } else if (signals.expectedProposeMonthly > 0 && maxP > 0) {
    salaryNorm = 70;
  } else if (!signals.hasListingPay) {
    salaryNorm = 35;
  }

  // Local-hire weight enough to reorder rankings; hard ceiling stops “100 MATCH”
  const localNorm = Math.max(0, Math.min(100, signals.localHireRaw));
  // Soften profession inflation for weak local-hire ads (still keep profession signal)
  let base = baseFitScore;
  if (signals.localHireLevel === "low") {
    base = Math.min(base, 78);
  } else if (signals.localHireLevel === "mixed") {
    base = Math.min(base, 90);
  }

  let blended = base * 0.48 + localNorm * 0.32 + salaryNorm * 0.2;

  // Extra drag for deep under-market pay (moderate — ceiling does the hard stop)
  if (signals.payDeviationPct != null) {
    if (signals.payDeviationPct <= -30) blended -= 10;
    else if (signals.payDeviationPct <= -20) blended -= 7;
    else if (signals.payDeviationPct <= -12) blended -= 4;
    else if (signals.payDeviationPct >= 5) blended += 5;
  }

  // Bonus for high/fair so they clearly outrank Low at similar profession fit
  if (signals.localHireSteps >= 4) blended += 12;
  else if (signals.localHireSteps >= 3) blended += 7;
  else if (signals.localHireLevel === "low") blended -= 8;

  const ceiling = localHireScoreCeiling(signals);
  let fitScore = Math.max(0, Math.min(100, Math.round(blended)));
  const beforeCap = fitScore;
  fitScore = Math.min(fitScore, ceiling);

  // Floor: good profession fit + Low local-hire still looks like a partial match, not 0
  if (
    signals.localHireLevel === "low" &&
    baseFitScore >= 60 &&
    !prof?.hardMismatch
  ) {
    fitScore = Math.max(fitScore, 28);
    fitScore = Math.min(fitScore, ceiling);
  }

  const capped =
    fitScore < beforeCap ||
    fitScore <= ceiling &&
      ceiling < 100 &&
      baseFitScore > ceiling;

  let reasonEn: string | null = null;
  let reasonZh: string | null = null;
  if (signals.localHireLevel === "low") {
    reasonEn = `Local hiring likelihood Low (${signals.localHireSteps}/4) — match capped at ${ceiling}`;
    reasonZh = `本地招聘可能性偏低（${signals.localHireSteps}/4）——配對分上限 ${ceiling}`;
  } else if (signals.localHireLevel === "mixed") {
    reasonEn = `Local hiring likelihood Mixed (${signals.localHireSteps}/4) — match capped at ${ceiling}`;
    reasonZh = `本地招聘可能性一般（${signals.localHireSteps}/4）——配對分上限 ${ceiling}`;
  } else if (
    signals.payDeviationPct != null &&
    signals.payDeviationPct <= -15
  ) {
    reasonEn = `Listed pay ${Math.round(signals.payDeviationPct)}% vs sector median — lowers rank for local seekers`;
    reasonZh = `標示薪酬較行業中位 ${Math.round(signals.payDeviationPct)}%——本地吸引力較弱`;
  } else if (signals.localHireSteps >= 3) {
    reasonEn = `Local hiring likelihood ${signals.localHireLevel} (${signals.localHireSteps}/4) — boosted for residents`;
    reasonZh = `本地招聘可能性${signals.localHireLevel === "high" ? "高" : "尚可"}（${signals.localHireSteps}/4）——加分`;
  }

  return {
    fitScore,
    reasonEn,
    reasonZh,
    capped: capped || fitScore <= ceiling && ceiling < 100,
    ceiling,
  };
}

/**
 * Re-score a full MatchResult[] with local-hire + salary (client + server rules).
 */
export function applyLocalHireAndSalaryToMatchResults(
  results: MatchResult[],
  youth: YouthProfile,
  benchmarks:
    | Record<Sector, SectorWageBenchmark>
    | Record<string, SectorWageBenchmark>
    | null
    | undefined,
  workforceForJob?: (job: JobPosting) => EmployerWorkforce | null | undefined,
  cv?: CvFeatures | null
): MatchResult[] {
  if (!results.length) return results;

  const signalMap = new Map<string, JobRankSignals>();
  for (const r of results) {
    const wf = workforceForJob?.(r.job) ?? null;
    signalMap.set(
      r.job.id,
      computeJobRankSignals(r.job, youth, benchmarks, wf)
    );
  }
  const pool = [...signalMap.values()];

  const next = results.map((r) => {
    const sig = signalMap.get(r.job.id)!;
    const fin = finalizeMatchScore(r.score, r.job, sig, pool, youth, cv);
    const reasons = [...r.reasons];
    const reasonsZh = [...r.reasonsZh];
    if (fin.reasonEn) {
      reasons.unshift(fin.reasonEn);
      reasonsZh.unshift(fin.reasonZh || fin.reasonEn);
    }
    return {
      ...r,
      score: fin.fitScore,
      reasons: reasons.slice(0, 6),
      reasonsZh: reasonsZh.slice(0, 6),
      evidence: {
        ...(r.evidence || {
          strengths: [],
          gaps: [],
          constraints: [],
          nextSteps: [],
          confidence: "medium" as const,
          algorithmVersion: "rules-2026.07",
        }),
        gaps: fin.reasonEn
          ? [fin.reasonEn, ...(r.evidence?.gaps || [])].slice(0, 4)
          : r.evidence?.gaps || [],
        constraints: fin.capped
          ? [`Score ceiling: ${fin.ceiling}`, ...(r.evidence?.constraints || [])]
          : r.evidence?.constraints || [],
      },
    };
  });

  return next.sort((a, b) => b.score - a.score);
}

/**
 * Rule-engine boosts when full signal pack is available (optional).
 */
export function ruleScoreBoostFromSignals(
  job: JobPosting,
  signals?: JobRankSignals | null
): { delta: number; reasonEn: string | null; reasonZh: string | null } {
  let delta = 0;
  let reasonEn: string | null = null;
  let reasonZh: string | null = null;

  if (signals) {
    if (signals.localHireSteps >= 4) {
      delta += 12;
      reasonEn = "High local hiring likelihood";
      reasonZh = "本地招聘可能性高";
    } else if (signals.localHireSteps >= 3) {
      delta += 7;
      reasonEn = "Fair local hiring likelihood";
      reasonZh = "本地招聘可能性中上";
    } else if (signals.localHireLevel === "low") {
      delta -= 22;
      reasonEn = "Low local hiring likelihood — demoted for local seekers";
      reasonZh = "本地招聘可能性偏低——對本地求職降權";
    } else if (signals.localHireLevel === "mixed") {
      delta -= 8;
      reasonEn = "Mixed local hiring likelihood";
      reasonZh = "本地招聘可能性一般";
    }

    if (signals.payDeviationPct != null && signals.payDeviationPct <= -20) {
      delta -= 12;
    }

    if (signals.expectedProposeMonthly >= 20000) {
      delta += 8;
    } else if (signals.expectedProposeMonthly >= 15000) {
      delta += 4;
    } else if (
      signals.expectedProposeMonthly > 0 &&
      signals.expectedProposeMonthly < 10000
    ) {
      delta -= 6;
    }
  } else {
    const mid = listingMidMonthly(job);
    if (mid >= 18000) delta += 6;
    else if (mid >= 14000) delta += 4;
    else if (mid >= 10000) delta += 2;
    else if (mid > 0 && mid < 8000) delta -= 3;
  }

  return { delta, reasonEn, reasonZh };
}
