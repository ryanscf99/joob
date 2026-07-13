"use client";

import { useMemo } from "react";
import { Home, Info, ThumbsUp } from "lucide-react";
import type { JobPosting } from "@/lib/types";
import { useApp } from "@/context/AppContext";
import { lookupEmployerWorkforce } from "@/lib/employer-transparency";
import {
  assessLocalHiringLikelihood,
  type LocalHireLevel,
} from "@/lib/nrw-intent";
import clsx from "clsx";

function levelStyles(level: LocalHireLevel) {
  switch (level) {
    case "high":
      return {
        box: "border-macau-green/30 bg-macau-green/5 text-macau-green",
        fill: "bg-macau-green",
      };
    case "fair":
      return {
        box: "border-joob-mintDeep/40 bg-joob-mint/25 text-joob-cocoa",
        fill: "bg-joob-mintDeep",
      };
    case "mixed":
      return {
        box: "border-macau-gold/40 bg-macau-gold/10 text-macau-navy",
        fill: "bg-macau-gold",
      };
    case "low":
      return {
        box: "border-joob-coral/35 bg-joob-peach/40 text-joob-orangeDeep",
        fill: "bg-joob-coral",
      };
    default:
      return {
        box: "border-macau-navy/10 bg-macau-cream/60 text-macau-navy/55",
        fill: "bg-macau-navy/30",
      };
  }
}

/** Four clear steps — no 0–100 number */
function LikelihoodMeter({
  steps,
  fillClass,
}: {
  steps: 1 | 2 | 3 | 4;
  fillClass: string;
}) {
  return (
    <div
      className="flex items-center gap-1"
      role="img"
      aria-label={`Local hiring likelihood ${steps} of 4`}
    >
      {[1, 2, 3, 4].map((i) => (
        <span
          key={i}
          className={clsx(
            "h-2 w-5 rounded-full sm:w-6",
            i <= steps ? fillClass : "bg-black/10"
          )}
        />
      ))}
    </div>
  );
}

