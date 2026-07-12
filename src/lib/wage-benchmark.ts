import type { JobPosting, Sector } from "./types";
import { sectorWageMap } from "./open-data";

/** Minimum sample size before we trust a DSAL-sample median as primary. */
export const MIN_SAMPLE_FOR_PRIMARY = 5;

/**
 * Hours used to convert hourly ↔ monthly for apples-to-apples comparison.
 * Macau full-time norm ≈ 8h × ~22 working days ≈ 176h/month.
 */
export const STANDARD_MONTHLY_HOURS = 176;

export type BenchmarkMethod =
  | "dsal_sample" // median of official vacancy midpoints in this sector
  | "static_reference" // DSEC-style static table (fallback)
  | "none";

export interface SectorWageBenchmark {
  sector: Sector;
  /** Canonical monthly MOP median used for comparison */
  medianMonthly: number;
  /** Canonical hourly MOP median (medianMonthly / STANDARD_MONTHLY_HOURS) */
  medianHourly: number;
  /** 25th / 75th percentile of monthly midpoints when sample-based */
  p25Monthly?: number;
  p75Monthly?: number;
  /** Jobs that contributed a valid pay midpoint */
  sampleSize: number;
  method: BenchmarkMethod;
  /** Human-readable method note (EN) */
  methodNoteEn: string;
  methodNoteZh: string;
}

export interface PayDeviation {
  /** Midpoint of the listing, normalized to monthly MOP */
  listingMidMonthly: number;
  listingMinMonthly: number;
  listingMaxMonthly: number;
  /** Benchmark monthly median */
  benchmarkMonthly: number;
  /** (listingMid - benchmark) / benchmark * 100 */
  deviationPct: number;
  /** listing mid vs IQR when available */
  vsBand: "below_p25" | "in_iqr" | "above_p75" | "unknown";
  benchmark: SectorWageBenchmark;
  /** Whether listing pay was usable */
  hasListingPay: boolean;
}

function finitePositive(n: number) {
  return Number.isFinite(n) && n > 0;
}

/** Midpoint of a posting's stated range, then convert to monthly MOP. */
export function listingToMonthly(job: JobPosting): {
  mid: number;
  min: number;
  max: number;
} | null {
  if (!finitePositive(job.payMin) && !finitePositive(job.payMax)) return null;
  const min = finitePositive(job.payMin)
    ? job.payMin
    : finitePositive(job.payMax)
      ? job.payMax
      : 0;
  const max = finitePositive(job.payMax)
    ? job.payMax
    : finitePositive(job.payMin)
      ? job.payMin
      : 0;
  if (min <= 0 && max <= 0) return null;

  const lo = Math.min(min, max);
  const hi = Math.max(min, max);
  const mid = (lo + hi) / 2;

  // Filter nonsense parses (e.g. 0–5) for monthly full-time roles
  if (job.payUnit === "monthly" && mid < 2000) return null;
  if (job.payUnit === "hourly" && mid > 500) return null;

  if (job.payUnit === "hourly") {
    return {
      mid: mid * STANDARD_MONTHLY_HOURS,
      min: lo * STANDARD_MONTHLY_HOURS,
      max: hi * STANDARD_MONTHLY_HOURS,
    };
  }
  return { mid, min: lo, max: hi };
}

export function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  if (sorted.length === 1) return sorted[0];
  const idx = (sorted.length - 1) * p;
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  if (lo === hi) return sorted[lo];
  const w = idx - lo;
  return sorted[lo] * (1 - w) + sorted[hi] * w;
}

export function median(values: number[]): number {
  if (values.length === 0) return 0;
  const s = [...values].sort((a, b) => a - b);
  return percentile(s, 0.5);
}

function staticBenchmark(sector: Sector): SectorWageBenchmark {
  const row = sectorWageMap[sector] || sectorWageMap.other;
  return {
    sector,
    medianMonthly: row.median,
    medianHourly: row.hourlyHint,
    sampleSize: 0,
    method: "static_reference",
    methodNoteEn:
      "Fallback DSEC-style sector reference (not computed from live vacancies).",
    methodNoteZh: "備用「統計局式」行業參考（非由即時空缺計算）。",
  };
}

/**
 * Build sector benchmarks from official DSAL (and optionally other) jobs.
 *
 * Credibility rule:
 * 1. Collect monthly midpoints of postings with valid pay in each sector
 * 2. If n ≥ MIN_SAMPLE_FOR_PRIMARY → primary = sample median (+ p25/p75)
 * 3. Else → static DSEC-style reference
 *
 * Only `source === "dsal"` jobs feed the sample, so the benchmark reflects
 * the official local vacancy register rather than demo/employer self-posts.
 */
