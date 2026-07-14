"use client";

import { BadgeCheck, CalendarClock, CircleDollarSign, ShieldCheck } from "lucide-react";
import type { JobPosting } from "@/lib/types";
import { useApp } from "@/context/AppContext";
import { lookupEmployerWorkforce } from "@/lib/employer-transparency";

export function JobTrustSummary({ job }: { job: JobPosting }) {
  const { lang, youth } = useApp();
  const zh = lang === "zh";
  const companyKey = `${job.company || ""} ${job.companyZh || ""}`.trim();
  const workforce = lookupEmployerWorkforce(companyKey, job.sector);
  const posted = Date.parse(job.postedAt);
  const ageDays = Number.isFinite(posted)
    ? Math.max(0, Math.floor((Date.now() - posted) / 86400000))
    : null;
  const eligible = !youth || youth.age >= 18 || job.minorAllowed;
  const sourceLabel =
    job.source === "dsal"
      ? zh
        ? "勞工局官方職位"
        : "Official DSAL vacancy"
      : zh
        ? "商業招聘平台職位"
        : "Commercial job-board listing";
  const evidence =
    workforce?.confidence === "reported"
      ? zh
        ? "企業／集團數據：勞工局 A3 報告"
        : "Firm/group evidence: reported DSAL A3 data"
      : zh
        ? "企業數據不可用：僅顯示行業估算"
        : "No firm evidence: sector estimate only";

  return (
    <section className="rounded-2xl border border-macau-teal/20 bg-macau-sky/35 p-4">
      <h2 className="text-sm font-bold text-macau-navy">
        {zh ? "職位可信度摘要" : "Job trust summary"}
      </h2>
      <div className="mt-3 grid gap-2 text-xs text-macau-navy/70 sm:grid-cols-2">
        <span className="inline-flex items-center gap-2">
          <BadgeCheck className="h-4 w-4 text-macau-teal" /> {sourceLabel}
        </span>
        <span className="inline-flex items-center gap-2">
          <CalendarClock className="h-4 w-4 text-macau-teal" />
          {ageDays == null
            ? zh ? "發佈日期未核實" : "Posted date unavailable"
            : zh ? `${ageDays} 日前發佈` : `Posted ${ageDays} days ago`}
        </span>
        <span className="inline-flex items-center gap-2">
          <CircleDollarSign className="h-4 w-4 text-macau-teal" />
          {job.payMin > 0 || job.payMax > 0
            ? zh ? "招聘廣告列明薪酬" : "Salary disclosed in listing"
            : zh ? "招聘廣告未列明薪酬" : "Salary not disclosed"}
        </span>
        <span className="inline-flex items-center gap-2">
          <ShieldCheck className="h-4 w-4 text-macau-teal" />
          {eligible
            ? zh ? "未發現年齡限制衝突" : "No known age eligibility conflict"
            : zh ? "你的年齡或不符合要求" : "Your age may not meet this role"}
        </span>
      </div>
      <p className="mt-3 border-t border-macau-teal/15 pt-2 text-[11px] text-macau-navy/60">
        {evidence}
      </p>
    </section>
  );
}