export function NrwIntentPanel({
  job,
  compact,
}: {
  job: JobPosting;
  compact?: boolean;
}) {
  const { lang, wageBenchmarks } = useApp();
  const zh = lang === "zh";

  const companyKey =
    job.company && job.companyZh && job.company === job.companyZh
      ? job.company
      : `${job.company} ${job.companyZh}`.trim();

  const a = useMemo(() => {
    const w = lookupEmployerWorkforce(companyKey, job.sector);
    return assessLocalHiringLikelihood(job, wageBenchmarks, w);
  }, [job, wageBenchmarks, companyKey]);

  if (a.level === "unknown" && a.factors.length === 0) {
    return null;
  }

  const styles = levelStyles(a.level);
  const title = zh ? "本地招聘可能性" : "Local Hiring Likelihood";

  if (compact) {
    return (
      <div
        className={clsx(
          "mt-3 rounded-xl border px-3 py-2 text-[11px]",
          styles.box
        )}
      >
        <div className="flex items-center justify-between gap-2">
          <span className="inline-flex items-center gap-1 font-semibold">
            <Home className="h-3 w-3" />
            {title}
          </span>
          <span className="font-bold">{zh ? a.labelZh : a.labelEn}</span>
        </div>
        <div className="mt-1.5 flex items-center justify-between gap-2">
          <LikelihoodMeter steps={a.steps} fillClass={styles.fill} />
          <span className="text-[10px] opacity-70">
            {a.steps}/4
          </span>
        </div>
        <p className="mt-1 leading-snug opacity-90">
          {zh ? a.summaryZh : a.summaryEn}
        </p>
      </div>
    );
  }

  const supports = a.factors.filter((f) => f.impact > 0);
  const concerns = a.factors.filter((f) => f.impact < 0);

  return (
    <div className="rounded-2xl border border-joob-coral/15 bg-white p-5 shadow-card">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <h3 className="inline-flex items-center gap-2 text-sm font-bold text-joob-cocoa">
            <ThumbsUp className="h-4 w-4 text-joob-coral" />
            {title}
            <span className="rounded-full bg-joob-peach px-2 py-0.5 text-[10px] font-semibold text-joob-cocoaSoft">
              {zh ? "試點" : "pilot"}
            </span>
          </h3>
          <p className="mt-1 text-xs text-joob-cocoaSoft">
            {zh ? a.summaryZh : a.summaryEn}
          </p>
        </div>
        <div
          className={clsx(
            "rounded-2xl px-4 py-2.5 text-center min-w-[5.5rem]",
            styles.box
          )}
        >
          <div className="text-lg font-extrabold leading-tight">
            {zh ? a.labelZh : a.labelEn}
          </div>
          <div className="mt-1.5 flex justify-center">
            <LikelihoodMeter steps={a.steps} fillClass={styles.fill} />
          </div>
          <div className="mt-1 text-[10px] font-medium opacity-70">
            {zh ? `${a.steps}／4 格` : `${a.steps} of 4`}
          </div>
        </div>
      </div>

      {/* Four-tier legend */}
      <div className="mt-3 flex flex-wrap gap-1.5 text-[10px]">
        {(
          [
            { en: "Low", zh: "偏低", n: 1 },
            { en: "Mixed", zh: "一般", n: 2 },
            { en: "Fair", zh: "尚可", n: 3 },
            { en: "High", zh: "高", n: 4 },
          ] as const
        ).map((t) => (
          <span
            key={t.en}
            className={clsx(
              "rounded-full px-2 py-0.5 border",
              a.steps === t.n
                ? "border-joob-coral bg-joob-peach font-bold text-joob-cocoa"
                : "border-joob-cocoa/10 text-joob-cocoaSoft"
            )}
          >
            {zh ? t.zh : t.en}
          </span>
        ))}
      </div>

      <div className="mt-3 flex flex-wrap gap-3 text-[11px] text-joob-cocoaSoft">
        {a.payDeviationPct != null && (
          <span>
            {zh ? "薪酬 vs 中位" : "Pay vs median"}:{" "}
            <strong className="text-joob-cocoa">
              {a.payDeviationPct > 0 ? "+" : ""}
              {a.payDeviationPct}%
            </strong>
          </span>
        )}
        {a.firmForeignSharePct != null && (
          <span>
            {zh ? "企業外勞佔比" : "Firm non-resident share"}:{" "}
            <strong className="text-joob-cocoa">
              {a.firmForeignSharePct}%
            </strong>
            {a.firmConfidence === "reported" && " · A3"}
          </span>
        )}
      </div>

      {(supports.length > 0 || concerns.length > 0) && (
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          {supports.length > 0 && (
            <div className="rounded-xl bg-macau-green/5 px-3 py-2">
              <div className="text-[10px] font-bold uppercase tracking-wide text-macau-green">
                {zh ? "有利本地" : "Supports local hire"}
              </div>
              <ul className="mt-1.5 space-y-1 text-xs text-joob-cocoaSoft">
                {supports.map((f) => (
                  <li key={f.id}>· {zh ? f.labelZh : f.labelEn}</li>
                ))}
              </ul>
            </div>
          )}
          {concerns.length > 0 && (
            <div className="rounded-xl bg-joob-peach/50 px-3 py-2">
              <div className="text-[10px] font-bold uppercase tracking-wide text-joob-orangeDeep">
                {zh ? "需留意" : "Worth checking"}
              </div>
              <ul className="mt-1.5 space-y-1 text-xs text-joob-cocoaSoft">
                {concerns.map((f) => (
                  <li key={f.id}>· {zh ? f.labelZh : f.labelEn}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      <div className="mt-3 flex items-start gap-1.5 rounded-xl bg-joob-sky/60 px-3 py-2 text-[11px] leading-relaxed text-joob-cocoaSoft">
        <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-joob-coral" />
        <span>{zh ? a.disclaimerZh : a.disclaimerEn}</span>
      </div>
    </div>
  );
}
