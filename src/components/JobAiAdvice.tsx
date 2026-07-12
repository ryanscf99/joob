"use client";

import { useCallback, useEffect, useState } from "react";
import {
  Sparkles,
  Loader2,
  RefreshCw,
  ThumbsUp,
  ThumbsDown,
  AlertTriangle,
  Target,
  Banknote,
  Users,
  Lightbulb,
  Briefcase,
  Building2,
} from "lucide-react";
import type { JobPosting } from "@/lib/types";
import type { JobAiAdvice, AiVerdict } from "@/lib/job-ai-types";
import type { EmployerWorkforce } from "@/lib/employer-transparency";
import {
  lookupEmployerWorkforce,
  formatHeadcount,
} from "@/lib/employer-transparency";
import { useApp } from "@/context/AppContext";
import { laneLabel, sectorLabel } from "@/lib/i18n";
import { formatPay } from "@/lib/matching";
import clsx from "clsx";
import Link from "next/link";

function verdictStyle(v: AiVerdict) {
  switch (v) {
    case "strong_fit":
      return "bg-macau-green/15 text-macau-green border-macau-green/30";
    case "possible":
      return "bg-macau-gold/15 text-macau-navy border-macau-gold/40";
    case "weak_fit":
      return "bg-macau-navy/5 text-macau-navy/70 border-macau-navy/15";
    case "not_recommended":
      return "bg-macau-red/10 text-macau-red border-macau-red/25";
  }
}

function verdictLabel(v: AiVerdict, zh: boolean) {
  if (zh) {
    return {
      strong_fit: "高度適合",
      possible: "可以考慮",
      weak_fit: "適合度偏低",
      not_recommended: "暫不建議",
    }[v];
  }
  return {
    strong_fit: "Strong fit",
    possible: "Possible fit",
    weak_fit: "Weak fit",
    not_recommended: "Not recommended",
  }[v];
}

