"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  X,
  Sparkles,
  Loader2,
  Copy,
  Check,
  Building2,
  FileText,
  Mail,
  Users,
  Newspaper,
  Lightbulb,
  ExternalLink,
} from "lucide-react";
import type { JobPosting } from "@/lib/types";
import type { ApplicationPack } from "@/lib/application-pack";
import { useApp } from "@/context/AppContext";
import { lookupEmployerWorkforce } from "@/lib/employer-transparency";
import Link from "next/link";
import clsx from "clsx";

async function copyText(text: string) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

function CopyBtn({
  text,
  zh,
}: {
  text: string;
  zh: boolean;
}) {
  const [ok, setOk] = useState(false);
  return (
    <button
      type="button"
      className="inline-flex items-center gap-1 rounded-full border border-joob-coral/25 bg-white px-2.5 py-1 text-[11px] font-semibold text-joob-cocoa hover:bg-joob-peach"
      onClick={async () => {
        const done = await copyText(text);
        if (done) {
          setOk(true);
          window.setTimeout(() => setOk(false), 1600);
        }
      }}
    >
      {ok ? <Check className="h-3 w-3 text-macau-green" /> : <Copy className="h-3 w-3" />}
      {ok ? (zh ? "已複製" : "Copied") : zh ? "複製" : "Copy"}
    </button>
  );
}

