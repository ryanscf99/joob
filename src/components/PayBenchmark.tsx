"use client";

import { useApp } from "@/context/AppContext";
import type { JobPosting } from "@/lib/types";
import {
  compareJobToBenchmark,
  deviationTone,
  formatDeviationPct,
  formatMop,
} from "@/lib/wage-benchmark";
import clsx from "clsx";

export function PayBenchmarkPanel({
  job,
  compact,
}: {
  job: JobPosting;
  compact?: boolean;
}) {
  const { lang, wageBenchmarks } = useApp();
  const cmp = compareJobToBenchmark(job, wageBenchmarks);
  if (!cmp) return null;

  const { benchmark, hasListingPay, deviationPct } = cmp;
  const tone = hasListingPay ? deviationTone(deviationPct) : "near";
  const isSample = benchmark.method === "dsal_sample";

  const toneClass = {
    above: "border-macau-green/25 bg-macau-green/5 text-macau-green",
    near: "border-macau-navy/10 bg-macau-cream/80 text-macau-navy/70",
    below: "border-macau-gold/40 bg-macau-gold/10 text-macau-navy",
    far_below: "border-macau-red/25 bg-macau-red/5 text-macau-red",
  }[tone];

  const title =
    lang === "zh" ? "市場薪酬基準（可比較）" : "Market pay benchmark";

  const methodShort = isSample
    ? lang === "zh"
      ? `勞工局樣本中位數 · n=${benchmark.sampleSize}`
      : `DSAL sample median · n=${benchmark.sampleSize}`
    : lang === "zh"
      ? "統計式參考（樣本不足）"
      : "Statistical reference (thin sample)";

  const benchmarkDisplay =
    job.payUnit === "hourly"
      ? formatMop(benchmark.medianHourly, "hourly")
      : formatMop(benchmark.medianMonthly, "monthly");

  return (
    <div className={clsx("rounded-xl border px-3 py-2 text-xs", toneClass)}>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <span className="font-semibold opacity-80">{title}</span>
        <span className="font-bold tabular-nums">{benchmarkDisplay}</span>
      </div>

      <div className="mt-0.5 text-[10px] opacity-60">{methodShort}</div>

      {hasListingPay && (
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <span
            className={clsx(
              "rounded-full px-2 py-0.5 text-[11px] font-bold tabular-nums",
              tone === "above" && "bg-macau-green/15",
              tone === "near" && "bg-macau-navy/8",
              tone === "below" && "bg-macau-gold/25",
              tone === "far_below" && "bg-macau-red/15"
            )}
          >
            {lang === "zh" ? "相對基準" : "vs median"}{" "}
            {formatDeviationPct(deviationPct)}
          </span>
          <span className="opacity-70">
            {lang === "zh"
              ? `職缺中點 ≈ ${formatMop(cmp.listingMidMonthly)}`
              : `listing mid ≈ ${formatMop(cmp.listingMidMonthly)}`}
          </span>
        </div>
      )}

      {!hasListingPay && (
        <div className="mt-1 opacity-60">
          {lang === "zh"
            ? "此職缺未解析出有效薪酬，僅顯示行業基準。"
            : "No usable listed pay — showing sector benchmark only."}
        </div>
      )}

      {!compact && isSample && benchmark.p25Monthly != null && benchmark.p75Monthly != null && (
        <div className="mt-1.5 opacity-55">
          {lang === "zh"
            ? `四分位距 IQR：${formatMop(benchmark.p25Monthly)} – ${formatMop(benchmark.p75Monthly)}`
            : `IQR (p25–p75): ${formatMop(benchmark.p25Monthly)} – ${formatMop(benchmark.p75Monthly)}`}
          {cmp.vsBand === "below_p25" &&
            (lang === "zh" ? " · 低於市場下四分位" : " · below market p25")}
          {cmp.vsBand === "above_p75" &&
            (lang === "zh" ? " · 高於市場上四分位" : " · above market p75")}
          {cmp.vsBand === "in_iqr" &&
            (lang === "zh" ? " · 落在市場中間段" : " · within market IQR")}
        </div>
      )}

      {!compact && (
        <p className="mt-1.5 text-[10px] leading-snug opacity-50">
          {lang === "zh" ? benchmark.methodNoteZh : benchmark.methodNoteEn}
        </p>
      )}
    </div>
  );
}
