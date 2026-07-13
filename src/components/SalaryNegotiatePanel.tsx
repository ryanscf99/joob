"use client";

import { useCallback, useState } from "react";
import {
  Banknote,
  Loader2,
  Sparkles,
  ChevronDown,
  ChevronUp,
  Lightbulb,
  Brain,
  Copy,
  Check,
  Info,
} from "lucide-react";
import type { JobPosting } from "@/lib/types";
import type { SalaryNegotiateAdvice } from "@/lib/salary-negotiate";
import { useApp } from "@/context/AppContext";
import Link from "next/link";
import clsx from "clsx";

function formatAsk(n: number, unit: "monthly" | "hourly", zh: boolean) {
  const u = unit === "hourly" ? (zh ? "/時" : "/hr") : zh ? "/月" : "/mo";
  return `MOP ${n.toLocaleString()}${u}`;
}

export function SalaryNegotiatePanel({
  job,
  compact,
}: {
  job: JobPosting;
  compact?: boolean;
}) {
  const { lang, youth, officialJobs } = useApp();
  const zh = lang === "zh";
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [advice, setAdvice] = useState<SalaryNegotiateAdvice | null>(null);
  const [open, setOpen] = useState(!compact);
  const [copied, setCopied] = useState(false);

  const generate = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/ai/salary-negotiate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          job,
          youth,
          lang,
          officialJobs: officialJobs.slice(0, 80),
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok || !data.advice) {
        throw new Error(
          data.error || (zh ? "無法產生期望薪建議" : "Could not generate advice")
        );
      }
      setAdvice(data.advice as SalaryNegotiateAdvice);
      setOpen(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error");
    } finally {
      setLoading(false);
    }
  }, [job, youth, lang, officialJobs, zh]);

  const copyScript = async () => {
    if (!advice) return;
    try {
      await navigator.clipboard.writeText(advice.proposalScript);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      /* ignore */
    }
  };

  if (compact) {
    return (
      <div className="mt-3 rounded-xl border border-joob-coral/20 bg-joob-peach/30 px-3 py-2.5">
        <div className="flex items-center justify-between gap-2">
          <span className="inline-flex items-center gap-1 text-[11px] font-bold text-joob-cocoa">
            <Banknote className="h-3.5 w-3.5 text-joob-coral" />
            {zh ? "期望薪談判參考" : "Expected salary guide"}
          </span>
          {advice ? (
            <button
              type="button"
              onClick={() => setOpen((v) => !v)}
              className="text-[11px] font-semibold text-joob-coral"
            >
              {open ? (
                <ChevronUp className="h-4 w-4" />
              ) : (
                <ChevronDown className="h-4 w-4" />
              )}
            </button>
          ) : null}
        </div>

        {!advice && (
          <button
            type="button"
            disabled={loading}
            onClick={() => void generate()}
            className="mt-2 inline-flex w-full items-center justify-center gap-1.5 rounded-lg bg-joob-coral px-3 py-1.5 text-[11px] font-bold text-white disabled:opacity-60"
          >
            {loading ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Sparkles className="h-3.5 w-3.5" />
            )}
            {loading
              ? zh
                ? "分析中…"
                : "Analysing…"
              : zh
                ? "AI 建議期望薪"
                : "AI expected salary"}
          </button>
        )}

        {error && (
          <p className="mt-1.5 text-[11px] text-macau-red">{error}</p>
        )}

        {advice && (
          <div className="mt-2">
            <div className="text-sm font-extrabold text-joob-cocoa">
              {formatAsk(advice.proposeTarget, advice.unit, zh)}
            </div>
            <p className="text-[10px] text-joob-cocoaSoft">
              {zh ? "可談" : "Range"}{" "}
              {formatAsk(advice.proposeLow, advice.unit, zh)} –{" "}
              {formatAsk(advice.proposeHigh, advice.unit, zh)}
            </p>
            {open && (
              <div className="mt-2 space-y-2 border-t border-joob-coral/15 pt-2">
                <p className="text-[11px] leading-relaxed text-joob-cocoaSoft">
                  {advice.proposalScript}
                </p>
                <div className="text-[10px] font-bold uppercase tracking-wide text-joob-coral">
                  {zh ? "思考過程" : "How we thought"}
                </div>
                <ol className="list-decimal space-y-1 pl-4 text-[11px] leading-snug text-joob-cocoaSoft">
                  {advice.thinkingSteps.map((s, i) => (
                    <li key={i}>{s}</li>
                  ))}
                </ol>
                <p className="text-[10px] text-joob-cocoaSoft/80">
                  {advice.provider === "xai" ? "Grok" : zh ? "規則引擎" : "rules"}
                  {" · "}
                  <Link href={`/jobs/${job.id}`} className="text-joob-coral underline">
                    {zh ? "詳情頁看完整版" : "full view on details"}
                  </Link>
                </p>
              </div>
            )}
            {!open && (
              <button
                type="button"
                className="mt-1 text-[10px] font-semibold text-joob-coral"
                onClick={() => setOpen(true)}
              >
                {zh ? "展開思考過程" : "Show thinking"}
              </button>
            )}
          </div>
        )}
      </div>
    );
  }

  // Full panel (job detail)
  return (
    <div className="rounded-2xl border border-joob-coral/20 bg-white p-5 shadow-card">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="inline-flex items-center gap-2 text-sm font-bold text-joob-cocoa">
            <Banknote className="h-4 w-4 text-joob-coral" />
            {zh ? "期望薪建議（談判參考）" : "Expected salary (negotiation guide)"}
            <span className="rounded-full bg-joob-peach px-2 py-0.5 text-[10px] font-semibold text-joob-cocoaSoft">
              AI
            </span>
          </h3>
          <p className="mt-1 text-xs text-joob-cocoaSoft">
            {zh
              ? "結合行業基準、職缺標價與你的檔案／履歷，給出合理期望薪與思考步驟。"
              : "Combines market benchmark, listed pay, and your profile/CV into a reasonable ask — with the reasoning shown."}
          </p>
        </div>
        <button
          type="button"
          disabled={loading}
          onClick={() => void generate()}
          className="joob-btn-primary !py-2 !text-xs"
        >
          {loading ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Sparkles className="h-3.5 w-3.5" />
          )}
          {advice
            ? zh
              ? "重新計算"
              : "Recalculate"
            : zh
              ? "產生期望薪"
              : "Get expected salary"}
        </button>
      </div>

      {!youth && (
        <p className="mt-3 rounded-xl bg-joob-peach/40 px-3 py-2 text-xs text-joob-cocoa">
          {zh ? (
            <>
              建議先{" "}
              <Link href="/youth" className="font-bold text-joob-coral underline">
                完善檔案／上傳履歷
              </Link>
              ，建議會更貼近你的資歷。
            </>
          ) : (
            <>
              For a personalised ask,{" "}
              <Link href="/youth" className="font-bold text-joob-coral underline">
                complete your profile / CV
              </Link>{" "}
              first.
            </>
          )}
        </p>
      )}

      {error && (
        <p className="mt-3 text-xs text-macau-red">{error}</p>
      )}

      {loading && !advice && (
        <div className="mt-6 flex items-center justify-center gap-2 py-8 text-sm text-joob-cocoaSoft">
          <Loader2 className="h-5 w-5 animate-spin text-joob-coral" />
          {zh ? "正在結合市場與你的檔案推算…" : "Combining market data with your profile…"}
        </div>
      )}

      {advice && (
        <div className="mt-4 space-y-4">
          <div className="grid gap-2 sm:grid-cols-3">
            <div className="rounded-xl bg-joob-cream px-3 py-3 text-center">
              <div className="text-[10px] font-semibold uppercase tracking-wide text-joob-cocoaSoft">
                {zh ? "保守" : "Floor"}
              </div>
              <div className="mt-1 text-lg font-bold text-joob-cocoa">
                {formatAsk(advice.proposeLow, advice.unit, zh)}
              </div>
            </div>
            <div className="rounded-xl border-2 border-joob-coral bg-joob-peach/50 px-3 py-3 text-center">
              <div className="text-[10px] font-semibold uppercase tracking-wide text-joob-coral">
                {zh ? "主報價（期望薪）" : "Main ask"}
              </div>
              <div className="mt-1 text-xl font-extrabold text-joob-cocoa">
                {formatAsk(advice.proposeTarget, advice.unit, zh)}
              </div>
            </div>
            <div className="rounded-xl bg-joob-cream px-3 py-3 text-center">
              <div className="text-[10px] font-semibold uppercase tracking-wide text-joob-cocoaSoft">
                {zh ? "樂觀上限" : "Ceiling"}
              </div>
              <div className="mt-1 text-lg font-bold text-joob-cocoa">
                {formatAsk(advice.proposeHigh, advice.unit, zh)}
              </div>
            </div>
          </div>

          <div className="rounded-xl border border-joob-coral/15 bg-joob-sky/40 px-3 py-3">
            <div className="flex items-center justify-between gap-2">
              <span className="text-[10px] font-bold uppercase tracking-wide text-joob-coral">
                {zh ? "可直接使用的說法" : "What you can say / write"}
              </span>
              <button
                type="button"
                onClick={() => void copyScript()}
                className="inline-flex items-center gap-1 text-[11px] font-semibold text-joob-cocoa hover:text-joob-coral"
              >
                {copied ? (
                  <Check className="h-3.5 w-3.5 text-macau-green" />
                ) : (
                  <Copy className="h-3.5 w-3.5" />
                )}
                {copied ? (zh ? "已複製" : "Copied") : zh ? "複製" : "Copy"}
              </button>
            </div>
            <p className="mt-1.5 text-sm leading-relaxed text-joob-cocoa">
              {advice.proposalScript}
            </p>
          </div>

          <div>
            <div className="inline-flex items-center gap-1.5 text-xs font-bold text-joob-cocoa">
              <Brain className="h-3.5 w-3.5 text-joob-coral" />
              {zh ? "思考過程（如何得出這個數字）" : "Thinking process (how we got the number)"}
            </div>
            <ol className="mt-2 list-decimal space-y-2 pl-5 text-sm leading-relaxed text-joob-cocoaSoft">
              {advice.thinkingSteps.map((step, i) => (
                <li key={i}>{step}</li>
              ))}
            </ol>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            {advice.profileStrengths.length > 0 && (
              <div className="rounded-xl bg-macau-green/5 px-3 py-2">
                <div className="text-[10px] font-bold uppercase tracking-wide text-macau-green">
                  {zh ? "你的籌碼" : "Your strengths"}
                </div>
                <ul className="mt-1 space-y-1 text-xs text-joob-cocoaSoft">
                  {advice.profileStrengths.map((s, i) => (
                    <li key={i}>· {s}</li>
                  ))}
                </ul>
              </div>
            )}
            {advice.profileGaps.length > 0 && (
              <div className="rounded-xl bg-joob-peach/50 px-3 py-2">
                <div className="text-[10px] font-bold uppercase tracking-wide text-joob-orangeDeep">
                  {zh ? "需保守的地方" : "Where to stay cautious"}
                </div>
                <ul className="mt-1 space-y-1 text-xs text-joob-cocoaSoft">
                  {advice.profileGaps.map((s, i) => (
                    <li key={i}>· {s}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>

          {advice.tips.length > 0 && (
            <div className="rounded-xl border border-joob-coral/10 bg-joob-cream/80 px-3 py-2">
              <div className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wide text-joob-coral">
                <Lightbulb className="h-3 w-3" />
                {zh ? "談判小提示" : "Negotiation tips"}
              </div>
              <ul className="mt-1 space-y-1 text-xs text-joob-cocoaSoft">
                {advice.tips.map((t, i) => (
                  <li key={i}>· {t}</li>
                ))}
              </ul>
            </div>
          )}

          <div className="flex items-start gap-1.5 text-[11px] leading-relaxed text-joob-cocoaSoft">
            <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-joob-coral" />
            <span>
              {advice.marketNote}{" "}
              {zh
                ? `信心：${advice.confidence === "high" ? "高" : advice.confidence === "medium" ? "中" : "低"} · ${advice.provider === "xai" ? "Grok" : "規則引擎"}。此為談判參考，非錄取保證。`
                : `Confidence: ${advice.confidence} · ${advice.provider === "xai" ? "Grok" : "rules engine"}. Negotiation reference only — not a guaranteed offer.`}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
