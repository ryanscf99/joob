"use client";

import { useParams } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft,
  MapPin,
  Banknote,
  Clock,
  CalendarDays,
  Languages as LangIcon,
  ShieldCheck,
  GraduationCap,
  BadgeCheck,
  ExternalLink,
} from "lucide-react";
import { useApp } from "@/context/AppContext";
import { laneLabel, sectorLabel } from "@/lib/i18n";
import { formatPay } from "@/lib/matching";
import { formatJobPostedAt } from "@/components/JobCard";
import { PayBenchmarkPanel } from "@/components/PayBenchmark";
import { EmployerTransparencyPanel } from "@/components/EmployerTransparency";
import { JobAiAdvicePanel } from "@/components/JobAiAdvice";
import { NrwIntentPanel } from "@/components/NrwIntentPanel";
import { SalaryNegotiatePanel } from "@/components/SalaryNegotiatePanel";
import { pickCat } from "@/lib/cat-gallery";

export default function JobDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { jobs, lang, tr, applyToJob, applications, youth } = useApp();
  const job = jobs.find((j) => j.id === id);

  if (!job) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-16 text-center">
        <p className="text-macau-navy/50">{tr("noJobs")}</p>
        <Link href="/jobs" className="mt-4 inline-block text-macau-teal font-semibold">
          ← {tr("navJobs")}
        </Link>
      </div>
    );
  }

  const decode = (s: string) =>
    (s || "")
      .replace(/&amp;/gi, "&")
      .replace(/&lt;/gi, "<")
      .replace(/&gt;/gi, ">")
      .replace(/&quot;/gi, '"')
      .replace(/&#39;/g, "'");
  const title = decode(lang === "zh" ? job.titleZh : job.title);
  const company = decode(lang === "zh" ? job.companyZh : job.company);
  const desc = lang === "zh" ? job.descriptionZh : job.description;
  const reqs = lang === "zh" ? job.requirementsZh : job.requirements;
  const district = lang === "zh" ? job.districtZh : job.district;
  const already =
    youth && applications.some((a) => a.jobId === job.id && a.youthId === youth.id);
  const catBuddy = pickCat(job.id);

  return (
    <div className="mx-auto max-w-3xl px-4 py-10 paw-bg">
      <Link
        href="/jobs"
        className="inline-flex items-center gap-1 text-sm text-joob-cocoaSoft hover:text-joob-coral"
      >
        <ArrowLeft className="h-4 w-4" /> {tr("back")}
      </Link>

      <div className="mt-4 overflow-hidden rounded-3xl border border-joob-coral/15 bg-white shadow-card">
        {/* Cat buddy hero for this job */}
        <div className="relative h-44 w-full sm:h-56">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={catBuddy}
            alt=""
            className="h-full w-full object-cover"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-white via-transparent to-black/10" />
          <span className="absolute bottom-3 left-4 rounded-full bg-joob-coral px-3 py-1 text-xs font-bold text-white shadow-cat">
            🐱 {lang === "zh" ? "此職專屬貓搭檔" : "cat buddy for this role"}
          </span>
        </div>

        <div className="p-8 pt-5">
        <div className="flex flex-wrap gap-2">
          {job.source === "dsal" && (
            <span className="inline-flex items-center gap-1 rounded-full bg-macau-navy px-3 py-1 text-xs font-semibold text-white">
              <BadgeCheck className="h-3.5 w-3.5" /> {tr("sourceOfficial")}
            </span>
          )}
          {job.source === "jobscall" && (
            <span className="inline-flex items-center gap-1 rounded-full bg-macau-teal px-3 py-1 text-xs font-semibold text-white">
              <ExternalLink className="h-3.5 w-3.5" /> {tr("sourceJobscall")}
            </span>
          )}
          {job.source === "hellojobs" && (
            <span className="inline-flex items-center gap-1 rounded-full bg-amber-600 px-3 py-1 text-xs font-semibold text-white">
              <ExternalLink className="h-3.5 w-3.5" /> {tr("sourceHelloJobs")}
            </span>
          )}
          <span className="rounded-full bg-macau-sky px-3 py-1 text-xs font-semibold text-macau-teal">
            {laneLabel(lang, job.lane)}
          </span>
          <span className="rounded-full bg-macau-cream px-3 py-1 text-xs font-medium">
            {sectorLabel(lang, job.sector)}
          </span>
          {job.officialNo && (
            <span className="rounded-full border border-macau-navy/10 px-3 py-1 text-xs text-macau-navy/60">
              #{job.officialNo}
            </span>
          )}
        </div>
        <h1 className="mt-4 text-3xl font-bold text-macau-navy">{title}</h1>
        <p className="mt-1 text-lg text-macau-navy/60">{company}</p>

        <div className="mt-6 flex flex-wrap gap-4 text-sm text-macau-navy/65">
          {formatJobPostedAt(job.postedAt, lang) && (
            <span
              className="inline-flex items-center gap-1.5 font-medium text-macau-navy/75"
              title={job.postedAt}
            >
              <CalendarDays className="h-4 w-4 text-joob-coral/80" />
              {lang === "zh" ? "發佈" : "Posted"}{" "}
              {formatJobPostedAt(job.postedAt, lang)}
            </span>
          )}
          <span className="inline-flex items-center gap-1.5">
            <MapPin className="h-4 w-4" /> {district}
          </span>
          <span className="inline-flex items-center gap-1.5 font-semibold text-macau-navy">
            <Banknote className="h-4 w-4 text-macau-gold" /> {formatPay(job, lang)}
          </span>
          <span className="inline-flex items-center gap-1.5">
            <Clock className="h-4 w-4" /> {job.hoursPerWeek}
          </span>
          <span className="inline-flex items-center gap-1.5">
            <LangIcon className="h-4 w-4" /> {job.languages.join(" · ")}
          </span>
        </div>

        <div className="mt-6">
          <PayBenchmarkPanel job={job} />
        </div>

        <div className="mt-6">
          <SalaryNegotiatePanel job={job} />
        </div>

        <div className="mt-6">
          <NrwIntentPanel job={job} />
        </div>

        <div className="mt-6">
          <EmployerTransparencyPanel job={job} />
        </div>

        <div className="mt-6">
          <JobAiAdvicePanel job={job} />
        </div>

        <div className="mt-8">
          <h2 className="font-semibold text-macau-navy">
            {lang === "zh" ? "工作內容" : "About the role"}
          </h2>
          <p className="mt-2 text-sm leading-relaxed text-macau-navy/70">{desc}</p>
        </div>

        <div className="mt-6">
          <h2 className="font-semibold text-macau-navy">
            {lang === "zh" ? "要求" : "Requirements"}
          </h2>
          <ul className="mt-2 space-y-1.5 text-sm text-macau-navy/70">
            {reqs.map((r, i) => (
              <li key={i} className="flex gap-2">
                <span className="text-macau-teal">•</span> {r}
              </li>
            ))}
          </ul>
        </div>

        <div className="mt-6 flex flex-wrap gap-3 text-sm">
          {job.minorAllowed && (
            <span className="inline-flex items-center gap-1.5 rounded-xl bg-macau-green/10 px-3 py-1.5 text-macau-green">
              <ShieldCheck className="h-4 w-4" /> {tr("minorOk")}
            </span>
          )}
          {job.trainingProvided && (
            <span className="inline-flex items-center gap-1.5 rounded-xl bg-macau-sky px-3 py-1.5 text-macau-teal">
              <GraduationCap className="h-4 w-4" /> {tr("training")}
            </span>
          )}
        </div>

        {job.source === "dsal" && (
          <div className="mt-6 rounded-2xl border border-macau-navy/10 bg-macau-sky/40 px-4 py-3 text-sm text-macau-navy/75">
            {tr("officialNote")}
            {job.contact && (
              <p className="mt-2 text-xs text-macau-navy/60">{job.contact}</p>
            )}
          </div>
        )}
        {job.source === "jobscall" && (
          <div className="mt-6 rounded-2xl border border-macau-teal/20 bg-macau-sky/40 px-4 py-3 text-sm text-macau-navy/75">
            {lang === "zh"
              ? "此職位來自 Jobscall.me 商業招聘平台。請於原僱主頁面查看完整要求並申請。非勞工局官方空缺。"
              : "This listing is from Jobscall.me (commercial board). Review full requirements and apply on the original employer page. Not an official DSAL vacancy."}
          </div>
        )}
        {job.source === "hellojobs" && (
          <div className="mt-6 rounded-2xl border border-amber-200 bg-amber-50/80 px-4 py-3 text-sm text-macau-navy/75">
            {lang === "zh"
              ? "此職位來自 Hello-Jobs.com 商業招聘平台。請於原職位頁查看完整要求並申請。非勞工局官方空缺。"
              : "This listing is from Hello-Jobs.com (commercial board). Review full requirements and apply on the original job page. Not an official DSAL vacancy."}
          </div>
        )}

        <div className="mt-8 flex flex-wrap gap-3">
          <button
            type="button"
            disabled={
              !!already &&
              job.source !== "dsal" &&
              job.source !== "jobscall" &&
              job.source !== "hellojobs"
            }
            onClick={() => applyToJob(job.id)}
            className="rounded-xl bg-macau-red px-6 py-3 text-sm font-semibold text-white disabled:opacity-40 hover:bg-macau-red/90 transition"
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
          {job.source === "dsal" && job.externalUrl && (
            <a
              href={job.externalUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-2 rounded-xl bg-macau-navy px-6 py-3 text-sm font-semibold text-white hover:bg-macau-navy/90 transition"
            >
              <ExternalLink className="h-4 w-4" />
              {tr("openOfficial")}
            </a>
          )}
          {job.source === "jobscall" && job.externalUrl && (
            <a
              href={job.externalUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-2 rounded-xl bg-macau-teal px-6 py-3 text-sm font-semibold text-white hover:bg-macau-teal/90 transition"
            >
              <ExternalLink className="h-4 w-4" />
              Jobscall.me
            </a>
          )}
          {job.source === "hellojobs" && job.externalUrl && (
            <a
              href={job.externalUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-2 rounded-xl bg-amber-600 px-6 py-3 text-sm font-semibold text-white hover:bg-amber-700 transition"
            >
              <ExternalLink className="h-4 w-4" />
              Hello-Jobs
            </a>
          )}
        </div>
        </div>
      </div>
    </div>
  );
}
