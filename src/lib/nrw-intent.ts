/**
 * Local Hiring Likelihood (pilot)
 * --------------------------------
 * Helps Macau youth read whether a vacancy *looks more like* a competitive
 * local hire, or more like a weak formal ad (sometimes used around
 * non-resident labour pathways).
 *
 * Combines pay vs DSAL/sector median + firm NRW share (A3) + channel/ad cues.
 * Not legal proof — research heuristic only.
 */

import type { JobPosting, Sector } from "./types";
import type { EmployerWorkforce } from "./employer-transparency";
import {
  compareJobToBenchmark,
  type SectorWageBenchmark,
} from "./wage-benchmark";

/** How likely this ad looks competitive for local (resident) applicants */
export type LocalHireLevel =
  | "high"
  | "fair"
  | "mixed"
  | "low"
  | "unknown";

/** @deprecated use LocalHireLevel */
export type NrwIntentLevel = LocalHireLevel;

export interface LocalHireFactor {
  id: string;
  /** Positive = supports local hiring; negative = pulls likelihood down */
  impact: number;
  labelEn: string;
  labelZh: string;
}

export interface LocalHiringAssessment {
  /**
   * Seeker-facing scale: 1–4 filled steps (never a raw 0–100).
   * 4 = High local-hire likelihood, 1 = Low.
   */
  steps: 1 | 2 | 3 | 4;
  level: LocalHireLevel;
  /** Short chip text */
  labelEn: string;
  labelZh: string;
  /** One-line plain explanation */
  summaryEn: string;
  summaryZh: string;
  factors: LocalHireFactor[];
  payDeviationPct: number | null;
  firmForeignSharePct: number | null;
  firmConfidence: EmployerWorkforce["confidence"] | null;
  disclaimerEn: string;
  disclaimerZh: string;
  /** Internal only (debug); not shown as “score/100” */
  _rawLocal: number;
}

/** Back-compat shape for older imports */
export type NrwIntentFactor = LocalHireFactor & { points: number };
export type NrwIntentAssessment = LocalHiringAssessment & {
  score: number;
  factors: NrwIntentFactor[];
};

const SECTOR_NRW_PRIOR: Partial<Record<Sector, number>> = {
  hospitality: 8,
  fnb: 6,
  retail: 4,
  mice: 5,
  other: 3,
  "big-health": 2,
  finance: 1,
  tech: 1,
  education: 0,
};

function clamp(n: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, n));
}

/**
 * Map internal 0–100 local-hire strength → 4 clear seeker tiers.
 * Higher raw = more local-hire friendly.
 */
function toLevel(rawLocal: number, hasData: boolean): {
  level: LocalHireLevel;
  steps: 1 | 2 | 3 | 4;
  labelEn: string;
  labelZh: string;
  summaryEn: string;
  summaryZh: string;
} {
  if (!hasData) {
    return {
      level: "unknown",
      steps: 2,
      labelEn: "Unclear",
      labelZh: "資料不足",
      summaryEn: "Not enough pay / employer data to judge local-hire friendliness.",
      summaryZh: "薪酬或僱主資料不足，暫難判斷對本地求職的吸引力。",
    };
  }
  if (rawLocal >= 72) {
    return {
      level: "high",
      steps: 4,
      labelEn: "High",
      labelZh: "高",
      summaryEn:
        "Pay and employer mix look relatively friendly to local applicants.",
      summaryZh: "薪酬與僱主人手結構相對有利本地求職者。",
    };
  }
  if (rawLocal >= 52) {
    return {
      level: "fair",
      steps: 3,
      labelEn: "Fair",
      labelZh: "尚可",
      summaryEn:
        "Some positives for locals, but check pay and firm workforce mix.",
      summaryZh: "對本地有一定吸引力，但仍應核對薪酬與企業外勞佔比。",
    };
  }
  if (rawLocal >= 32) {
    return {
      level: "mixed",
      steps: 2,
      labelEn: "Mixed",
      labelZh: "一般",
      summaryEn:
        "Mixed cues — may be a weaker local offer; compare pay and NRW share.",
      summaryZh: "訊號好壞參半——本地吸引力可能偏弱，請比對薪酬與外勞佔比。",
    };
  }
  return {
    level: "low",
    steps: 1,
    labelEn: "Low",
    labelZh: "偏低",
    summaryEn:
      "Looks less competitive for residents (weak pay and/or high non-resident workforce).",
    summaryZh: "對本地居民吸引力偏低（薪酬偏弱及／或企業外勞佔比較高）。",
  };
}

/**
 * Local Hiring Likelihood for a job listing.
 * Positive factor impact = good for local seekers.
 */
