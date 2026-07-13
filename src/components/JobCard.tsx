"use client";

import { memo } from "react";
import Link from "next/link";
import {
  MapPin,
  Banknote,
  Clock,
  CalendarDays,
  Sparkles,
  GraduationCap,
  ShieldCheck,
  BadgeCheck,
  ExternalLink,
  Bot,
} from "lucide-react";
import type { JobPosting, Lang } from "@/lib/types";
import { useApp } from "@/context/AppContext";
import { laneLabel, sectorLabel } from "@/lib/i18n";
import { formatPay } from "@/lib/matching";
import { PayBenchmarkPanel } from "@/components/PayBenchmark";
import { EmployerTransparencyPanel } from "@/components/EmployerTransparency";
import { NrwIntentPanel } from "@/components/NrwIntentPanel";
import { SalaryNegotiatePanel } from "@/components/SalaryNegotiatePanel";
import type { AiVerdict, JobAiStrip } from "@/lib/job-ai-types";
import { pickCat } from "@/lib/cat-gallery";
import clsx from "clsx";

/** Format job.postedAt for cards (YYYY-MM-DD, ISO, or M/D/YYYY). */
export function formatJobPostedAt(
  postedAt: string | undefined | null,
  lang: Lang
): string | null {
  if (!postedAt || !String(postedAt).trim()) return null;
  const raw = String(postedAt).trim();
  let d: Date | null = null;
  const iso = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) {
    d = new Date(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3]));
  } else {
    const mdY = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
    if (mdY) {
      d = new Date(Number(mdY[3]), Number(mdY[1]) - 1, Number(mdY[2]));
    } else {
      const t = Date.parse(raw);
      if (!Number.isNaN(t)) d = new Date(t);
    }
  }
  if (!d || Number.isNaN(d.getTime())) {
    // Show raw short string rather than hide entirely
    return raw.length <= 16 ? raw : raw.slice(0, 10);
  }
  try {
    return d.toLocaleDateString(lang === "zh" ? "zh-MO" : "en-GB", {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  } catch {
    return d.toISOString().slice(0, 10);
  }
}

function verdictChip(v: AiVerdict, zh: boolean) {
  const label =
    zh
      ? {
          strong_fit: "高度適合",
          possible: "可以考慮",
          weak_fit: "偏低",
          not_recommended: "暫不建議",
        }[v]
      : {
          strong_fit: "Strong fit",
          possible: "Possible",
          weak_fit: "Weak fit",
          not_recommended: "Skip",
        }[v];
  const cls = {
    strong_fit: "bg-macau-green/15 text-macau-green",
    possible: "bg-macau-gold/20 text-macau-navy",
    weak_fit: "bg-macau-navy/5 text-macau-navy/60",
    not_recommended: "bg-macau-red/10 text-macau-red",
  }[v];
  return { label, cls };
}

function JobCardInner({
  job,
  matchScore,
  reasons,
  compact,
  aiStrip,
}: {
  job: JobPosting;
  matchScore?: number;
  reasons?: string[];
  compact?: boolean;
  /** Short AI / heuristic summary strip (from Smart Match batch or single advice) */
  aiStrip?: JobAiStrip | null;
}) {
  const { lang, tr, applyToJob, applications, youth } = useApp();
  const zh = lang === "zh";
  const decode = (s: string) =>
    (s || "")
      .replace(/&amp;/gi, "&")
      .replace(/&lt;/gi, "<")
      .replace(/&gt;/gi, ">")
      .replace(/&quot;/gi, '"')
      .replace(/&#39;/g, "'");
  const title = decode(zh ? job.titleZh : job.title);
  const company = decode(zh ? job.companyZh : job.company);
  const district = zh ? job.districtZh : job.district;
  const desc = zh ? job.descriptionZh : job.description;
  const already =
    youth && applications.some((a) => a.jobId === job.id && a.youthId === youth.id);

  const displayScore =
    typeof aiStrip?.fitScore === "number" ? aiStrip.fitScore : matchScore;
  const scoreIsAi = typeof aiStrip?.fitScore === "number";
  const catBuddy = pickCat(job.id);
  const postedLabel = formatJobPostedAt(job.postedAt, lang);

  return (
    <article className="group relative flex flex-col overflow-hidden rounded-3xl border border-joob-coral/15 bg-white/95 shadow-card transition hover:border-joob-coral/40 hover:shadow-cat">
      {/* Full-width cat photo banner — makes every job ad less dull */}
      <div className="relative h-28 w-full overflow-hidden sm:h-32">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={catBuddy}
          alt=""
          className="h-full w-full object-cover transition duration-500 group-hover:scale-105"
          loading="lazy"
          decoding="async"
          fetchPriority="low"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-white via-white/20 to-transparent" />
        <span className="absolute bottom-2 left-3 rounded-full bg-joob-coral/95 px-2.5 py-0.5 text-[10px] font-bold text-white shadow-sm">
          🐱 jOOB buddy
        </span>
      </div>

      <div className="flex flex-1 flex-col p-5 pt-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            {typeof aiStrip?.rank === "number" && (
              <span className="rounded-full bg-joob-coral px-2.5 py-0.5 text-[11px] font-bold text-white">
                #{aiStrip.rank}
              </span>
            )}
            {job.source === "dsal" && (
              <span className="inline-flex items-center gap-1 rounded-full bg-joob-cocoa px-2.5 py-0.5 text-[11px] font-semibold text-white">
                <BadgeCheck className="h-3 w-3" /> {tr("sourceOfficial")}
              </span>
            )}
            {job.source === "jobscall" && (
              <span className="inline-flex items-center gap-1 rounded-full bg-joob-mintDeep px-2.5 py-0.5 text-[11px] font-semibold text-white">
                <ExternalLink className="h-3 w-3" /> {tr("sourceJobscall")}
              </span>
            )}
            {job.source === "hellojobs" && (
              <span className="inline-flex items-center gap-1 rounded-full bg-amber-600 px-2.5 py-0.5 text-[11px] font-semibold text-white">
                <ExternalLink className="h-3 w-3" /> {tr("sourceHelloJobs")}
              </span>
            )}
            <span className="rounded-full bg-joob-sky px-2.5 py-0.5 text-[11px] font-semibold text-joob-coral">
              {laneLabel(lang, job.lane)}
            </span>
            <span className="rounded-full bg-joob-peach px-2.5 py-0.5 text-[11px] font-medium text-joob-cocoaSoft">
              {sectorLabel(lang, job.sector)}
            </span>
            {job.youthFriendly && (
              <span className="inline-flex items-center gap-1 text-[11px] text-joob-mintDeep">
                <Sparkles className="h-3 w-3" /> {tr("youthFriendly")}
              </span>
            )}
          </div>
          <h3 className="mt-2 text-lg font-bold text-joob-cocoa group-hover:text-joob-coral transition">
            <Link href={`/jobs/${job.id}`}>{title}</Link>
          </h3>
          <p className="text-sm text-joob-cocoaSoft">{company}</p>
        </div>
        {typeof displayScore === "number" && (
          <div
            className={clsx(
              "flex h-14 w-14 shrink-0 flex-col items-center justify-center rounded-2xl text-center",
              displayScore >= 70
                ? "bg-macau-green/10 text-macau-green"
                : displayScore >= 45
                  ? "bg-macau-gold/15 text-macau-navy"
                  : "bg-macau-navy/5 text-macau-navy/50"
            )}
          >
            <span className="text-lg font-bold leading-none">{displayScore}</span>
            <span className="text-[9px] font-medium uppercase tracking-wide">
              {scoreIsAi ? (zh ? "AI" : "AI") : tr("matchScore")}
            </span>
          </div>
        )}
      </div>

      {aiStrip && (
        <div className="mt-3 rounded-xl border border-macau-teal/25 bg-gradient-to-r from-macau-sky/60 to-macau-cream/40 px-3 py-2.5">
          <div className="flex flex-wrap items-center gap-2 text-[11px]">
            <span className="inline-flex items-center gap-1 font-semibold text-macau-teal">
              <Bot className="h-3.5 w-3.5" />
              {zh ? "AI 摘要" : "AI summary"}
            </span>
            {(() => {
              const { label, cls } = verdictChip(aiStrip.verdict, zh);
              return (
                <span className={clsx("rounded-full px-2 py-0.5 font-medium", cls)}>
                  {label}
                </span>
              );
            })()}
            {typeof aiStrip.ruleMatchScore === "number" && (
              <span className="text-macau-navy/40">
                {zh ? "規則" : "rule"} {aiStrip.ruleMatchScore}
              </span>
            )}
            <span className="ml-auto text-macau-navy/35">
              {aiStrip.provider === "xai" ? "Grok" : zh ? "規則引擎" : "heuristic"}
            </span>
          </div>
          <p className="mt-1 text-xs leading-relaxed text-macau-navy/75 line-clamp-2">
            {aiStrip.blurb}
          </p>
        </div>
      )}

      {!compact && !aiStrip && (
        <p className="mt-3 line-clamp-2 text-sm leading-relaxed text-macau-navy/65">{desc}</p>
      )}
      {!compact && aiStrip && (
        <p className="mt-2 line-clamp-1 text-xs leading-relaxed text-macau-navy/45">{desc}</p>
      )}

      <div className="mt-4 flex flex-wrap gap-3 text-xs text-macau-navy/55">
        {postedLabel && (
          <span
            className="inline-flex items-center gap-1 font-medium text-macau-navy/70"
            title={job.postedAt}
          >
            <CalendarDays className="h-3.5 w-3.5 text-joob-coral/80" />
            {zh ? "發佈" : "Posted"} {postedLabel}
          </span>
        )}
        <span className="inline-flex items-center gap-1">
          <MapPin className="h-3.5 w-3.5" /> {district}
        </span>
        <span className="inline-flex items-center gap-1 font-semibold text-macau-navy">
          <Banknote className="h-3.5 w-3.5 text-macau-gold" /> {formatPay(job, lang)}
        </span>
        <span className="inline-flex items-center gap-1">
          <Clock className="h-3.5 w-3.5" /> {job.hoursPerWeek}
        </span>
        {job.trainingProvided && (
          <span className="inline-flex items-center gap-1 text-macau-teal">
            <GraduationCap className="h-3.5 w-3.5" /> {tr("training")}
          </span>
        )}
        {job.minorAllowed && (
          <span className="inline-flex items-center gap-1 text-macau-green">
            <ShieldCheck className="h-3.5 w-3.5" /> {tr("minorOk")}
          </span>
        )}
      </div>

      <div className="mt-3">
        <PayBenchmarkPanel job={job} compact />
      </div>

      <div className="mt-0">
        <NrwIntentPanel job={job} compact />
      </div>

      <div className="mt-0">
        <SalaryNegotiatePanel job={job} compact />
      </div>

      {!compact && (
        <EmployerTransparencyPanel job={job} compact />
      )}

      {reasons && reasons.length > 0 && (
        <div className="mt-3 rounded-xl border border-macau-teal/20 bg-macau-sky/40 px-3 py-2">
          <div className="text-[11px] font-semibold uppercase tracking-wide text-macau-teal">
            {tr("whyMatch")}
          </div>
          <ul className="mt-1 space-y-0.5 text-xs text-macau-navy/70">
            {reasons.map((r, i) => (
              <li key={i}>· {r}</li>
            ))}
          </ul>
        </div>
      )}

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <button
          type="button"
          disabled={
            !!already &&
            job.source !== "dsal" &&
            job.source !== "jobscall" &&
            job.source !== "hellojobs"
          }
          onClick={() => applyToJob(job.id)}
          className={clsx(
            "rounded-xl px-4 py-2 text-sm font-semibold transition",
            already &&
              job.source !== "dsal" &&
              job.source !== "jobscall" &&
              job.source !== "hellojobs"
              ? "bg-macau-navy/10 text-macau-navy/40 cursor-not-allowed"
              : job.source === "dsal"
                ? "bg-macau-navy text-white hover:bg-macau-navy/90 shadow-sm"
                : job.source === "jobscall"
                  ? "bg-macau-teal text-white hover:bg-macau-teal/90 shadow-sm"
                  : job.source === "hellojobs"
                    ? "bg-amber-600 text-white hover:bg-amber-700 shadow-sm"
                    : "bg-macau-red text-white hover:bg-macau-red/90 shadow-sm"
          )}
        >
          {job.source === "dsal"
            ? tr("applyOfficial")
            : job.source === "jobscall"
              ? tr("applyJobscall")
              : job.source === "hellojobs"
                ? tr("applyHelloJobs")
                : already
                  ? tr("applied")
                  : tr("apply")}
        </button>
        <Link
          href={`/jobs/${job.id}`}
          className="rounded-xl px-4 py-2 text-sm font-medium text-macau-navy/70 hover:bg-macau-cream transition"
        >
          {lang === "zh" ? "詳情" : "Details"}
        </Link>
        {job.source === "dsal" && job.externalUrl && (
          <a
            href={job.externalUrl}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 rounded-xl px-3 py-2 text-xs font-medium text-macau-teal hover:bg-macau-sky transition"
          >
            <ExternalLink className="h-3.5 w-3.5" />
            DSAL
          </a>
        )}
        {job.source === "jobscall" && job.externalUrl && (
          <a
            href={job.externalUrl}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 rounded-xl px-3 py-2 text-xs font-medium text-macau-teal hover:bg-macau-sky transition"
          >
            <ExternalLink className="h-3.5 w-3.5" />
            Jobscall
          </a>
        )}
        {job.source === "hellojobs" && job.externalUrl && (
          <a
            href={job.externalUrl}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 rounded-xl px-3 py-2 text-xs font-medium text-amber-700 hover:bg-amber-50 transition"
          >
            <ExternalLink className="h-3.5 w-3.5" />
            Hello-Jobs
          </a>
        )}
        <span className="ml-auto text-xs text-macau-navy/40">
          {job.officialNo || `${job.openings} ${tr("openings")}`}
        </span>
      </div>
      </div>
    </article>
  );
}

export const JobCard = memo(JobCardInner);
