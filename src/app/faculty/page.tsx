"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  GraduationCap,
  RefreshCw,
  ExternalLink,
  Search,
  Sparkles,
  Building2,
  AlertCircle,
  Clock,
} from "lucide-react";
import { useApp } from "@/context/AppContext";
import { MACAU_TOP4, type UniId } from "@/lib/macau-universities";
import {
  FACULTY_MAX_AGE_DAYS,
  rankLabel,
  type FacultyMatchResult,
  type FacultyPosition,
  type FacultyRank,
} from "@/lib/faculty-jobs";
import type { CvFeatures } from "@/lib/cv-extract";
import { FacultyAlertsPanel } from "@/components/FacultyAlerts";
import clsx from "clsx";

const RANKS: { id: FacultyRank | ""; labelEn: string; labelZh: string }[] = [
  { id: "", labelEn: "All ranks", labelZh: "全部職級" },
  { id: "assistant_professor", labelEn: "Assistant Professor", labelZh: "助理教授" },
  { id: "associate_professor", labelEn: "Associate Professor", labelZh: "副教授" },
  { id: "full_professor", labelEn: "Full Professor", labelZh: "教授" },
  { id: "research_professor", labelEn: "Research Professor", labelZh: "研究教授" },
  { id: "lecturer", labelEn: "Lecturer", labelZh: "講師" },
  { id: "instructor", labelEn: "Instructor", labelZh: "導師" },
  { id: "dean", labelEn: "Dean / Head", labelZh: "院長／系主任" },
];