export function JobAiAdvicePanel({ job }: { job: JobPosting }) {
  const { lang, youth, officialJobs, tr } = useApp();
  const zh = lang === "zh";
  const [advice, setAdvice] = useState<JobAiAdvice | null>(null);
  const [workforceMeta, setWorkforceMeta] = useState<EmployerWorkforce | null>(
    null
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [xaiOn, setXaiOn] = useState<boolean | null>(null);

  const title = zh ? job.titleZh : job.title;
  const company = zh ? job.companyZh : job.company;

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/ai/job-advice");
        const data = await res.json();
        if (!cancelled) setXaiOn(!!data.xaiConfigured);
      } catch {
        if (!cancelled) setXaiOn(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    setAdvice(null);
    setError(null);
    setWorkforceMeta(null);
  }, [job.id]);

  const generate = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      // Prefer hydrated official map; only fetch once if missing
      const companyKey =
        job.company && job.companyZh && job.company === job.companyZh
          ? job.company
          : `${job.company} ${job.companyZh}`.trim();
      let workforce = lookupEmployerWorkforce(companyKey, job.sector);
      if (workforce?.confidence !== "reported") {
        try {
          const wres = await fetch(
            `/api/dsal/nrw?q=${encodeURIComponent(companyKey)}`
          );
          const wdata = await wres.json();
          if (wres.ok && wdata.ok && wdata.match) {
            workforce = wdata.match as EmployerWorkforce;
          }
        } catch {
          /* keep client fallback */
        }
      }
      setWorkforceMeta(workforce);

      const res = await fetch("/api/ai/job-advice", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          job,
          youth: youth
            ? {
                ...youth,
                skills: youth.skills || [],
                languages: youth.languages || [],
                preferredSectors: youth.preferredSectors || [],
                preferredLanes: youth.preferredLanes || [],
              }
            : null,
          lang,
          workforce,
          // Smaller payload — enough peer context without shipping full board
          officialJobs: (officialJobs || []).slice(0, 25),
        }),
      });
      let data: {
        ok?: boolean;
        error?: string;
        advice?: JobAiAdvice;
        meta?: { xaiConfigured?: boolean };
      };
      try {
        data = await res.json();
      } catch {
        throw new Error(
          zh
            ? "伺服器回應無法解析，請稍後再試"
            : "Could not parse server response — try again"
        );
      }
      if (!res.ok || !data.ok || !data.advice) {
        throw new Error(
          data.error ||
            (zh
              ? `產生建議失敗（HTTP ${res.status}）`
              : `Failed to generate advice (HTTP ${res.status})`)
        );
      }
      const adv = data.advice;
      setAdvice(adv);
      if (typeof data.meta?.xaiConfigured === "boolean") {
        setXaiOn(data.meta.xaiConfigured);
      }
      try {
        const key = "myeib_ai_strips_v1";
        const prev = JSON.parse(sessionStorage.getItem(key) || "{}") as Record<
          string,
          unknown
        >;
        prev[job.id] = {
          jobId: job.id,
          fitScore: adv.fitScore,
          verdict: adv.verdict,
          blurb: `${adv.headline} — ${adv.summary}`.slice(0, 200),
          ruleMatchScore: adv.ruleMatchScore,
          provider: adv.provider,
        };
        sessionStorage.setItem(key, JSON.stringify(prev));
      } catch {
        /* ignore */
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to generate advice");
    } finally {
      setLoading(false);
    }
  }, [job, youth, lang, zh, officialJobs]);

  return (
    <div className="rounded-2xl border border-macau-teal/25 bg-gradient-to-br from-white to-macau-sky/30 p-5 shadow-card">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="inline-flex items-center gap-2 text-sm font-bold text-macau-navy">
            <Sparkles className="h-4 w-4 text-macau-teal" />
            {zh ? "AI 職位摘要與適合度建議" : "AI job summary & fit advice"}
          </h3>
          <p className="mt-1 text-xs text-macau-navy/55 max-w-xl">
            {zh
              ? "分欄顯示：職位、適合度、薪酬、僱主人手（集團加總），並對照你的檔案／履歷。"
              : "Clear sections: role, fit, pay, employer workforce (group totals), vs your profile/CV."}
          </p>
        </div>
        <button
          type="button"
          onClick={() => void generate()}
          disabled={loading}
          className={clsx(
            "inline-flex items-center gap-2 rounded-xl bg-macau-teal px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-macau-teal/90",
            loading && "opacity-70"
          )}
        >
          {loading ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : advice ? (
            <RefreshCw className="h-4 w-4" />
          ) : (
            <Sparkles className="h-4 w-4" />
          )}
          {loading
            ? zh
              ? "分析中…"
              : "Analysing…"
            : advice
              ? zh
                ? "重新分析"
                : "Regenerate"
              : zh
                ? "產生 AI 建議"
                : "Generate AI advice"}
        </button>
      </div>

      <div className="mt-2 flex flex-wrap gap-2 text-[11px] text-macau-navy/50">
        <span className="rounded-full bg-white/80 px-2 py-0.5 border border-macau-navy/8">
          {xaiOn === null
            ? "…"
            : xaiOn
              ? zh
                ? "引擎：xAI Grok"
                : "Engine: xAI Grok"
              : zh
                ? "引擎：規則摘要（未設定 XAI_API_KEY）"
                : "Engine: heuristic (set XAI_API_KEY for Grok)"}
        </span>
        {!youth && (
          <Link
            href="/youth"
            className="rounded-full bg-macau-gold/20 px-2 py-0.5 text-macau-navy hover:underline"
          >
            {zh
              ? "建立檔案／上傳履歷以個人化 →"
              : "Add profile / CV to personalise →"}
          </Link>
        )}
        {youth?.cv && (
          <span className="rounded-full bg-macau-green/10 px-2 py-0.5 text-macau-green">
            {zh
              ? `已載入履歷：${youth.cv.fileName}`
              : `CV loaded: ${youth.cv.fileName}`}
          </span>
        )}
      </div>

      {error && (
        <p className="mt-3 inline-flex items-center gap-1.5 text-xs text-macau-red">
          <AlertTriangle className="h-3.5 w-3.5" />
          {error}
        </p>
      )}

      {advice && (
        <div className="mt-4 space-y-3">
          {/* Score + headline */}
          <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-macau-navy/8 bg-white/90 px-4 py-3">
            <div
              className={clsx(
                "flex h-16 w-16 flex-col items-center justify-center rounded-2xl border-2",
                advice.fitScore >= 70
                  ? "border-macau-green text-macau-green"
                  : advice.fitScore >= 45
                    ? "border-macau-gold text-macau-navy"
                    : "border-macau-red/40 text-macau-red"
              )}
            >
              <span className="text-xl font-bold leading-none">
                {advice.fitScore}
              </span>
              <span className="text-[9px] font-medium uppercase tracking-wide opacity-70">
                {zh ? "適合度" : "fit"}
              </span>
            </div>
            <div className="min-w-0 flex-1">
              <div
                className={clsx(
                  "inline-flex rounded-full border px-2.5 py-0.5 text-[11px] font-semibold",
                  verdictStyle(advice.verdict)
                )}
              >
                {verdictLabel(advice.verdict, zh)}
              </div>
              <h4 className="mt-1 text-base font-bold text-macau-navy">
                {advice.headline}
              </h4>
              {typeof advice.ruleMatchScore === "number" && (
                <p className="text-[11px] text-macau-navy/45">
                  {zh ? "規則參考分" : "Rule reference"}:{" "}
                  {advice.ruleMatchScore}
                  {advice.provider === "xai" && advice.model
                    ? ` · ${advice.model}`
                    : ""}
                </p>
              )}
            </div>
          </div>

          {/* Role snapshot — structured, not a wall of text */}
          <div className="rounded-2xl border border-macau-navy/8 bg-white/90 px-4 py-3">
            <div className="inline-flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-macau-navy/50">
              <Briefcase className="h-3.5 w-3.5" />
              {zh ? "職位速覽" : "Role snapshot"}
            </div>
            <div className="mt-2 grid gap-2 text-sm sm:grid-cols-2">
              <div>
                <div className="text-[10px] text-macau-navy/40">
                  {zh ? "職位" : "Title"}
                </div>
                <div className="font-semibold text-macau-navy">{title}</div>
              </div>
              <div>
                <div className="text-[10px] text-macau-navy/40">
                  {zh ? "僱主" : "Employer"}
                </div>
                <div className="font-semibold text-macau-navy">{company}</div>
              </div>
              <div>
                <div className="text-[10px] text-macau-navy/40">
                  {zh ? "類型／行業" : "Lane / sector"}
                </div>
                <div className="text-macau-navy/80">
                  {laneLabel(lang, job.lane)} · {sectorLabel(lang, job.sector)}
                </div>
              </div>
              <div>
                <div className="text-[10px] text-macau-navy/40">
                  {zh ? "列示薪酬" : "Listed pay"}
                </div>
                <div className="font-medium text-macau-navy">
                  {formatPay(job, lang)}
                </div>
              </div>
            </div>
          </div>

          {/* Fit narrative only */}
          <div className="rounded-2xl border border-macau-teal/20 bg-macau-sky/30 px-4 py-3">
            <div className="text-[11px] font-semibold uppercase tracking-wide text-macau-teal">
              {zh ? "適合度說明" : "Fit assessment"}
            </div>
            <p className="mt-1.5 text-sm leading-relaxed text-macau-navy/80">
              {advice.summary}
            </p>
          </div>

          {/* Pros / cons */}
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-xl bg-macau-green/5 border border-macau-green/15 px-3 py-2.5">
              <div className="inline-flex items-center gap-1 text-[11px] font-semibold text-macau-green">
                <ThumbsUp className="h-3.5 w-3.5" />
                {zh ? "優點" : "Pros"}
              </div>
              <ul className="mt-1.5 space-y-1 text-xs text-macau-navy/70">
                {advice.pros.map((p, i) => (
                  <li key={i}>· {p}</li>
                ))}
                {advice.pros.length === 0 && (
                  <li className="opacity-50">—</li>
                )}
              </ul>
            </div>
            <div className="rounded-xl bg-macau-red/5 border border-macau-red/15 px-3 py-2.5">
              <div className="inline-flex items-center gap-1 text-[11px] font-semibold text-macau-red">
                <ThumbsDown className="h-3.5 w-3.5" />
                {zh ? "留意" : "Watch-outs"}
              </div>
              <ul className="mt-1.5 space-y-1 text-xs text-macau-navy/70">
                {advice.cons.map((p, i) => (
                  <li key={i}>· {p}</li>
                ))}
                {advice.cons.length === 0 && (
                  <li className="opacity-50">—</li>
                )}
              </ul>
            </div>
          </div>

          {/* Pay */}
          <div className="rounded-xl bg-white/90 border border-macau-navy/8 px-4 py-3 text-xs">
            <div className="inline-flex items-center gap-1 font-semibold text-macau-navy/70">
              <Banknote className="h-3.5 w-3.5 text-macau-gold" />
              {zh ? "薪酬解讀" : "Pay"}
            </div>
            <p className="mt-1.5 text-sm text-macau-navy/75 leading-relaxed whitespace-pre-line">
              {advice.payTake || "—"}
            </p>
          </div>

          {/* Workforce — structured group view */}
          <div className="rounded-xl bg-white/90 border border-macau-navy/8 px-4 py-3 text-xs">
            <div className="inline-flex items-center gap-1.5 font-semibold text-macau-navy/70">
              <Users className="h-3.5 w-3.5 text-macau-teal" />
              {zh ? "僱主人手（本地 vs 外地）" : "Employer workforce (local vs NRW)"}
              {workforceMeta?.entityCount && workforceMeta.entityCount > 1 && (
                <span className="rounded-full bg-macau-navy px-2 py-0.5 text-[10px] font-bold text-white">
                  {zh
                    ? `${workforceMeta.entityCount} 個實體加總`
                    : `${workforceMeta.entityCount} entities summed`}
                </span>
              )}
            </div>

            {workforceMeta &&
            workforceMeta.totalEmployees != null &&
            workforceMeta.confidence === "reported" ? (
              <>
                <p className="mt-1 text-[11px] text-macau-navy/50">
                  {zh
                    ? workforceMeta.groupLabelZh || workforceMeta.nameZh
                    : workforceMeta.groupLabel || workforceMeta.name}
                </p>
                <div className="mt-2 grid grid-cols-3 gap-2">
                  <div className="rounded-lg bg-macau-cream/70 px-2 py-2 text-center">
                    <div className="text-[10px] text-macau-navy/45">
                      {zh ? "總僱員" : "Total"}
                    </div>
                    <div className="text-base font-bold text-macau-navy">
                      {formatHeadcount(workforceMeta.totalEmployees, lang)}
                    </div>
                  </div>
                  <div className="rounded-lg bg-macau-teal/10 px-2 py-2 text-center">
                    <div className="text-[10px] text-macau-teal/80">
                      {zh ? "本地" : "Local"}
                    </div>
                    <div className="text-base font-bold text-macau-teal">
                      {formatHeadcount(workforceMeta.localEmployees, lang)}
                    </div>
                    {workforceMeta.localSharePct != null && (
                      <div className="text-[10px] text-macau-navy/45">
                        {workforceMeta.localSharePct}%
                      </div>
                    )}
                  </div>
                  <div className="rounded-lg bg-macau-gold/15 px-2 py-2 text-center">
                    <div className="text-[10px] text-macau-navy/55">
                      {zh ? "外地" : "Non-resident"}
                    </div>
                    <div className="text-base font-bold text-macau-navy">
                      {formatHeadcount(workforceMeta.foreignEmployees, lang)}
                    </div>
                    {workforceMeta.foreignSharePct != null && (
                      <div className="text-[10px] text-macau-navy/45">
                        {workforceMeta.foreignSharePct}%
                      </div>
                    )}
                  </div>
                </div>
                {workforceMeta.members && workforceMeta.members.length > 1 && (
                  <details className="mt-2 rounded-lg border border-macau-navy/8 bg-macau-cream/30 px-2 py-1.5">
                    <summary className="cursor-pointer text-[11px] font-medium text-macau-navy/60">
                      <Building2 className="mr-1 inline h-3 w-3" />
                      {zh
                        ? `查看主要法人實體（外僱最多）`
                        : `Top legal entities by non-resident workers`}
                    </summary>
                    <ul className="mt-1.5 max-h-36 space-y-1 overflow-y-auto text-[11px] text-macau-navy/65">
                      {workforceMeta.members.map((m, i) => (
                        <li
                          key={i}
                          className="flex justify-between gap-2 border-b border-macau-navy/5 pb-1"
                        >
                          <span className="min-w-0 truncate">
                            {zh ? m.nameZh || m.namePt : m.namePt || m.nameZh}
                          </span>
                          <span className="shrink-0 tabular-nums text-macau-navy/50">
                            L{m.residents.toLocaleString()} / NRW{" "}
                            {m.foreignTotal.toLocaleString()}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </details>
                )}
                <p className="mt-2 text-[11px] leading-relaxed text-macau-navy/55 whitespace-pre-line">
                  {advice.workforceTake}
                </p>
              </>
            ) : (
              <p className="mt-1.5 text-sm text-macau-navy/70 leading-relaxed whitespace-pre-line">
                {advice.workforceTake || "—"}
              </p>
            )}
          </div>

          {/* Skills */}
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="text-xs">
              <div className="inline-flex items-center gap-1 font-semibold text-macau-teal">
                <Target className="h-3.5 w-3.5" />
                {zh ? "技能對齊" : "Skills aligned"}
              </div>
              <div className="mt-1.5 flex flex-wrap gap-1">
                {(advice.skillsAligned.length
                  ? advice.skillsAligned
                  : ["—"]
                ).map((s) => (
                  <span
                    key={s}
                    className="rounded-full bg-macau-teal/10 px-2 py-0.5 text-macau-teal"
                  >
                    {s}
                  </span>
                ))}
              </div>
            </div>
            <div className="text-xs">
              <div className="inline-flex items-center gap-1 font-semibold text-macau-navy/60">
                <Target className="h-3.5 w-3.5" />
                {zh ? "技能差距" : "Skills gap"}
              </div>
              <div className="mt-1.5 flex flex-wrap gap-1">
                {(advice.skillsGap.length ? advice.skillsGap : ["—"]).map(
                  (s) => (
                    <span
                      key={s}
                      className="rounded-full bg-macau-navy/5 px-2 py-0.5 text-macau-navy/60"
                    >
                      {s}
                    </span>
                  )
                )}
              </div>
            </div>
          </div>

          {advice.actionTips.length > 0 && (
            <div className="rounded-xl border border-macau-teal/20 bg-macau-sky/40 px-3 py-2.5">
              <div className="inline-flex items-center gap-1 text-[11px] font-semibold text-macau-teal">
                <Lightbulb className="h-3.5 w-3.5" />
                {zh ? "下一步建議" : "Next steps"}
              </div>
              <ul className="mt-1.5 space-y-1 text-xs text-macau-navy/70">
                {advice.actionTips.map((t, i) => (
                  <li key={i}>· {t}</li>
                ))}
              </ul>
            </div>
          )}

          <p className="text-[10px] text-macau-navy/40">
            {zh
              ? "AI 建議僅供參考。人手數字來自勞工局 A3；集團加總可能包含多個法人實體。"
              : "AI advice is informational. Headcounts from DSAL A3; group totals may sum multiple legal entities."}{" "}
            {tr("brand")}
          </p>
        </div>
      )}
    </div>
  );
}