export function assessLocalHiringLikelihood(
  job: JobPosting,
  benchmarks: Record<Sector, SectorWageBenchmark>,
  workforce?: EmployerWorkforce | null
): LocalHiringAssessment {
  const factors: LocalHireFactor[] = [];
  // Start neutral-high; drag down with risk cues, lift with competitive cues
  let raw = 58;

  const cmp = compareJobToBenchmark(job, benchmarks);
  const payDev =
    cmp?.hasListingPay && Number.isFinite(cmp.deviationPct)
      ? cmp.deviationPct
      : null;

  // ── Pay (primary for local applicants) ────────────────────────────
  if (payDev != null) {
    if (payDev <= -25) {
      raw -= 26;
      factors.push({
        id: "pay_far_below",
        impact: -26,
        labelEn: "Pay well below sector median — hard for locals to take",
        labelZh: "薪酬遠低於行業中位——本地較難接受",
      });
    } else if (payDev <= -15) {
      raw -= 16;
      factors.push({
        id: "pay_below",
        impact: -16,
        labelEn: "Pay below sector median",
        labelZh: "薪酬低於行業中位",
      });
    } else if (payDev <= -8) {
      raw -= 8;
      factors.push({
        id: "pay_slightly_below",
        impact: -8,
        labelEn: "Pay slightly below median",
        labelZh: "薪酬略低於中位",
      });
    } else if (payDev >= 5) {
      raw += 14;
      factors.push({
        id: "pay_competitive",
        impact: 14,
        labelEn: "Pay at or above median — stronger for local applicants",
        labelZh: "薪酬達／高於中位——較有利本地",
      });
    } else {
      raw += 4;
      factors.push({
        id: "pay_near",
        impact: 4,
        labelEn: "Pay near sector median",
        labelZh: "薪酬接近行業中位",
      });
    }

    if (cmp?.vsBand === "below_p25") {
      raw -= 8;
      factors.push({
        id: "pay_below_p25",
        impact: -8,
        labelEn: "In the lower quarter of official-sample pay",
        labelZh: "落在官方樣本薪酬較低四分位",
      });
    } else if (cmp?.vsBand === "above_p75") {
      raw += 6;
      factors.push({
        id: "pay_above_p75",
        impact: 6,
        labelEn: "In the upper quarter of official-sample pay",
        labelZh: "落在官方樣本薪酬較高四分位",
      });
    }
  } else {
    raw -= 6;
    factors.push({
      id: "pay_missing",
      impact: -6,
      labelEn: "No clear pay shown",
      labelZh: "未標示清楚薪酬",
    });
  }

  // ── Firm non-resident share ───────────────────────────────────────
  const foreign = workforce?.foreignSharePct ?? null;
  const conf = workforce?.confidence ?? null;
  const confW =
    conf === "reported" ? 1 : conf === "estimated" ? 0.75 : 0.45;

  if (foreign != null) {
    if (foreign >= 45) {
      const d = Math.round(22 * confW);
      raw -= d;
      factors.push({
        id: "firm_nrw_very_high",
        impact: -d,
        labelEn: `Employer non-resident share ~${foreign}% — fewer local seats historically`,
        labelZh: `僱主外地僱員約 ${foreign}%——本地席位往往較少`,
      });
    } else if (foreign >= 30) {
      const d = Math.round(14 * confW);
      raw -= d;
      factors.push({
        id: "firm_nrw_high",
        impact: -d,
        labelEn: `Employer non-resident share ~${foreign}%`,
        labelZh: `僱主外地僱員約 ${foreign}%`,
      });
    } else if (foreign >= 20) {
      const d = Math.round(7 * confW);
      raw -= d;
      factors.push({
        id: "firm_nrw_moderate",
        impact: -d,
        labelEn: `Employer non-resident share ~${foreign}% (moderate)`,
        labelZh: `僱主外地僱員約 ${foreign}%（中等）`,
      });
    } else if (foreign <= 12 && conf === "reported") {
      raw += 14;
      factors.push({
        id: "firm_local_heavy",
        impact: 14,
        labelEn: `Employer non-resident share only ~${foreign}% (A3) — more local-heavy`,
        labelZh: `僱主外地僱員僅約 ${foreign}%（A3）——本地為主`,
      });
    } else if (foreign < 20) {
      raw += 6;
      factors.push({
        id: "firm_local_ok",
        impact: 6,
        labelEn: `Employer non-resident share ~${foreign}% (relatively local)`,
        labelZh: `僱主外地僱員約 ${foreign}%（相對偏本地）`,
      });
    }
  }

  // Low pay + high NRW firm
  if (payDev != null && payDev <= -12 && foreign != null && foreign >= 30) {
    const d = Math.round(12 * confW);
    raw -= d;
    factors.push({
      id: "pay_x_nrw",
      impact: -d,
      labelEn: "Below-market pay + high firm non-resident share",
      labelZh: "薪酬偏低且企業外勞佔比高",
    });
  }

  // Competitive pay + local-heavy firm
  if (payDev != null && payDev >= 0 && foreign != null && foreign <= 18) {
    raw += 8;
    factors.push({
      id: "pay_x_local",
      impact: 8,
      labelEn: "Fair pay with a more local workforce mix",
      labelZh: "薪酬尚可且人手較偏本地",
    });
  }

  // ── Channel ───────────────────────────────────────────────────────
  if (job.source === "dsal") {
    // Official board alone is neutral-ish; low pay on DSAL is worse for locals
    if (payDev != null && payDev <= -15) {
      raw -= 10;
      factors.push({
        id: "dsal_low_pay",
        impact: -10,
        labelEn: "Official DSAL ad with below-market pay",
        labelZh: "勞工局官方空缺但薪酬偏低",
      });
    } else if (payDev != null && payDev >= 0) {
      raw += 5;
      factors.push({
        id: "dsal_ok_pay",
        impact: 5,
        labelEn: "Official DSAL ad with competitive pay",
        labelZh: "勞工局官方空缺且薪酬具競爭力",
      });
    }
  } else if (job.source === "jobscall" || job.source === "hellojobs") {
    if (payDev != null && payDev <= -15) {
      // Commercial market under-pay ≠ formality; mild drag only
      raw -= 3;
      factors.push({
        id:
          job.source === "hellojobs" ? "hellojobs_market" : "jobscall_market",
        impact: -3,
        labelEn:
          job.source === "hellojobs"
            ? "Hello-Jobs commercial ad (below DSAL-sample median is common for SMEs)"
            : "Jobscall commercial ad (below DSAL-sample median is common for SMEs)",
        labelZh:
          job.source === "hellojobs"
            ? "Hello-Jobs 商業廣告（低於勞工局樣本中位在中小企常見）"
            : "Jobscall 商業廣告（低於勞工局樣本中位在中小企常見）",
      });
    }
  }

  if ((job.openings || 0) >= 5 && payDev != null && payDev <= -10) {
    raw -= 5;
    factors.push({
      id: "many_openings_low_pay",
      impact: -5,
      labelEn: `Many openings (${job.openings}) with soft pay`,
      labelZh: `名額多（${job.openings}）但薪酬偏軟`,
    });
  }

  const descLen =
    (job.description || "").length + (job.descriptionZh || "").length;
  const reqCount =
    (job.requirements?.length || 0) + (job.requirementsZh?.length || 0);
  if (descLen < 80 && reqCount <= 1) {
    raw -= 6;
    factors.push({
      id: "thin_ad",
      impact: -6,
      labelEn: "Very thin job description",
      labelZh: "職位描述過簡",
    });
  }

  const sectorDrag = SECTOR_NRW_PRIOR[job.sector] ?? 2;
  if (sectorDrag >= 4) {
    raw -= Math.min(6, sectorDrag - 2);
    factors.push({
      id: "sector_prior",
      impact: -(Math.min(6, sectorDrag - 2)),
      labelEn: "Sector often relies more on non-resident labour",
      labelZh: "此行業較常使用外地僱員",
    });
  }

  if (job.youthFriendly) {
    raw += 6;
    factors.push({
      id: "youth_friendly",
      impact: 6,
      labelEn: "Marked youth-friendly",
      labelZh: "標示青年友善",
    });
  }
  if (job.trainingProvided) {
    raw += 5;
    factors.push({
      id: "training",
      impact: 5,
      labelEn: "Training provided",
      labelZh: "提供培訓",
    });
  }

  raw = clamp(Math.round(raw), 0, 100);
  const hasData =
    payDev != null ||
    foreign != null ||
    job.source === "dsal" ||
    job.source === "jobscall" ||
    job.source === "hellojobs";

  const tier = toLevel(raw, hasData);

  const shown = factors
    .filter((f) => Math.abs(f.impact) >= 4)
    .sort((a, b) => Math.abs(b.impact) - Math.abs(a.impact))
    .slice(0, 6);

  return {
    steps: tier.steps,
    level: tier.level,
    labelEn: tier.labelEn,
    labelZh: tier.labelZh,
    summaryEn: tier.summaryEn,
    summaryZh: tier.summaryZh,
    factors: shown,
    payDeviationPct: payDev != null ? Math.round(payDev * 10) / 10 : null,
    firmForeignSharePct: foreign,
    firmConfidence: conf,
    disclaimerEn:
      "Pilot guide for job seekers — not a prediction that you will be hired, and not proof about how a firm treats residents. Combines posted pay, firm non-resident share (when known), and ad cues.",
    disclaimerZh:
      "求職參考試點——不能預測你是否獲聘，亦不能證明僱主對本地人的態度。綜合標示薪酬、企業外地僱員佔比（如有）與廣告線索。",
    _rawLocal: raw,
  };
}

/** @deprecated use assessLocalHiringLikelihood */
export function assessNrwIntent(
  job: JobPosting,
  benchmarks: Record<Sector, SectorWageBenchmark>,
  workforce?: EmployerWorkforce | null
): NrwIntentAssessment {
  const a = assessLocalHiringLikelihood(job, benchmarks, workforce);
  return {
    ...a,
    score: a._rawLocal,
    factors: a.factors.map((f) => ({
      ...f,
      points: f.impact,
    })),
  };
}