export default function FacultyPage() {
  const { lang, youth } = useApp();
  const [loading, setLoading] = useState(true);
  const [matching, setMatching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [positions, setPositions] = useState<FacultyPosition[]>([]);
  const [matches, setMatches] = useState<FacultyMatchResult[] | null>(null);
  const [sources, setSources] = useState<
    { universityId: string; ok: boolean; count: number; error?: string }[]
  >([]);
  const [fetchedAt, setFetchedAt] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [university, setUniversity] = useState<UniId | "">("");
  const [rank, setRank] = useState<FacultyRank | "">("");
  const [note, setNote] = useState("");
  const [droppedStale, setDroppedStale] = useState(0);

  const load = useCallback(
    async (force = false) => {
      setLoading(true);
      setError(null);
      try {
        const params = new URLSearchParams();
        if (force) params.set("force", "1");
        if (university) params.set("university", university);
        if (q.trim()) params.set("q", q.trim());
        if (rank) params.set("rank", rank);
        const res = await fetch(`/api/faculty/jobs?${params.toString()}`);
        const data = await res.json();
        if (!res.ok || !data.ok) throw new Error(data.error || "Load failed");
        setPositions(data.positions || []);
        setSources(data.sources || []);
        setFetchedAt(data.fetchedAt || null);
        setNote(data.note || "");
        setDroppedStale(Number(data.droppedStale || 0));
        setMatches(null);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to load");
      } finally {
        setLoading(false);
      }
    },
    [university, q, rank]
  );

  useEffect(() => {
    void load(false);
  }, [load]);

  const runCvMatch = async () => {
    setMatching(true);
    setError(null);
    try {
      const cvFeatures = (youth?.cv?.features || null) as CvFeatures | null;
      const res = await fetch("/api/faculty/jobs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          youth,
          cvFeatures,
          university: university || null,
          q: q.trim() || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data.error || "Match failed");
      let list = (data.matches || []) as FacultyMatchResult[];
      if (rank) {
        list = list.filter((m) => m.position.ranks.includes(rank));
      }
      setMatches(list);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Match failed");
    } finally {
      setMatching(false);
    }
  };

  const displayList: FacultyMatchResult[] = useMemo(() => {
    if (matches) return matches;
    return positions.map((p) => ({
      position: p,
      score: 0,
      reasons: [],
      reasonsZh: [],
    }));
  }, [matches, positions]);

  return (
    <div className="mx-auto max-w-6xl px-4 py-10">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="inline-flex items-center gap-2 rounded-full bg-macau-navy/5 px-3 py-1 text-xs font-semibold text-macau-navy">
            <GraduationCap className="h-3.5 w-3.5 text-macau-teal" />
            {lang === "zh" ? "澳門四大高校教職" : "Macau Top-4 Faculty"}
          </div>
          <h1 className="mt-3 text-3xl font-bold text-macau-navy">
            {lang === "zh"
              ? "高校教職／學術職位搜尋"
              : "Academic faculty position search"}
          </h1>
          <p className="mt-2 max-w-2xl text-sm text-macau-navy/60 leading-relaxed">
            {lang === "zh"
              ? "匯集澳門大學、澳門科技大學、澳門理工大學、澳門城市大學的教學與研究招聘資訊。僅顯示近 12 個月發佈的職位（逾一年多半已結案）。可結合履歷排序，並訂閱澳大／科大新盤提醒。"
              : "Teaching & research openings from UM, MUST, MPU and CityU. Only posts from the last 12 months are listed/ranked (older academic-year ads are treated as closed). Rank by CV and subscribe to UM/MUST alerts."}
          </p>
        </div>
        <button
          type="button"
          onClick={() => void load(true)}
          disabled={loading}
          className="inline-flex items-center gap-2 rounded-xl bg-macau-navy px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50"
        >
          <RefreshCw className={clsx("h-4 w-4", loading && "animate-spin")} />
          {lang === "zh" ? "重新整理" : "Refresh"}
        </button>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2 text-xs text-macau-navy/50">
        <span className="inline-flex items-center gap-1 rounded-full bg-macau-cream px-2.5 py-1 font-medium">
          <Clock className="h-3.5 w-3.5 text-macau-teal" />
          {lang === "zh"
            ? `僅列近 ${FACULTY_MAX_AGE_DAYS} 天內發佈`
            : `Only posts within ${FACULTY_MAX_AGE_DAYS} days`}
        </span>
        {droppedStale > 0 && (
          <span>
            {lang === "zh"
              ? `已隱藏 ${droppedStale} 個逾一年舊帖`
              : `${droppedStale} post(s) older than 1 year hidden`}
          </span>
        )}
      </div>

      {/* UM / MUST alerts */}
      <FacultyAlertsPanel positions={positions} lang={lang} />

      {/* University cards */}
      <div className="mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {MACAU_TOP4.map((u) => {
          const src = sources.find((s) => s.universityId === u.id);
          const count = positions.filter((p) => p.universityId === u.id).length;
          const active = university === u.id;
          return (
            <button
              key={u.id}
              type="button"
              onClick={() =>
                setUniversity((prev) => (prev === u.id ? "" : u.id))
              }
              className={clsx(
                "rounded-2xl border p-4 text-left transition shadow-card",
                active
                  ? "border-macau-teal bg-macau-sky/40"
                  : "border-macau-navy/8 bg-white hover:border-macau-teal/30"
              )}
            >
              <div
                className="h-1 w-10 rounded-full"
                style={{ background: u.color }}
              />
              <div className="mt-2 text-sm font-bold text-macau-navy">
                {lang === "zh" ? u.nameZh : u.nameEn}
              </div>
              <div className="text-xs text-macau-navy/45">
                {lang === "zh" ? u.shortZh : u.shortEn}
                {src
                  ? src.ok
                    ? ` · ${count} listed`
                    : ` · ${lang === "zh" ? "入口" : "portal"}`
                  : ""}
              </div>
              <a
                href={u.careersUrl}
                target="_blank"
                rel="noreferrer"
                onClick={(e) => e.stopPropagation()}
                className="mt-2 inline-flex items-center gap-1 text-[11px] font-medium text-macau-teal hover:underline"
              >
                {lang === "zh" ? "官方招聘" : "Official careers"}{" "}
                <ExternalLink className="h-3 w-3" />
              </a>
            </button>
          );
        })}
      </div>

      {/* Filters */}
      <div className="mt-6 flex flex-col gap-3 rounded-2xl border border-macau-navy/8 bg-white p-4 shadow-card md:flex-row md:items-center">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-macau-navy/35" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && void load(false)}
            placeholder={
              lang === "zh"
                ? "搜尋：Data Science、教育、經濟…"
                : "Search: Data Science, Education, Economics…"
            }
            className="w-full rounded-xl border border-macau-navy/10 bg-macau-cream/40 py-2.5 pl-10 pr-3 text-sm outline-none focus:border-macau-teal"
          />
        </div>
        <select
          value={rank}
          onChange={(e) => setRank(e.target.value as FacultyRank | "")}
          className="rounded-xl border border-macau-navy/10 px-3 py-2.5 text-sm"
        >
          {RANKS.map((r) => (
            <option key={r.id || "all"} value={r.id}>
              {lang === "zh" ? r.labelZh : r.labelEn}
            </option>
          ))}
        </select>
        <button
          type="button"
          onClick={() => void load(false)}
          className="rounded-xl border border-macau-navy/15 px-4 py-2.5 text-sm font-medium hover:bg-macau-cream"
        >
          {lang === "zh" ? "套用篩選" : "Apply filters"}
        </button>
        <button
          type="button"
          onClick={() => void runCvMatch()}
          disabled={matching || !youth}
          className="inline-flex items-center gap-2 rounded-xl bg-macau-teal px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-40"
          title={
            !youth
              ? lang === "zh"
                ? "請先建立檔案或上傳履歷"
                : "Create a profile or upload a CV first"
              : undefined
          }
        >
          <Sparkles className={clsx("h-4 w-4", matching && "animate-pulse")} />
          {lang === "zh" ? "按履歷排序" : "Rank by my CV"}
        </button>
      </div>

      {!youth && (
        <p className="mt-3 text-xs text-macau-navy/50">
          {lang === "zh" ? (
            <>
              尚未載入履歷／檔案 — 仍可瀏覽職位。前往{" "}
              <Link href="/youth" className="text-macau-teal font-semibold">
                青年檔案
              </Link>{" "}
              上傳履歷以啟用智能排序。
            </>
          ) : (
            <>
              No profile/CV loaded — you can still browse. Upload a CV on{" "}
              <Link href="/youth" className="text-macau-teal font-semibold">
                Youth
              </Link>{" "}
              to rank by fit.
            </>
          )}
        </p>
      )}

      {note && (
        <p className="mt-3 text-[11px] text-macau-navy/40 leading-relaxed">{note}</p>
      )}
      {fetchedAt && (
        <p className="text-[11px] text-macau-navy/35">
          {lang === "zh" ? "更新於" : "Fetched"}{" "}
          {new Date(fetchedAt).toLocaleString()} · {displayList.length}{" "}
          {lang === "zh" ? "項" : "posts"}
          {matches ? (lang === "zh" ? "（已按履歷排序）" : " (CV-ranked)") : ""}
        </p>
      )}

      {error && (
        <div className="mt-4 flex items-start gap-2 rounded-xl border border-macau-red/20 bg-macau-red/5 px-3 py-2 text-sm text-macau-red">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          {error}
        </div>
      )}

      {loading && (
        <p className="mt-10 text-center text-sm text-macau-navy/45">
          {lang === "zh"
            ? "正在匯集四大高校招聘資訊…"
            : "Aggregating top-4 university openings…"}
        </p>
      )}

      {!loading && displayList.length === 0 && (
        <p className="mt-10 text-center text-macau-navy/50">
          {lang === "zh" ? "沒有符合條件的職位" : "No positions match your filters"}
        </p>
      )}

      <div className="mt-6 grid gap-4">
        {displayList.map((item) => {
          const p = item.position;
          const uni = MACAU_TOP4.find((u) => u.id === p.universityId);
          return (
            <article
              key={p.id}
              className="rounded-2xl border border-macau-navy/8 bg-white p-5 shadow-card transition hover:border-macau-teal/25"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span
                      className="rounded-full px-2.5 py-0.5 text-[11px] font-semibold text-white"
                      style={{ background: uni?.color || "#0B1F3A" }}
                    >
                      {lang === "zh" ? uni?.shortZh : uni?.shortEn}
                    </span>
                    <span className="rounded-full bg-macau-cream px-2.5 py-0.5 text-[11px] text-macau-navy/60">
                      {p.category}
                    </span>
                    <span className="rounded-full bg-macau-sky/60 px-2.5 py-0.5 text-[11px] text-macau-teal">
                      {p.source === "live"
                        ? lang === "zh"
                          ? "即時"
                          : "Live"
                        : p.source === "rss"
                          ? "RSS"
                          : lang === "zh"
                            ? "官方入口"
                            : "Portal"}
                    </span>
                    {p.ranks.slice(0, 3).map((r) => (
                      <span
                        key={r}
                        className="rounded-full border border-macau-navy/10 px-2 py-0.5 text-[10px] text-macau-navy/55"
                      >
                        {rankLabel(r, lang === "zh")}
                      </span>
                    ))}
                  </div>
                  <h2 className="mt-2 text-lg font-bold text-macau-navy">
                    {p.title}
                  </h2>
                  <p className="mt-0.5 text-sm text-macau-navy/55">
                    <Building2 className="mr-1 inline h-3.5 w-3.5" />
                    {lang === "zh" ? p.universityNameZh : p.universityNameEn}
                    {p.unit ? ` · ${p.unit}` : ""}
                  </p>
                  {p.refNo && (
                    <p className="mt-1 text-xs text-macau-navy/40">
                      Ref: {p.refNo}
                      {p.postedAt ? ` · ${p.postedAt}` : ""}
                      {p.closeDate ? ` · close: ${p.closeDate}` : ""}
                    </p>
                  )}
                  {p.summary && (
                    <p className="mt-2 line-clamp-2 text-sm text-macau-navy/60">
                      {p.summary}
                    </p>
                  )}
                  {p.fields.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-1">
                      {p.fields.map((f) => (
                        <span
                          key={f}
                          className="rounded-md bg-macau-cream px-1.5 py-0.5 text-[10px] text-macau-navy/50"
                        >
                          {f}
                        </span>
                      ))}
                    </div>
                  )}
                  {item.score > 0 && item.reasons.length > 0 && (
                    <ul className="mt-3 space-y-0.5 text-xs text-macau-navy/65">
                      {(lang === "zh" ? item.reasonsZh : item.reasons).map(
                        (r, i) => (
                          <li key={i}>· {r}</li>
                        )
                      )}
                    </ul>
                  )}
                </div>
                <div className="flex flex-col items-end gap-2">
                  {item.score > 0 && (
                    <div className="flex h-14 w-14 flex-col items-center justify-center rounded-2xl bg-macau-teal/10 text-macau-teal">
                      <span className="text-lg font-bold leading-none">
                        {item.score}
                      </span>
                      <span className="text-[9px] font-medium uppercase">
                        {lang === "zh" ? "匹配" : "Fit"}
                      </span>
                    </div>
                  )}
                  <a
                    href={p.url}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1.5 rounded-xl bg-macau-red px-4 py-2 text-sm font-semibold text-white hover:bg-macau-red/90"
                  >
                    {lang === "zh" ? "官方申請" : "Apply officially"}
                    <ExternalLink className="h-3.5 w-3.5" />
                  </a>
                </div>
              </div>
            </article>
          );
        })}
      </div>

      <div className="mt-10 rounded-2xl border border-macau-navy/8 bg-macau-cream/50 p-5 text-xs text-macau-navy/55 leading-relaxed">
        <strong className="text-macau-navy">
          {lang === "zh" ? "資料來源說明" : "Data sources"}
        </strong>
        <ul className="mt-2 list-disc pl-4 space-y-1">
          <li>
            UM:{" "}
            <a
              className="text-macau-teal hover:underline"
              href="https://career.admo.um.edu.mo/"
              target="_blank"
              rel="noreferrer"
            >
              career.admo.um.edu.mo
            </a>{" "}
            (live table)
          </li>
          <li>
            MUST:{" "}
            <a
              className="text-macau-teal hover:underline"
              href="https://careers.must.edu.mo/?workClassification=TP&locale=en_US"
              target="_blank"
              rel="noreferrer"
            >
              careers.must.edu.mo
            </a>{" "}
            {lang === "zh"
              ? "（經官方 x-e-recruitment-api 拉取職位列表與詳細說明）"
              : "(via official x-e-recruitment-api for list + full JDs)"}
          </li>
          <li>
            MPU:{" "}
            <a
              className="text-macau-teal hover:underline"
              href="https://www.mpu.edu.mo/en/career.php"
              target="_blank"
              rel="noreferrer"
            >
              mpu.edu.mo career
            </a>
          </li>
          <li>
            CityU:{" "}
            <a
              className="text-macau-teal hover:underline"
              href="https://hro.cityu.edu.mo/en/category/job-application/teaching-en/"
              target="_blank"
              rel="noreferrer"
            >
              HRO teaching
            </a>
          </li>
        </ul>
      </div>
    </div>
  );
}
