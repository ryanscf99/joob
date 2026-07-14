"use client";

import { useEffect, useState } from "react";
import { Users, Globe2, Home, Info, Building2 } from "lucide-react";
import type { JobPosting } from "@/lib/types";
import {
  lookupEmployerWorkforce,
  localHireSignal,
  formatHeadcount,
  confidenceLabel,
  type EmployerWorkforce,
} from "@/lib/employer-transparency";
import { useApp } from "@/context/AppContext";
import clsx from "clsx";

function WorkforceBars({ w }: { w: EmployerWorkforce }) {
  const local = w.localSharePct ?? 0;
  const foreign = w.foreignSharePct ?? 0;
  return (
    <div className="mt-2 h-2.5 w-full overflow-hidden rounded-full bg-macau-navy/10 flex">
      <div
        className="h-full bg-macau-teal transition-all"
        style={{ width: `${Math.min(100, local)}%` }}
        title={`Local ${local}%`}
      />
      <div
        className="h-full bg-macau-gold/80 transition-all"
        style={{ width: `${Math.min(100, foreign)}%` }}
        title={`Non-resident ${foreign}%`}
      />
    </div>
  );
}

export function EmployerTransparencyPanel({
  job,
  compact,
}: {
  job: JobPosting;
  compact?: boolean;
}) {
  const { lang, tr } = useApp();
  const decode = (s: string) =>
    (s || "")
      .replace(/&amp;/gi, "&")
      .replace(/&lt;/gi, "<")
      .replace(/&gt;/gi, ">")
      .replace(/&quot;/gi, '"')
      .replace(/&#39;/g, "'");
  const company = decode(lang === "zh" ? job.companyZh : job.company);
  const companyEn = decode(job.company || "");
  const companyZh = decode(job.companyZh || "");
  const companyKey =
    companyEn && companyZh && companyEn === companyZh
      ? companyEn
      : `${companyEn} ${companyZh}`.trim();

  const fallback = lookupEmployerWorkforce(companyKey, job.sector);
  const [w, setW] = useState<EmployerWorkforce | null>(fallback);

  useEffect(() => {
    let cancelled = false;
    const key = companyKey;
    // Prefer already-hydrated official map (no network)
    const local = lookupEmployerWorkforce(key, job.sector);
    setW(local);

    // Compact cards: never hit the network (was causing N+1 storms on Jobs grid)
    if (compact) {
      return () => {
        cancelled = true;
      };
    }

    // Full panel: only fetch if we don't already have reported A3 data
    if (local?.confidence === "reported") {
      return () => {
        cancelled = true;
      };
    }

    const timer = window.setTimeout(async () => {
      try {
        const res = await fetch(
          `/api/dsal/nrw?q=${encodeURIComponent(key)}`
        );
        const data = await res.json();
        if (cancelled) return;
        if (res.ok && data.ok && data.match) {
          setW(data.match as EmployerWorkforce);
        }
      } catch {
        /* keep fallback */
      }
    }, 100);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [companyKey, job.sector, job.id, compact]);

  if (!w) return null;

  const signal = localHireSignal(w);
  const isBenchmark = w.confidence === "sector_benchmark";
  const isOfficial = w.confidence === "reported";
  const isGroup = (w.entityCount ?? 1) > 1;
  // Prefer listing company for benchmarks; A3 / group label only when reported
  const displayName = isOfficial
    ? lang === "zh"
      ? w.groupLabelZh || w.nameZh
      : w.groupLabel || w.name
    : company ||
      (lang === "zh" ? w.nameZh : w.name);

  if (compact) {
    return (
      <div
        className={clsx(
          "mt-3 rounded-xl border px-3 py-2",
          isOfficial
            ? "border-macau-teal/30 bg-macau-sky/50"
            : "border-macau-navy/8 bg-macau-cream/40"
        )}
      >
        <div className="flex items-center justify-between gap-2 text-[11px]">
          <span className="inline-flex items-center gap-1 font-semibold text-macau-navy/70">
            <Users className="h-3 w-3 text-macau-teal" />
            {tr("workforceTitle")}
            {isOfficial && (
              <span className="rounded bg-macau-navy px-1.5 py-0.5 text-[9px] font-bold text-white">
                DSAL A3
              </span>
            )}
            {isBenchmark && (
              <span className="rounded border border-amber-500/30 bg-amber-50 px-1.5 py-0.5 text-[9px] font-bold text-amber-800">
                {lang === "zh" ? "行業估算" : "SECTOR ESTIMATE"}
              </span>
            )}
            {isGroup && (
              <span className="rounded bg-macau-teal px-1.5 py-0.5 text-[9px] font-bold text-white">
                {lang === "zh"
                  ? `${w.entityCount} 實體`
                  : `${w.entityCount} ents`}
              </span>
            )}
          </span>
          <span
            className={clsx(
              "rounded-full px-2 py-0.5 font-medium",
              signal.level === "strong" && "bg-macau-green/15 text-macau-green",
              signal.level === "moderate" && "bg-macau-gold/20 text-macau-navy",
              signal.level === "weak" && "bg-macau-red/10 text-macau-red",
              signal.level === "unknown" && "bg-macau-navy/5 text-macau-navy/50"
            )}
          >
            {lang === "zh" ? signal.labelZh : signal.labelEn}
          </span>
        </div>
        <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-0.5 text-[11px] text-macau-navy/60">
          <span title={isBenchmark ? (lang === "zh" ? "不是企業級數據" : "Not firm-level data") : undefined}>
            {tr("workforceTotal")}:{" "}
            <strong className="text-macau-navy">
              {formatHeadcount(w.totalEmployees, lang)}
            </strong>
            {isBenchmark && (
              <span className="text-macau-navy/40"> ≈</span>
            )}
          </span>
          <span className="inline-flex items-center gap-0.5">
            <Home className="h-3 w-3 text-macau-teal" />
            {tr("workforceLocal")}: {formatHeadcount(w.localEmployees, lang)}
            {w.localSharePct != null && ` (${w.localSharePct}%)`}
          </span>
          <span className="inline-flex items-center gap-0.5">
            <Globe2 className="h-3 w-3 text-macau-gold" />
            {tr("workforceForeign")}: {formatHeadcount(w.foreignEmployees, lang)}
            {w.foreignSharePct != null && ` (${w.foreignSharePct}%)`}
          </span>
        </div>
        <WorkforceBars w={w} />
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-macau-navy/10 bg-white p-5 shadow-card">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h3 className="inline-flex items-center gap-2 text-sm font-bold text-macau-navy">
            <Users className="h-4 w-4 text-macau-teal" />
            {tr("workforceTitle")}
            {isGroup && (
              <span className="rounded-full bg-macau-teal/15 px-2 py-0.5 text-[10px] font-semibold text-macau-teal">
                {lang === "zh"
                  ? `集團加總 · ${w.entityCount} 實體`
                  : `Group total · ${w.entityCount} entities`}
              </span>
            )}
          </h3>
          <p className="mt-1 text-xs text-macau-navy/50">
            {displayName || company}
            {isBenchmark
              ? lang === "zh"
                ? " · 未找到企業級數據，顯示行業基準"
                : " · No firm-level data — sector benchmark"
              : isGroup
                ? lang === "zh"
                  ? " · 已合併同集團多個法人實體"
                  : " · Related legal entities summed"
                : ""}
          </p>
        </div>
        <span
          className={clsx(
            "rounded-full px-2.5 py-1 text-[11px] font-semibold",
            signal.level === "strong" && "bg-macau-green/15 text-macau-green",
            signal.level === "moderate" && "bg-macau-gold/20 text-macau-navy",
            signal.level === "weak" && "bg-macau-red/10 text-macau-red",
            signal.level === "unknown" && "bg-macau-navy/5 text-macau-navy/50"
          )}
        >
          {lang === "zh" ? signal.labelZh : signal.labelEn}
        </span>
      </div>

      <div className="mt-4 grid grid-cols-3 gap-2">
        <div className="rounded-xl bg-macau-cream/60 px-3 py-2.5 text-center">
          <div className="text-[10px] font-medium uppercase tracking-wide text-macau-navy/45">
            {tr("workforceTotal")}
          </div>
          <div className="mt-1 text-lg font-bold text-macau-navy">
            {formatHeadcount(w.totalEmployees, lang)}
          </div>
        </div>
        <div className="rounded-xl bg-macau-teal/10 px-3 py-2.5 text-center">
          <div className="text-[10px] font-medium uppercase tracking-wide text-macau-teal/80">
            {tr("workforceLocal")}
          </div>
          <div className="mt-1 text-lg font-bold text-macau-teal">
            {formatHeadcount(w.localEmployees, lang)}
          </div>
          {w.localSharePct != null && (
            <div className="text-[10px] text-macau-navy/50">{w.localSharePct}%</div>
          )}
        </div>
        <div className="rounded-xl bg-macau-gold/15 px-3 py-2.5 text-center">
          <div className="text-[10px] font-medium uppercase tracking-wide text-macau-navy/55">
            {tr("workforceForeign")}
          </div>
          <div className="mt-1 text-lg font-bold text-macau-navy">
            {formatHeadcount(w.foreignEmployees, lang)}
          </div>
          {w.foreignSharePct != null && (
            <div className="text-[10px] text-macau-navy/50">
              {w.foreignSharePct}%
            </div>
          )}
        </div>
      </div>

      <WorkforceBars w={w} />
      <div className="mt-1.5 flex justify-between text-[10px] text-macau-navy/45">
        <span>
          {tr("workforceLocal")} {w.localSharePct ?? "—"}%
        </span>
        <span>
          {tr("workforceForeign")} {w.foreignSharePct ?? "—"}%
        </span>
      </div>

      {w.members && w.members.length > 1 && (
        <details className="mt-3 rounded-xl border border-macau-navy/8 bg-macau-cream/30 px-3 py-2">
          <summary className="cursor-pointer text-xs font-medium text-macau-navy/65">
            <Building2 className="mr-1 inline h-3.5 w-3.5" />
            {lang === "zh"
              ? "主要法人實體明細（按外地僱員）"
              : "Top legal entities (by non-resident workers)"}
          </summary>
          <ul className="mt-2 max-h-40 space-y-1.5 overflow-y-auto text-xs text-macau-navy/70">
            {w.members.map((m, i) => (
              <li
                key={i}
                className="flex justify-between gap-2 border-b border-macau-navy/5 pb-1"
              >
                <span className="min-w-0 truncate">
                  {lang === "zh" ? m.nameZh || m.namePt : m.namePt || m.nameZh}
                </span>
                <span className="shrink-0 tabular-nums text-macau-navy/45">
                  {lang === "zh" ? "本地" : "L"}{" "}
                  {m.residents.toLocaleString()} ·{" "}
                  {lang === "zh" ? "外地" : "NRW"}{" "}
                  {m.foreignTotal.toLocaleString()}
                </span>
              </li>
            ))}
          </ul>
        </details>
      )}

      <p className="mt-3 text-xs leading-relaxed text-macau-navy/60">
        {tr("workforceWhy")}
      </p>

      <div className="mt-3 flex items-start gap-1.5 rounded-xl bg-macau-sky/40 px-3 py-2 text-[11px] text-macau-navy/60">
        <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-macau-teal" />
        <span>
          {confidenceLabel(w.confidence, lang)} · {tr("workforceAsOf")}: {w.asOf}
          <br />
          {lang === "zh" ? w.sourceZh : w.source}
          {(lang === "zh" ? w.noteZh : w.note) && (
            <>
              <br />
              {lang === "zh" ? w.noteZh : w.note}
            </>
          )}
        </span>
      </div>
    </div>
  );
}
