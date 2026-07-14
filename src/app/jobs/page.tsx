"use client";

import { useEffect, useMemo, useState } from "react";
import { Search, RefreshCw, BadgeCheck, AlertCircle, ExternalLink } from "lucide-react";
import { useApp } from "@/context/AppContext";
import { JobCard } from "@/components/JobCard";
import { laneLabel, sectorLabel } from "@/lib/i18n";
import type { JobLane, Sector } from "@/lib/types";
import type { JobAiStrip } from "@/lib/job-ai-types";
import clsx from "clsx";

const LANES: JobLane[] = ["summer", "part-time", "internship", "full-time"];
const SECTORS: Sector[] = [
  "hospitality",
  "retail",
  "fnb",
  "big-health",
  "finance",
  "tech",
  "mice",
  "education",
  "other",
];

/** Keep list DOM small — 400+ cards was the main click lag */
const PAGE_SIZE = 24;

type SourceFilter = "all" | "dsal" | "jobscall" | "hellojobs";

export default function JobsPage() {
  const {
    tr,
    jobs,
    lang,
    dsalLoading,
    dsalError,
    dsalStats,
    dsalFetchedAt,
    officialJobs,
    jobscallJobs,
    jobscallLoading,
    jobscallError,
    jobscallStats,
    jobscallFetchedAt,
    hellojobsJobs,
    hellojobsLoading,
    hellojobsError,
    hellojobsStats,
    hellojobsFetchedAt,
    refreshOfficialJobs,
    refreshJobscallJobs,
    refreshHelloJobs,
  } = useApp();
  const [qInput, setQInput] = useState("");
  const [q, setQ] = useState("");
  const [lane, setLane] = useState<string>("");
  const [sector, setSector] = useState<string>("");
  const [source, setSource] = useState<SourceFilter>("all");
  const [district, setDistrict] = useState("");
  const [minPay, setMinPay] = useState(0);
  const [days, setDays] = useState(0);
  const [youthOnly, setYouthOnly] = useState(false);
  const [minorsOnly, setMinorsOnly] = useState(false);
  const [trainingOnly, setTrainingOnly] = useState(false);
  const [page, setPage] = useState(0);
  const [aiStrips, setAiStrips] = useState<Record<string, JobAiStrip>>({});

  const loading = dsalLoading || jobscallLoading || hellojobsLoading;

  // Debounce search so each keystroke does not re-filter hundreds of jobs
  useEffect(() => {
    const t = window.setTimeout(() => setQ(qInput), 180);
    return () => window.clearTimeout(t);
  }, [qInput]);

  // Show AI strips cached from job-detail advice or Smart Match batch
  useEffect(() => {
    try {
      const raw = sessionStorage.getItem("myeib_ai_strips_v1");
      if (raw) setAiStrips(JSON.parse(raw) as Record<string, JobAiStrip>);
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    setQInput(params.get("q") || "");
    setLane(params.get("lane") || "");
    setSector(params.get("sector") || "");
    setSource((params.get("source") as SourceFilter) || "all");
    setDistrict(params.get("district") || "");
    setMinPay(Number(params.get("minPay")) || 0);
    setDays(Number(params.get("days")) || 0);
    setYouthOnly(params.get("youth") === "1");
    setMinorsOnly(params.get("minors") === "1");
    setTrainingOnly(params.get("training") === "1");
  }, []);

  useEffect(() => {
    const params = new URLSearchParams();
    if (q) params.set("q", q);
    if (lane) params.set("lane", lane);
    if (sector) params.set("sector", sector);
    if (source !== "all") params.set("source", source);
    if (district) params.set("district", district);
    if (minPay) params.set("minPay", String(minPay));
    if (days) params.set("days", String(days));
    if (youthOnly) params.set("youth", "1");
    if (minorsOnly) params.set("minors", "1");
    if (trainingOnly) params.set("training", "1");
    window.history.replaceState(null, "", `${window.location.pathname}${params.size ? `?${params}` : ""}`);
  }, [q, lane, sector, source, district, minPay, days, youthOnly, minorsOnly, trainingOnly]);

  const filtered = useMemo(() => {
    const query = q.toLowerCase().trim();
    return jobs.filter((j) => {
      // Public boards only (seed/platform already excluded from merge)
      if (
        j.source === "seed" ||
        j.source === "platform" ||
        (!j.source && !j.officialNo)
      )
        return false;
      if (source === "dsal" && j.source !== "dsal") return false;
      if (source === "jobscall" && j.source !== "jobscall") return false;
      if (source === "hellojobs" && j.source !== "hellojobs") return false;
      if (lane && j.lane !== lane) return false;
      if (sector && j.sector !== sector) return false;
      if (district && !`${j.district} ${j.districtZh}`.toLowerCase().includes(district.toLowerCase()))
        return false;
      if (minPay && Math.max(j.payMin, j.payMax) < minPay) return false;
      if (youthOnly && !j.youthFriendly) return false;
      if (minorsOnly && !j.minorAllowed) return false;
      if (trainingOnly && !j.trainingProvided) return false;
      if (days) {
        const posted = Date.parse(j.postedAt);
        if (!Number.isFinite(posted) || posted < Date.now() - days * 86400000) return false;
      }
      if (!query) return true;
      const hay = [
        j.title,
        j.titleZh,
        j.company,
        j.companyZh,
        j.description,
        j.descriptionZh,
        j.officialNo,
        ...j.skills,
      ]
        .join(" ")
        .toLowerCase();
      return hay.includes(query);
    });
  }, [jobs, q, lane, sector, source, district, minPay, days, youthOnly, minorsOnly, trainingOnly]);

  // Reset page when filters change
  useEffect(() => {
    setPage(0);
  }, [q, lane, sector, source, district, minPay, days, youthOnly, minorsOnly, trainingOnly]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages - 1);
  const pageItems = useMemo(
    () =>
      filtered.slice(safePage * PAGE_SIZE, safePage * PAGE_SIZE + PAGE_SIZE),
    [filtered, safePage]
  );

  const refreshAll = () => {
    void refreshOfficialJobs({ force: true });
    void refreshJobscallJobs({ force: true });
    void refreshHelloJobs({ force: true });
  };

  return (
    <div className="mx-auto max-w-6xl px-4 py-10 paw-bg">
      <div className="flex flex-wrap items-end gap-4">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/brand/joob-logo-256.png"
          alt="jOOB"
          className="h-14 w-14 rounded-full border-2 border-white object-cover shadow-cat"
        />
        <div>
          <h1 className="text-3xl font-extrabold text-joob-cocoa">
            {tr("navJobs")} 🐾
          </h1>
          <p className="mt-1 text-joob-cocoaSoft">
            {lang === "zh"
              ? "僅顯示公開真實空缺：勞工局 + Jobscall.me + Hello-Jobs——jOOB 貓小隊陪你一起挑。"
              : "Public real vacancies only: DSAL + Jobscall.me + Hello-Jobs — browse with the jOOB cat crew."}
          </p>
        </div>
      </div>

      {/* Live sources banner */}
      <div className="mt-5 rounded-2xl border border-macau-navy/10 bg-white p-4 shadow-card">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="text-sm text-macau-navy/70">
            <div className="flex flex-wrap items-center gap-2 font-semibold text-macau-navy">
              <span className="inline-flex items-center gap-1.5">
                <BadgeCheck className="h-4 w-4 text-macau-teal" />
                {tr("sourceOfficial")}
              </span>
              <span className="text-macau-navy/30">·</span>
              <span className="inline-flex items-center gap-1.5 text-macau-teal">
                <ExternalLink className="h-4 w-4" />
                {tr("sourceJobscall")}
              </span>
              <span className="text-macau-navy/30">·</span>
              <span className="inline-flex items-center gap-1.5 text-amber-700">
                <ExternalLink className="h-4 w-4" />
                {tr("sourceHelloJobs")}
              </span>
            </div>
            <p className="mt-1 text-xs leading-relaxed text-macau-navy/55">
              {tr("officialNote")}
            </p>
            <div className="mt-2 flex flex-wrap gap-3 text-xs">
              {dsalStats?.officialTotalVacancies != null && (
                <span>
                  {tr("officialMarketTotal")}:{" "}
                  <strong className="text-macau-navy">
                    {dsalStats.officialTotalVacancies.toLocaleString()}
                  </strong>
                </span>
              )}
              <span>
                {officialJobs.length} {tr("officialLoaded")}
              </span>
              <span>
                {jobscallJobs.length} {tr("jobscallLoaded")}
                {jobscallStats?.companies != null &&
                  ` (${jobscallStats.companies} ${lang === "zh" ? "僱主" : "employers"})`}
              </span>
              <span>
                {hellojobsJobs.length} {tr("hellojobsLoaded")}
                {hellojobsStats?.totalOnBoard != null &&
                  ` (${lang === "zh" ? "板上約" : "~"}${hellojobsStats.totalOnBoard.toLocaleString()}${lang === "zh" ? "" : " on board"})`}
              </span>
              {(dsalFetchedAt || jobscallFetchedAt || hellojobsFetchedAt) && (
                <span className="text-macau-navy/40">
                  {new Date(
                    dsalFetchedAt ||
                      jobscallFetchedAt ||
                      hellojobsFetchedAt ||
                      ""
                  ).toLocaleString()}
                </span>
              )}
            </div>
            {dsalError && (
              <p className="mt-2 inline-flex items-center gap-1 text-xs text-macau-red">
                <AlertCircle className="h-3.5 w-3.5" />
                {tr("dsalLoadError")}: {dsalError}
              </p>
            )}
            {jobscallError && (
              <p className="mt-1 inline-flex items-center gap-1 text-xs text-macau-red">
                <AlertCircle className="h-3.5 w-3.5" />
                {tr("jobscallLoadError")}: {jobscallError}
              </p>
            )}
            {hellojobsError && (
              <p className="mt-1 inline-flex items-center gap-1 text-xs text-macau-red">
                <AlertCircle className="h-3.5 w-3.5" />
                {tr("hellojobsLoadError")}: {hellojobsError}
              </p>
            )}
          </div>
          <button
            type="button"
            onClick={refreshAll}
            disabled={loading}
            className={clsx(
              "inline-flex items-center justify-center gap-2 rounded-xl bg-macau-navy px-4 py-2.5 text-sm font-semibold text-white transition",
              loading && "opacity-60"
            )}
          >
            <RefreshCw className={clsx("h-4 w-4", loading && "animate-spin")} />
            {loading ? tr("loadingOfficial") : tr("refreshOfficial")}
          </button>
        </div>
      </div>

      <div className="mt-6 flex flex-col gap-3 rounded-2xl border border-macau-navy/8 bg-white p-4 shadow-card md:flex-row md:items-center">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-macau-navy/35" />
          <input
            value={qInput}
            onChange={(e) => setQInput(e.target.value)}
            placeholder={tr("searchPlaceholder")}
            className="w-full rounded-xl border border-macau-navy/10 bg-macau-cream/50 py-2.5 pl-10 pr-3 text-sm outline-none focus:border-macau-teal focus:ring-2 focus:ring-macau-teal/20"
          />
        </div>
        <select
          value={source}
          onChange={(e) => setSource(e.target.value as SourceFilter)}
          className="rounded-xl border border-macau-navy/10 bg-white px-3 py-2.5 text-sm outline-none focus:border-macau-teal"
        >
          <option value="all">{tr("sourceFilterAll")}</option>
          <option value="dsal">{tr("sourceFilterOfficial")}</option>
          <option value="jobscall">{tr("sourceFilterJobscall")}</option>
          <option value="hellojobs">{tr("sourceFilterHelloJobs")}</option>
        </select>
        <select
          value={lane}
          onChange={(e) => setLane(e.target.value)}
          className="rounded-xl border border-macau-navy/10 bg-white px-3 py-2.5 text-sm outline-none focus:border-macau-teal"
        >
          <option value="">{tr("allLanes")}</option>
          {LANES.map((l) => (
            <option key={l} value={l}>
              {laneLabel(lang, l)}
            </option>
          ))}
        </select>
        <select
          value={sector}
          onChange={(e) => setSector(e.target.value)}
          className="rounded-xl border border-macau-navy/10 bg-white px-3 py-2.5 text-sm outline-none focus:border-macau-teal"
        >
          <option value="">{tr("allSectors")}</option>
          {SECTORS.map((s) => (
            <option key={s} value={s}>
              {sectorLabel(lang, s)}
            </option>
          ))}
        </select>
      </div>

      <details className="mt-3 rounded-2xl border border-macau-navy/8 bg-white p-4 shadow-card">
        <summary className="cursor-pointer text-sm font-semibold text-macau-navy">
          {lang === "zh" ? "青年精準篩選" : "Youth-focused filters"}
        </summary>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <select value={district} onChange={(e) => setDistrict(e.target.value)} className="rounded-xl border px-3 py-2 text-sm">
            <option value="">{lang === "zh" ? "所有地區" : "All districts"}</option>
            {["Macau Peninsula", "Taipa", "Cotai", "Coloane"].map((item) => <option key={item}>{item}</option>)}
          </select>
          <select value={minPay} onChange={(e) => setMinPay(Number(e.target.value))} className="rounded-xl border px-3 py-2 text-sm">
            <option value={0}>{lang === "zh" ? "不限最低薪酬" : "Any minimum pay"}</option>
            {[8000, 12000, 15000, 20000].map((amount) => <option key={amount} value={amount}>MOP {amount.toLocaleString()}+</option>)}
          </select>
          <select value={days} onChange={(e) => setDays(Number(e.target.value))} className="rounded-xl border px-3 py-2 text-sm">
            <option value={0}>{lang === "zh" ? "所有發佈日期" : "Any posted date"}</option>
            <option value={7}>{lang === "zh" ? "最近 7 日" : "Last 7 days"}</option>
            <option value={30}>{lang === "zh" ? "最近 30 日" : "Last 30 days"}</option>
          </select>
          <div className="flex flex-col gap-2 text-sm">
            <label><input type="checkbox" checked={youthOnly} onChange={(e) => setYouthOnly(e.target.checked)} className="mr-2" />{lang === "zh" ? "青年友善" : "Youth-friendly"}</label>
            <label><input type="checkbox" checked={minorsOnly} onChange={(e) => setMinorsOnly(e.target.checked)} className="mr-2" />{lang === "zh" ? "接受未成年" : "Minors allowed"}</label>
            <label><input type="checkbox" checked={trainingOnly} onChange={(e) => setTrainingOnly(e.target.checked)} className="mr-2" />{lang === "zh" ? "提供培訓" : "Training provided"}</label>
          </div>
        </div>
      </details>

      <div className="mt-4 text-sm text-macau-navy/45">
        {filtered.length} {lang === "zh" ? "個職位" : "jobs"}
        {filtered.length > PAGE_SIZE && (
          <span>
            {" "}
            · {lang === "zh" ? "第" : "page"} {safePage + 1}/{totalPages}
          </span>
        )}
        {loading && ` · ${tr("loadingOfficial")}`}
      </div>

      {filtered.length === 0 ? (
        <p className="mt-10 text-center text-macau-navy/50">{tr("noJobs")}</p>
      ) : (
        <>
          <div className="mt-4 grid gap-4 md:grid-cols-2">
            {pageItems.map((job) => (
              <JobCard
                key={job.id}
                job={job}
                aiStrip={aiStrips[job.id] || null}
              />
            ))}
          </div>

          {totalPages > 1 && (
            <div className="mt-8 flex flex-wrap items-center justify-center gap-2">
              <button
                type="button"
                disabled={safePage <= 0}
                onClick={() => setPage((p) => Math.max(0, p - 1))}
                className={clsx(
                  "rounded-xl px-4 py-2 text-sm font-medium transition",
                  safePage <= 0
                    ? "cursor-not-allowed bg-macau-navy/5 text-macau-navy/30"
                    : "bg-white text-macau-navy shadow-card hover:border-macau-teal/40 border border-macau-navy/10"
                )}
              >
                {lang === "zh" ? "上一頁" : "Previous"}
              </button>
              <span className="px-2 text-sm text-macau-navy/50">
                {safePage + 1} / {totalPages}
              </span>
              <button
                type="button"
                disabled={safePage >= totalPages - 1}
                onClick={() =>
                  setPage((p) => Math.min(totalPages - 1, p + 1))
                }
                className={clsx(
                  "rounded-xl px-4 py-2 text-sm font-medium transition",
                  safePage >= totalPages - 1
                    ? "cursor-not-allowed bg-macau-navy/5 text-macau-navy/30"
                    : "bg-macau-navy text-white hover:bg-macau-navy/90 shadow-sm"
                )}
              >
                {lang === "zh" ? "下一頁" : "Next"}
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