export function buildSectorBenchmarks(
  officialJobs: JobPosting[]
): Record<Sector, SectorWageBenchmark> {
  const sectors = Object.keys(sectorWageMap) as Sector[];
  const buckets: Record<string, number[]> = {};
  for (const s of sectors) buckets[s] = [];

  for (const job of officialJobs) {
    if (job.source && job.source !== "dsal") continue;
    // Treat missing source on official list as dsal when passed as officialJobs
    const monthly = listingToMonthly(job);
    if (!monthly) continue;
    const key = job.sector in buckets ? job.sector : "other";
    buckets[key].push(monthly.mid);
  }

  const out = {} as Record<Sector, SectorWageBenchmark>;
  for (const sector of sectors) {
    const sample = buckets[sector] || [];
    if (sample.length >= MIN_SAMPLE_FOR_PRIMARY) {
      const sorted = [...sample].sort((a, b) => a - b);
      const med = percentile(sorted, 0.5);
      const p25 = percentile(sorted, 0.25);
      const p75 = percentile(sorted, 0.75);
      out[sector] = {
        sector,
        medianMonthly: Math.round(med),
        medianHourly: Math.round((med / STANDARD_MONTHLY_HOURS) * 10) / 10,
        p25Monthly: Math.round(p25),
        p75Monthly: Math.round(p75),
        sampleSize: sample.length,
        method: "dsal_sample",
        methodNoteEn: `Median of ${sample.length} official DSAL vacancy midpoints in this sector (hourly×${STANDARD_MONTHLY_HOURS}h → monthly).`,
        methodNoteZh: `本行業 ${sample.length} 個勞工局官方空缺薪酬中位（中點；時薪×${STANDARD_MONTHLY_HOURS}小時折合月薪）的中位數。`,
      };
    } else {
      const fallback = staticBenchmark(sector);
      out[sector] = {
        ...fallback,
        sampleSize: sample.length,
        methodNoteEn:
          sample.length > 0
            ? `Only ${sample.length} official sample(s) with pay — using DSEC-style reference until n≥${MIN_SAMPLE_FOR_PRIMARY}.`
            : fallback.methodNoteEn,
        methodNoteZh:
          sample.length > 0
            ? `僅 ${sample.length} 個有效官方樣本 — 樣本不足 ${MIN_SAMPLE_FOR_PRIMARY}，暫用統計式參考。`
            : fallback.methodNoteZh,
      };
    }
  }
  return out;
}

/**
 * Compare one listing to the sector benchmark (prefer DSAL-sample median).
 */
export function compareJobToBenchmark(
  job: JobPosting,
  benchmarks: Record<Sector, SectorWageBenchmark>
): PayDeviation | null {
  const benchmark =
    benchmarks[job.sector] || staticBenchmark(job.sector);
  const monthly = listingToMonthly(job);
  if (!monthly) {
    return {
      listingMidMonthly: 0,
      listingMinMonthly: 0,
      listingMaxMonthly: 0,
      benchmarkMonthly: benchmark.medianMonthly,
      deviationPct: 0,
      vsBand: "unknown",
      benchmark,
      hasListingPay: false,
    };
  }

  const deviationPct =
    benchmark.medianMonthly > 0
      ? ((monthly.mid - benchmark.medianMonthly) / benchmark.medianMonthly) * 100
      : 0;

  let vsBand: PayDeviation["vsBand"] = "unknown";
  if (
    benchmark.p25Monthly != null &&
    benchmark.p75Monthly != null &&
    benchmark.method === "dsal_sample"
  ) {
    if (monthly.mid < benchmark.p25Monthly) vsBand = "below_p25";
    else if (monthly.mid > benchmark.p75Monthly) vsBand = "above_p75";
    else vsBand = "in_iqr";
  }

  return {
    listingMidMonthly: Math.round(monthly.mid),
    listingMinMonthly: Math.round(monthly.min),
    listingMaxMonthly: Math.round(monthly.max),
    benchmarkMonthly: benchmark.medianMonthly,
    deviationPct,
    vsBand,
    benchmark,
    hasListingPay: true,
  };
}

export function formatMop(n: number, unit: "monthly" | "hourly" = "monthly") {
  const suffix = unit === "hourly" ? "/hr" : "/mo";
  return `MOP ${Math.round(n).toLocaleString()}${suffix}`;
}

export function formatDeviationPct(pct: number): string {
  const rounded = Math.round(pct);
  if (rounded > 0) return `+${rounded}%`;
  return `${rounded}%`;
}

export function deviationTone(
  pct: number
): "above" | "near" | "below" | "far_below" {
  if (pct >= 8) return "above";
  if (pct >= -8) return "near";
  if (pct >= -20) return "below";
  return "far_below";
}