export function ApplicationPackModal({
  job,
  open,
  onClose,
}: {
  job: JobPosting;
  open: boolean;
  onClose: () => void;
}) {
  const { lang, youth, tr } = useApp();
  const zh = lang === "zh";
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pack, setPack] = useState<ApplicationPack | null>(null);
  const [tab, setTab] = useState<"cv" | "letter" | "company">("company");
  const closeRef = useRef<HTMLButtonElement>(null);

  const decode = (s: string) =>
    (s || "")
      .replace(/&amp;/gi, "&")
      .replace(/&lt;/gi, "<")
      .replace(/&gt;/gi, ">")
      .replace(/&quot;/gi, '"')
      .replace(/&#39;/g, "'");
  const title = decode(zh ? job.titleZh : job.title);
  const company = decode(zh ? job.companyZh : job.company);

  const generate = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const companyKey =
        job.company && job.companyZh && job.company === job.companyZh
          ? job.company
          : `${job.company} ${job.companyZh}`.trim();
      const workforce = lookupEmployerWorkforce(companyKey, job.sector);

      const res = await fetch("/api/ai/application-pack", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          job,
          youth,
          lang,
          workforce,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok || !data.pack) {
        throw new Error(
          data.error ||
            (zh ? "產生申請包失敗" : "Failed to generate application pack")
        );
      }
      setPack(data.pack as ApplicationPack);
      setTab("cv");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error");
    } finally {
      setLoading(false);
    }
  }, [job, youth, lang, zh]);

  useEffect(() => {
    if (!open) return;
    setPack(null);
    setError(null);
    setTab("company");
  }, [open, job.id]);

  useEffect(() => {
    if (!open) return;
    const previous = document.activeElement as HTMLElement | null;
    window.setTimeout(() => closeRef.current?.focus(), 0);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      previous?.focus();
    };
  }, [open, onClose]);

  if (!open) return null;

  const fullCvText = pack
    ? [
        pack.tailoredCv.headline,
        "",
        pack.tailoredCv.summary,
        "",
        zh ? "技能" : "Skills",
        pack.tailoredCv.skills.join(", "),
        "",
        zh ? "經驗要點" : "Experience",
        ...pack.tailoredCv.experienceBullets.map((b) => `• ${b}`),
        "",
        zh ? "教育" : "Education",
        ...pack.tailoredCv.educationBullets.map((b) => `• ${b}`),
        "",
        zh ? "建議關鍵字" : "Keywords to add",
        pack.tailoredCv.keywordsToAdd.join(", "),
      ].join("\n")
    : "";

  return (
    <div className="fixed inset-0 z-[100] flex items-end justify-center sm:items-center p-0 sm:p-4">
      <button
        type="button"
        className="absolute inset-0 bg-joob-cocoa/50 backdrop-blur-[2px]"
        aria-label="Close"
        onClick={onClose}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="application-pack-title"
        className="relative z-[101] flex max-h-[92vh] w-full max-w-3xl flex-col overflow-hidden rounded-t-3xl border border-joob-coral/20 bg-joob-cream shadow-soft sm:rounded-3xl"
      >
        {/* Header */}
        <div className="flex items-start justify-between gap-3 border-b border-joob-coral/15 bg-white px-4 py-3 sm:px-5">
          <div className="min-w-0">
            <div className="inline-flex items-center gap-1.5 text-xs font-bold text-joob-coral">
              <Sparkles className="h-3.5 w-3.5" />
              {zh ? "AI 申請準備包" : "AI application pack"}
            </div>
            <h2 id="application-pack-title" className="mt-0.5 truncate text-base font-extrabold text-joob-cocoa">
              {title}
            </h2>
            <p className="truncate text-xs text-joob-cocoaSoft">{company}</p>
          </div>
          <button
            ref={closeRef}
            type="button"
            onClick={onClose}
            className="rounded-full p-2 text-joob-cocoaSoft hover:bg-joob-peach"
            aria-label={zh ? "關閉申請準備包" : "Close application pack"}
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-4 py-4 sm:px-5">
          {!youth && (
            <div className="mb-4 rounded-2xl border border-joob-coral/25 bg-joob-peach/40 px-3 py-2 text-xs text-joob-cocoa">
              {zh ? (
                <>
                  建議先{" "}
                  <Link href="/youth" className="font-bold text-joob-coral underline">
                    建立檔案／上傳履歷
                  </Link>{" "}
                  ，AI 才能更準確客製。
                </>
              ) : (
                <>
                  For best results,{" "}
                  <Link href="/youth" className="font-bold text-joob-coral underline">
                    build your profile / upload a CV
                  </Link>{" "}
                  first.
                </>
              )}
            </div>
          )}

          {!pack && !loading && (
            <div className="rounded-2xl border border-joob-coral/15 bg-white p-5 text-sm text-joob-cocoaSoft">
              <p className="leading-relaxed">
                {zh
                  ? "一鍵產生：針對此職缺的履歷要點、求職信，以及公司網搜摘要（近期動態、招聘線索、關鍵人物——如有公開來源）。"
                  : "One click: CV bullets tailored to this JD, a cover letter, and a company web research brief (trends, news, hiring signals, key people when sourced)."}
              </p>
              <ul className="mt-3 space-y-1 text-xs">
                <li>· {zh ? "會呼叫公開網搜 +（如已設定）Grok" : "Runs public web search + Grok if XAI_API_KEY is set"}</li>
                <li>· {zh ? "請自行核實新聞與人名" : "Always verify news and names yourself"}</li>
                <li>· {zh ? "約需 15–45 秒" : "Usually takes 15–45 seconds"}</li>
              </ul>
              <button
                type="button"
                onClick={() => void generate()}
                className="joob-btn-primary mt-5 w-full sm:w-auto"
              >
                <Sparkles className="h-4 w-4" />
                {zh ? "開始產生申請包" : "Generate application pack"}
              </button>
            </div>
          )}

          {loading && (
            <div className="flex flex-col items-center justify-center gap-3 py-16 text-sm text-joob-cocoaSoft">
              <Loader2 className="h-8 w-8 animate-spin text-joob-coral" />
              <p className="font-medium">
                {zh
                  ? "正在搜尋公司並撰寫履歷／求職信…"
                  : "Researching company and drafting CV / letter…"}
              </p>
              <p className="text-xs opacity-70">
                {zh ? "網搜 + AI，請稍候" : "Web + AI — hang tight"}
              </p>
            </div>
          )}

          {error && (
            <div className="rounded-2xl border border-macau-red/25 bg-macau-red/5 px-3 py-2 text-xs text-macau-red">
              {error}
              <button
                type="button"
                className="ml-2 font-bold underline"
                onClick={() => void generate()}
              >
                {zh ? "重試" : "Retry"}
              </button>
            </div>
          )}

          {pack && (
            <>
              <div className="mb-3 flex flex-wrap items-center gap-2">
                {(
                  [
                    { id: "cv" as const, icon: FileText, en: "Tailored CV", zh: "客製履歷" },
                    { id: "letter" as const, icon: Mail, en: "Cover letter", zh: "求職信" },
                    {
                      id: "company" as const,
                      icon: Building2,
                      en: "Company research",
                      zh: "公司調研",
                    },
                  ] as const
                ).map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => setTab(t.id)}
                    className={clsx(
                      "inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-bold transition",
                      tab === t.id
                        ? "bg-joob-coral text-white shadow-cat"
                        : "bg-white text-joob-cocoa border border-joob-coral/20 hover:bg-joob-peach"
                    )}
                  >
                    <t.icon className="h-3.5 w-3.5" />
                    {zh ? t.zh : t.en}
                  </button>
                ))}
                <span className="ml-auto text-[10px] text-joob-cocoaSoft">
                  {pack.provider === "xai" ? "Grok" : zh ? "規則模板" : "template"}
                  {pack.model ? ` · ${pack.model}` : ""}
                </span>
              </div>

              {tab === "cv" && (
                <section className="space-y-3 rounded-2xl border border-joob-coral/15 bg-white p-4">
                  <div className="flex items-center justify-between gap-2">
                    <h3 className="font-bold text-joob-cocoa">
                      {pack.tailoredCv.headline}
                    </h3>
                    <CopyBtn text={fullCvText} zh={zh} />
                  </div>
                  <p className="text-sm leading-relaxed text-joob-cocoaSoft">
                    {pack.tailoredCv.summary}
                  </p>
                  <div>
                    <div className="text-[10px] font-bold uppercase tracking-wide text-joob-coral">
                      {zh ? "技能" : "Skills"}
                    </div>
                    <div className="mt-1.5 flex flex-wrap gap-1.5">
                      {pack.tailoredCv.skills.map((s) => (
                        <span
                          key={s}
                          className="rounded-full bg-joob-peach px-2.5 py-0.5 text-[11px] font-medium text-joob-cocoa"
                        >
                          {s}
                        </span>
                      ))}
                    </div>
                  </div>
                  <div>
                    <div className="text-[10px] font-bold uppercase tracking-wide text-joob-coral">
                      {zh ? "經驗要點" : "Experience bullets"}
                    </div>
                    <ul className="mt-1 space-y-1 text-sm text-joob-cocoaSoft">
                      {pack.tailoredCv.experienceBullets.map((b, i) => (
                        <li key={i}>• {b}</li>
                      ))}
                    </ul>
                  </div>
                  {pack.tailoredCv.educationBullets.length > 0 && (
                    <div>
                      <div className="text-[10px] font-bold uppercase tracking-wide text-joob-coral">
                        {zh ? "教育" : "Education"}
                      </div>
                      <ul className="mt-1 space-y-1 text-sm text-joob-cocoaSoft">
                        {pack.tailoredCv.educationBullets.map((b, i) => (
                          <li key={i}>• {b}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                  {pack.tailoredCv.keywordsToAdd.length > 0 && (
                    <div>
                      <div className="text-[10px] font-bold uppercase tracking-wide text-joob-coral">
                        {zh ? "建議補上關鍵字" : "Keywords to weave in"}
                      </div>
                      <p className="mt-1 text-xs text-joob-cocoaSoft">
                        {pack.tailoredCv.keywordsToAdd.join(" · ")}
                      </p>
                    </div>
                  )}
                </section>
              )}

              {tab === "letter" && (
                <section className="rounded-2xl border border-joob-coral/15 bg-white p-4">
                  <div className="mb-2 flex justify-end">
                    <CopyBtn text={pack.coverLetter} zh={zh} />
                  </div>
                  <pre className="whitespace-pre-wrap font-sans text-sm leading-relaxed text-joob-cocoa">
                    {pack.coverLetter}
                  </pre>
                </section>
              )}

              {tab === "company" && (
                <section className="space-y-3">
                  <div className="rounded-2xl border border-joob-coral/15 bg-white p-4">
                    <div className="flex items-center gap-2 text-sm font-bold text-joob-cocoa">
                      <Building2 className="h-4 w-4 text-joob-coral" />
                      {zh ? "公司概況" : "Overview"}
                      <span className="rounded-full bg-joob-peach px-2 py-0.5 text-[10px] font-semibold text-joob-cocoaSoft">
                        {pack.companyBrief.confidence === "web_backed"
                          ? zh
                            ? "網搜支撐"
                            : "web-backed"
                          : pack.companyBrief.confidence === "limited_web"
                            ? zh
                              ? "有限網搜"
                              : "limited web"
                            : zh
                              ? "本地資料"
                              : "local data"}
                      </span>
                    </div>
                    <p className="mt-2 text-sm leading-relaxed text-joob-cocoaSoft">
                      {pack.companyBrief.overview}
                    </p>
                  </div>

                  {pack.companyBrief.recentTrends.length > 0 && (
                    <div className="rounded-2xl border border-joob-coral/15 bg-white p-4">
                      <div className="flex items-center gap-2 text-sm font-bold text-joob-cocoa">
                        <Newspaper className="h-4 w-4 text-joob-coral" />
                        {zh ? "近期趨勢" : "Recent trends"}
                      </div>
                      <ul className="mt-2 space-y-1.5 text-sm text-joob-cocoaSoft">
                        {pack.companyBrief.recentTrends.map((t, i) => (
                          <li key={i}>• {t}</li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {pack.companyBrief.newsHighlights.length > 0 && (
                    <div className="rounded-2xl border border-joob-coral/15 bg-white p-4">
                      <div className="text-sm font-bold text-joob-cocoa">
                        {zh ? "新聞／公開動態" : "News & public updates"}
                      </div>
                      <ul className="mt-2 space-y-1.5 text-sm text-joob-cocoaSoft">
                        {pack.companyBrief.newsHighlights.map((t, i) => (
                          <li key={i}>• {t}</li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {pack.companyBrief.hiringSignals.length > 0 && (
                    <div className="rounded-2xl border border-joob-coral/15 bg-white p-4">
                      <div className="text-sm font-bold text-joob-cocoa">
                        {zh ? "招聘線索" : "Hiring signals"}
                      </div>
                      <ul className="mt-2 space-y-1.5 text-sm text-joob-cocoaSoft">
                        {pack.companyBrief.hiringSignals.map((t, i) => (
                          <li key={i}>• {t}</li>
                        ))}
                      </ul>
                    </div>
                  )}

                  <div className="rounded-2xl border border-joob-coral/15 bg-white p-4">
                    <div className="flex items-center gap-2 text-sm font-bold text-joob-cocoa">
                      <Users className="h-4 w-4 text-joob-coral" />
                      {zh ? "申請流程關鍵人物" : "Key people for applications"}
                    </div>
                    {pack.companyBrief.keyPeople.length === 0 ? (
                      <p className="mt-2 text-xs text-joob-cocoaSoft">
                        {zh
                          ? "公開來源未可靠識別到具名高管／招聘聯絡人。建議在 LinkedIn／公司官網／職缺聯絡欄自行核實。"
                          : "No reliably sourced named executives/recruiters found. Check LinkedIn, the company site, and the listing contact yourself."}
                      </p>
                    ) : (
                      <ul className="mt-2 space-y-2 text-sm">
                        {pack.companyBrief.keyPeople.map((p, i) => (
                          <li
                            key={i}
                            className="rounded-xl bg-joob-peach/40 px-3 py-2"
                          >
                            <div className="font-bold text-joob-cocoa">
                              {p.name}
                              {p.role ? (
                                <span className="font-medium text-joob-cocoaSoft">
                                  {" "}
                                  · {p.role}
                                </span>
                              ) : null}
                            </div>
                            {p.why && (
                              <p className="mt-0.5 text-xs text-joob-cocoaSoft">
                                {p.why}
                              </p>
                            )}
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>

                  {pack.companyBrief.talkingPoints.length > 0 && (
                    <div className="rounded-2xl border border-joob-coral/15 bg-white p-4">
                      <div className="flex items-center gap-2 text-sm font-bold text-joob-cocoa">
                        <Lightbulb className="h-4 w-4 text-joob-coral" />
                        {zh ? "面試／求職信切入點" : "Talking points"}
                      </div>
                      <ul className="mt-2 space-y-1.5 text-sm text-joob-cocoaSoft">
                        {pack.companyBrief.talkingPoints.map((t, i) => (
                          <li key={i}>• {t}</li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {pack.interviewTips.length > 0 && (
                    <div className="rounded-2xl border border-joob-coral/15 bg-white p-4">
                      <div className="text-sm font-bold text-joob-cocoa">
                        {zh ? "面試提示" : "Interview tips"}
                      </div>
                      <ul className="mt-2 space-y-1.5 text-sm text-joob-cocoaSoft">
                        {pack.interviewTips.map((t, i) => (
                          <li key={i}>• {t}</li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {pack.companyBrief.sources.length > 0 && (
                    <div className="rounded-2xl border border-joob-coral/15 bg-white p-4">
                      <div className="text-sm font-bold text-joob-cocoa">
                        {zh
                          ? "公開網頁來源（點開閱讀原文）"
                          : "Public web sources (open to read)"}
                      </div>
                      <ul className="mt-2 space-y-2 text-xs">
                        {pack.companyBrief.sources.map((s, i) => (
                          <li
                            key={i}
                            className="rounded-xl border border-joob-coral/10 bg-joob-cream/80 px-3 py-2"
                          >
                            <a
                              href={s.url}
                              target="_blank"
                              rel="noreferrer"
                              className="inline-flex items-start gap-1 font-semibold text-joob-coral hover:underline"
                            >
                              <span className="min-w-0">
                                {s.title || s.url}
                              </span>
                              <ExternalLink className="mt-0.5 h-3 w-3 shrink-0" />
                            </a>
                            <div className="mt-0.5 break-all text-[10px] text-joob-cocoaSoft">
                              {s.url}
                            </div>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </section>
              )}

              <button
                type="button"
                onClick={() => void generate()}
                disabled={loading}
                className="mt-4 text-xs font-bold text-joob-coral hover:underline"
              >
                {zh ? "重新產生" : "Regenerate"}
              </button>
            </>
          )}
        </div>

        <div className="border-t border-joob-coral/15 bg-white px-4 py-3 text-[10px] text-joob-cocoaSoft sm:px-5">
          {zh
            ? "AI 與網搜內容可能出錯。正式提交前請人工校對履歷／求職信，並核實公司資訊。"
            : "AI and web snippets can be wrong. Proofread CV/letter and verify company facts before submitting."}
          {" · "}
          {tr("brand")}
        </div>
      </div>
    </div>
  );
}
