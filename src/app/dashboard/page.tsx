"use client";

import { useEffect, useState } from "react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  BarChart,
  Bar,
  Legend,
  AreaChart,
  Area,
} from "recharts";
import { ExternalLink, Info, RefreshCw } from "lucide-react";
import { useApp } from "@/context/AppContext";
import {
  unemploymentTrend,
  employmentByIndustry,
  tourismSeasonIndex,
  trainingByDomain,
  onePlusFour,
  dataProvenance,
  keyFacts,
} from "@/lib/open-data";
import {
  macauLabourComposition,
  dashboardEmployerRows,
  formatHeadcount,
  confidenceLabel,
} from "@/lib/employer-transparency";
import { sectorLabel } from "@/lib/i18n";
import type { Sector } from "@/lib/types";
import clsx from "clsx";

interface NrwGroupRow {
  id: string;
  nameEn: string;
  nameZh: string;
  entityCount: number;
  residents: number;
  foreignTotal: number;
  totalEmployees: number;
  localSharePct: number | null;
  foreignSharePct: number | null;
  industry: string;
  isBrandGroup: boolean;
  topMembers: {
    nameZh: string;
    namePt: string;
    residents: number;
    foreignTotal: number;
  }[];
}

interface NrwSummary {
  entityCount: number;
  totalResidents: number;
  totalForeign: number;
  totalEmployees: number;
  foreignSharePct: number | null;
  referenceDate: string;
  sourceUrl: string;
  brandGroupCount: number;
  topGroups: NrwGroupRow[];
  topForeign: {
    nameZh: string;
    namePt: string;
    residents: number;
    foreignTotal: number;
    totalEmployees: number;
    localSharePct: number | null;
    foreignSharePct: number | null;
    industry: string;
  }[];
  byIndustry: {
    industry: string;
    entities: number;
    residents: number;
    foreign: number;
  }[];
}

export default function DashboardPage() {
  const { tr, lang, wageBenchmarks, officialJobs } = useApp();
  const employerRows = dashboardEmployerRows();
  const [nrw, setNrw] = useState<NrwSummary | null>(null);
  const [nrwLoading, setNrwLoading] = useState(false);
  const [nrwError, setNrwError] = useState<string | null>(null);

  const loadNrw = async (force = false) => {
    setNrwLoading(true);
    setNrwError(null);
    try {
      const cacheKey = "myeib_dsal_nrw_summary_v1";
      if (!force) {
        try {
          const raw = sessionStorage.getItem(cacheKey);
          if (raw) {
            const parsed = JSON.parse(raw) as { at: number; nrw: NrwSummary };
            if (
              Date.now() - parsed.at < 15 * 60 * 1000 &&
              parsed.nrw?.entityCount
            ) {
              setNrw(parsed.nrw);
              setNrwLoading(false);
              return;
            }
          }
        } catch {
          /* ignore */
        }
      }

      const qs = force ? "?force=1" : "";
      const res = await fetch(`/api/dsal/nrw${qs}`);
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data.error || `HTTP ${res.status}`);
      const next: NrwSummary = {
        entityCount: data.entityCount ?? data.summary?.entityCount ?? 0,
        totalResidents: data.summary?.totalResidents ?? 0,
        totalForeign: data.summary?.totalForeign ?? 0,
        totalEmployees: data.summary?.totalEmployees ?? 0,
        foreignSharePct: data.summary?.foreignSharePct ?? null,
        referenceDate: data.referenceDate,
        sourceUrl: data.sourceUrl,
        brandGroupCount:
          data.brandGroupCount ?? data.summary?.brandGroupCount ?? 0,
        topGroups: data.topGroups || data.summary?.topGroups || [],
        topForeign: data.topForeign || [],
        byIndustry: data.summary?.byIndustry || [],
      };
      setNrw(next);
      try {
        sessionStorage.setItem(
          cacheKey,
          JSON.stringify({ at: Date.now(), nrw: next })
        );
      } catch {
        /* quota */
      }
    } catch (e) {
      setNrwError(e instanceof Error ? e.message : "Failed to load DSAL A3");
    } finally {
      setNrwLoading(false);
    }
  };

  useEffect(() => {
    void loadNrw(false);
  }, []);

  const industryData = employmentByIndustry.map((d) => ({
    name: lang === "zh" ? d.sectorZh : d.sector,
    share: d.share,
    jobs: d.jobs,
  }));

  const tourismData = tourismSeasonIndex.map((d) => ({
    name: lang === "zh" ? d.monthZh : d.month,
    index: d.index,
    visitors: d.visitors,
  }));

  const trainingData = trainingByDomain.map((d) => ({
    name: lang === "zh" ? d.domainZh : d.domain,
    courses: d.courses,
    trainees: d.trainees,
  }));

  const earningsData = (Object.keys(wageBenchmarks) as Sector[]).map((sector) => {
    const b = wageBenchmarks[sector];
    return {
      name: sectorLabel(lang, sector),
      median: b.medianMonthly,
      sample: b.sampleSize,
      method: b.method,
    };
  });

  return (
    <div className="mx-auto max-w-6xl px-4 py-10">
      <h1 className="text-3xl font-bold text-macau-navy">{tr("dashboardTitle")}</h1>
      <p className="mt-2 max-w-3xl text-macau-navy/60">{tr("dashboardSub")}</p>

      <div className="mt-4 flex items-start gap-2 rounded-xl border border-macau-gold/30 bg-macau-gold/10 px-4 py-3 text-sm text-macau-navy/70">
        <Info className="mt-0.5 h-4 w-4 shrink-0 text-macau-gold" />
        <span>{tr("notRealtime")}</span>
      </div>

      {/* KPI cards */}
      <div className="mt-8 grid grid-cols-2 gap-3 md:grid-cols-4">
        {[
          {
            label: lang === "zh" ? "整體失業率" : "General UE",
            value: `${keyFacts.generalUnemployment}%`,
          },
          {
            label: lang === "zh" ? "本地居民失業率" : "Local residents UE",
            value: `${keyFacts.localUnemployment}%`,
          },
          {
            label: lang === "zh" ? "青年失業率（參考）" : "Youth UE (ref.)",
            value: `${keyFacts.youthUnemployment}%`,
          },
          {
            label: lang === "zh" ? "開放數據集" : "Open datasets",
            value: keyFacts.openDatasets.toLocaleString(),
          },
        ].map((k) => (
          <div
            key={k.label}
            className="rounded-2xl border border-macau-navy/8 bg-white p-4 shadow-card"
          >
            <div className="text-2xl font-bold text-macau-navy">{k.value}</div>
            <div className="mt-1 text-xs text-macau-navy/50">{k.label}</div>
          </div>
        ))}
      </div>

      {/* Official DSAL A3 — group-aggregated ranking */}
      <section className="mt-8 rounded-3xl border border-macau-teal/25 bg-white p-6 shadow-card">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h2 className="text-lg font-bold text-macau-navy">
              {lang === "zh"
                ? "勞工局表 A3：外地僱員（集團加總）"
                : "DSAL Table A3 — non-resident workers (group totals)"}
            </h2>
            <p className="mt-1 text-xs leading-relaxed text-macau-navy/55">
              {lang === "zh"
                ? "官方數據來自勞工局 A3 名單（本地：社保基金；外地：治安警察局）。同一集團下多個法人實體已合併加總，避免單一 SPV 低估集團外僱規模。"
                : "Official DSAL A3 list (residents: FSS; NRW: CPSP). Related legal entities under the same corporate group are summed so single SPVs do not understate group non-resident employment."}
            </p>
          </div>
          <button
            type="button"
            onClick={() => void loadNrw(true)}
            disabled={nrwLoading}
            className={clsx(
              "inline-flex items-center gap-2 rounded-xl bg-macau-navy px-3 py-2 text-xs font-semibold text-white",
              nrwLoading && "opacity-60"
            )}
          >
            <RefreshCw className={clsx("h-3.5 w-3.5", nrwLoading && "animate-spin")} />
            {nrwLoading
              ? lang === "zh"
                ? "載入中…"
                : "Loading…"
              : lang === "zh"
                ? "重新抓取 PDF"
                : "Re-fetch PDF"}
          </button>
        </div>

        {nrwError && (
          <p className="mt-3 text-xs text-macau-red">{nrwError}</p>
        )}

        {nrw && (
          <>
            <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-4">
              <div className="rounded-2xl bg-macau-navy/5 px-4 py-3">
                <div className="text-[11px] text-macau-navy/50">
                  {lang === "zh" ? "A3 法人實體數" : "A3 legal entities"}
                </div>
                <div className="mt-1 text-2xl font-bold text-macau-navy">
                  {formatHeadcount(nrw.entityCount, lang)}
                </div>
              </div>
              <div className="rounded-2xl bg-macau-teal/10 px-4 py-3">
                <div className="text-[11px] text-macau-teal">
                  {tr("workforceLocal")}
                </div>
                <div className="mt-1 text-2xl font-bold text-macau-teal">
                  {formatHeadcount(nrw.totalResidents, lang)}
                </div>
              </div>
              <div className="rounded-2xl bg-macau-gold/15 px-4 py-3">
                <div className="text-[11px] text-macau-navy/60">
                  {tr("workforceForeign")}
                </div>
                <div className="mt-1 text-2xl font-bold text-macau-navy">
                  {formatHeadcount(nrw.totalForeign, lang)}
                </div>
              </div>
              <div className="rounded-2xl bg-macau-red/5 px-4 py-3">
                <div className="text-[11px] text-macau-navy/60">
                  {lang === "zh" ? "已識別品牌集團" : "Brand groups mapped"}
                </div>
                <div className="mt-1 text-2xl font-bold text-macau-navy">
                  {nrw.brandGroupCount || "—"}
                </div>
              </div>
            </div>
            <p className="mt-2 text-[11px] text-macau-navy/45">
              {lang === "zh" ? "資料時點" : "As of"}: {nrw.referenceDate}
              {nrw.foreignSharePct != null && (
                <>
                  {" · "}
                  {lang === "zh" ? "名單外地佔比" : "list NRW share"}{" "}
                  {nrw.foreignSharePct}%
                </>
              )}
              {" · "}
              <a
                href={nrw.sourceUrl}
                target="_blank"
                rel="noreferrer"
                className="text-macau-teal hover:underline inline-flex items-center gap-0.5"
              >
                DSAL A3 PDF <ExternalLink className="h-3 w-3" />
              </a>
            </p>

            <h3 className="mt-6 text-sm font-bold text-macau-navy">
              {lang === "zh"
                ? "外地僱員最多的集團（法人實體已加總）"
                : "Top groups by non-resident workers (legal entities summed)"}
            </h3>
            <div className="mt-3 overflow-x-auto">
              <table className="w-full min-w-[760px] text-left text-xs">
                <thead>
                  <tr className="border-b border-macau-navy/10 text-macau-navy/50">
                    <th className="py-2 pr-3 font-medium">#</th>
                    <th className="py-2 pr-3 font-medium">
                      {lang === "zh" ? "集團／僱主" : "Group / employer"}
                    </th>
                    <th className="py-2 pr-3 font-medium">
                      {lang === "zh" ? "實體數" : "Entities"}
                    </th>
                    <th className="py-2 pr-3 font-medium">{tr("workforceLocal")}</th>
                    <th className="py-2 pr-3 font-medium">{tr("workforceForeign")}</th>
                    <th className="py-2 pr-3 font-medium">
                      {lang === "zh" ? "外地%" : "NRW %"}
                    </th>
                    <th className="py-2 font-medium">
                      {lang === "zh" ? "主要行業" : "Main industry"}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {(nrw.topGroups.length
                    ? nrw.topGroups
                    : []
                  )
                    .slice(0, 20)
                    .map((g, i) => (
                      <tr
                        key={g.id}
                        className="border-b border-macau-navy/5 text-macau-navy/75"
                      >
                        <td className="py-2 pr-3 text-macau-navy/40 align-top">
                          {i + 1}
                        </td>
                        <td className="py-2 pr-3 align-top">
                          <div className="font-medium text-macau-navy">
                            {lang === "zh" ? g.nameZh : g.nameEn}
                          </div>
                          {g.isBrandGroup && g.topMembers?.length > 1 && (
                            <details className="mt-1">
                              <summary className="cursor-pointer text-[10px] text-macau-teal">
                                {lang === "zh"
                                  ? "展開主要實體"
                                  : "Show top entities"}
                              </summary>
                              <ul className="mt-1 space-y-0.5 text-[10px] text-macau-navy/55">
                                {g.topMembers.slice(0, 5).map((m, j) => (
                                  <li key={j} className="flex justify-between gap-2">
                                    <span className="truncate max-w-[220px]">
                                      {lang === "zh"
                                        ? m.nameZh || m.namePt
                                        : m.namePt || m.nameZh}
                                    </span>
                                    <span className="shrink-0 tabular-nums">
                                      NRW {m.foreignTotal.toLocaleString()}
                                    </span>
                                  </li>
                                ))}
                              </ul>
                            </details>
                          )}
                          {g.isBrandGroup && (
                            <span className="mt-0.5 inline-block rounded bg-macau-teal/10 px-1.5 py-0.5 text-[9px] font-semibold text-macau-teal">
                              {lang === "zh" ? "品牌集團" : "Brand group"}
                            </span>
                          )}
                        </td>
                        <td className="py-2 pr-3 align-top tabular-nums">
                          {g.entityCount}
                        </td>
                        <td className="py-2 pr-3 text-macau-teal align-top tabular-nums">
                          {formatHeadcount(g.residents, lang)}
                        </td>
                        <td className="py-2 pr-3 align-top tabular-nums font-semibold">
                          {formatHeadcount(g.foreignTotal, lang)}
                        </td>
                        <td className="py-2 pr-3 align-top">
                          <span
                            className={
                              (g.foreignSharePct ?? 0) > 30
                                ? "font-semibold text-macau-red"
                                : "font-semibold text-macau-navy"
                            }
                          >
                            {g.foreignSharePct ?? "—"}%
                          </span>
                        </td>
                        <td className="py-2 text-macau-navy/50 align-top">
                          {g.industry?.slice(0, 36)}
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>

            {/* Optional: raw single-entity ranking for comparison */}
            {nrw.topForeign.length > 0 && (
              <details className="mt-5 rounded-xl border border-macau-navy/8 bg-macau-cream/30 px-4 py-3">
                <summary className="cursor-pointer text-xs font-semibold text-macau-navy/65">
                  {lang === "zh"
                    ? "對照：未加總的單一法人實體排行（原始 A3）"
                    : "Compare: raw single legal entities (unaggregated A3)"}
                </summary>
                <div className="mt-3 overflow-x-auto">
                  <table className="w-full min-w-[640px] text-left text-xs">
                    <thead>
                      <tr className="border-b border-macau-navy/10 text-macau-navy/50">
                        <th className="py-2 pr-3 font-medium">#</th>
                        <th className="py-2 pr-3 font-medium">
                          {lang === "zh" ? "法人實體" : "Legal entity"}
                        </th>
                        <th className="py-2 pr-3 font-medium">
                          {tr("workforceLocal")}
                        </th>
                        <th className="py-2 pr-3 font-medium">
                          {tr("workforceForeign")}
                        </th>
                        <th className="py-2 font-medium">
                          {lang === "zh" ? "外地%" : "NRW %"}
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {nrw.topForeign.slice(0, 15).map((e, i) => (
                        <tr
                          key={`${e.nameZh}-raw-${i}`}
                          className="border-b border-macau-navy/5 text-macau-navy/70"
                        >
                          <td className="py-1.5 pr-3 text-macau-navy/40">
                            {i + 1}
                          </td>
                          <td className="py-1.5 pr-3">
                            {lang === "zh"
                              ? e.nameZh || e.namePt
                              : e.namePt || e.nameZh}
                          </td>
                          <td className="py-1.5 pr-3 text-macau-teal">
                            {formatHeadcount(e.residents, lang)}
                          </td>
                          <td className="py-1.5 pr-3">
                            {formatHeadcount(e.foreignTotal, lang)}
                          </td>
                          <td className="py-1.5">
                            {e.foreignSharePct ?? "—"}%
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </details>
            )}
          </>
        )}

        {/* Territory context (DSEC/DSAL macros) */}
        <div className="mt-6 rounded-2xl border border-macau-navy/8 bg-macau-cream/40 p-4">
          <h3 className="text-sm font-bold text-macau-navy">
            {tr("workforceMacroTitle")}
          </h3>
          <p className="mt-1 text-[11px] text-macau-navy/50">
            {lang === "zh"
              ? macauLabourComposition.noteZh
              : macauLabourComposition.noteEn}
          </p>
          <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-3 text-xs">
            <div>
              <span className="text-macau-navy/50">{tr("workforceMacroResidents")}: </span>
              <strong>
                {formatHeadcount(macauLabourComposition.employedResidents, lang)}
              </strong>
              <span className="text-macau-navy/40"> (DSEC)</span>
            </div>
            <div>
              <span className="text-macau-navy/50">{tr("workforceMacroForeign")}: </span>
              <strong>
                {formatHeadcount(macauLabourComposition.nonResidentWorkers, lang)}
              </strong>
              <span className="text-macau-navy/40"> (DSAL scale)</span>
            </div>
            <div>
              <span className="text-macau-navy/50">{tr("workforceMacroGaming")}: </span>
              <strong>
                {macauLabourComposition.gamingOperatorsForeignSharePct}%
              </strong>
            </div>
          </div>
        </div>

        <h3 className="mt-6 text-sm font-bold text-macau-navy">
          {lang === "zh"
            ? "Jobscall 對照用估算名錄（非 A3 官方）"
            : "Jobscall-oriented estimates (not A3 official)"}
        </h3>
        <div className="mt-3 overflow-x-auto max-h-64 overflow-y-auto">
          <table className="w-full min-w-[640px] text-left text-xs">
            <thead className="sticky top-0 bg-white">
              <tr className="border-b border-macau-navy/10 text-macau-navy/50">
                <th className="py-2 pr-3 font-medium">
                  {lang === "zh" ? "僱主" : "Employer"}
                </th>
                <th className="py-2 pr-3 font-medium">{tr("workforceTotal")}</th>
                <th className="py-2 pr-3 font-medium">{tr("workforceForeign")}</th>
                <th className="py-2 font-medium">
                  {lang === "zh" ? "可信度" : "Confidence"}
                </th>
              </tr>
            </thead>
            <tbody>
              {employerRows.slice(0, 30).map((e) => (
                <tr
                  key={e.id}
                  className="border-b border-macau-navy/5 text-macau-navy/75"
                >
                  <td className="py-2 pr-3 font-medium text-macau-navy">
                    {lang === "zh" ? e.nameZh : e.name}
                  </td>
                  <td className="py-2 pr-3">
                    {formatHeadcount(e.totalEmployees, lang)}
                  </td>
                  <td className="py-2 pr-3">
                    {formatHeadcount(e.foreignEmployees, lang)}
                    {e.foreignSharePct != null && (
                      <span className="text-macau-navy/40">
                        {" "}
                        ({e.foreignSharePct}%)
                      </span>
                    )}
                  </td>
                  <td className="py-2">{confidenceLabel(e.confidence, lang)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* Unemployment chart */}
      <section className="mt-8 rounded-3xl border border-macau-navy/8 bg-white p-6 shadow-card">
        <h2 className="text-lg font-bold text-macau-navy">{tr("unemploymentTrend")}</h2>
        <p className="mt-1 text-xs text-macau-navy/45">
          {lang === "zh"
            ? "青年失業率約為整體的 3–4 倍——問題在於錯配與資訊，而不只是「沒有職位」。"
            : "Youth rate is ~3–4× overall — the issue is mismatch & information, not only “no jobs”."}
        </p>
        <div className="mt-4 h-72 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={unemploymentTrend}>
              <CartesianGrid strokeDasharray="3 3" stroke="#0B1F3A15" />
              <XAxis dataKey="period" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} unit="%" domain={[0, 8]} />
              <Tooltip />
              <Legend />
              <Line
                type="monotone"
                dataKey="general"
                name={lang === "zh" ? "整體" : "General"}
                stroke="#0D9488"
                strokeWidth={2}
                dot={false}
              />
              <Line
                type="monotone"
                dataKey="local"
                name={lang === "zh" ? "本地居民" : "Local"}
                stroke="#0B1F3A"
                strokeWidth={2}
                dot={false}
              />
              <Line
                type="monotone"
                dataKey="youth"
                name={lang === "zh" ? "青年" : "Youth"}
                stroke="#C8102E"
                strokeWidth={2.5}
                dot={false}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </section>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        {/* Industry */}
        <section className="rounded-3xl border border-macau-navy/8 bg-white p-6 shadow-card">
          <h2 className="text-lg font-bold text-macau-navy">{tr("byIndustry")}</h2>
          <div className="mt-4 h-80">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={industryData} layout="vertical" margin={{ left: 20 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#0B1F3A15" />
                <XAxis type="number" unit="%" tick={{ fontSize: 11 }} />
                <YAxis
                  type="category"
                  dataKey="name"
                  width={100}
                  tick={{ fontSize: 10 }}
                />
                <Tooltip />
                <Bar dataKey="share" name="%" fill="#0D9488" radius={[0, 6, 6, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </section>

        {/* Tourism season */}
        <section className="rounded-3xl border border-macau-navy/8 bg-white p-6 shadow-card">
          <h2 className="text-lg font-bold text-macau-navy">{tr("tourismSeason")}</h2>
          <p className="mt-1 text-xs text-macau-navy/45">
            {lang === "zh"
              ? "訪客高峰（暑期、黃金周）往往推高餐飲／零售兼職需求。"
              : "Visitor peaks (summer, holidays) often lift F&B / retail part-time demand."}
          </p>
          <div className="mt-4 h-72">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={tourismData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#0B1F3A15" />
                <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip />
                <Area
                  type="monotone"
                  dataKey="index"
                  name={lang === "zh" ? "招聘指數" : "Hiring index"}
                  stroke="#C8102E"
                  fill="#C8102E22"
                  strokeWidth={2}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </section>
      </div>

      {/* Earnings — live DSAL sample median where n≥5 */}
      <section className="mt-6 rounded-3xl border border-macau-navy/8 bg-white p-6 shadow-card">
        <h2 className="text-lg font-bold text-macau-navy">{tr("earnings")}</h2>
        <p className="mt-1 text-xs text-macau-navy/45">
          {lang === "zh"
            ? `優先：勞工局官方空缺樣本中位數（目前載入 ${officialJobs.length} 個）。樣本 n≥5 用實時中位；否則回退統計式參考。`
            : `Preferred: median of official DSAL vacancy midpoints (${officialJobs.length} loaded). Live median when n≥5; else statistical fallback.`}
        </p>
        <div className="mt-4 h-72">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={earningsData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#0B1F3A15" />
              <XAxis dataKey="name" tick={{ fontSize: 10 }} interval={0} angle={-20} textAnchor="end" height={60} />
              <YAxis tick={{ fontSize: 11 }} />
              <Tooltip
                formatter={(v: number, _n, item) => {
                  const p = item?.payload as { sample?: number; method?: string };
                  const tag =
                    p?.method === "dsal_sample"
                      ? lang === "zh"
                        ? `樣本 n=${p.sample}`
                        : `sample n=${p.sample}`
                      : lang === "zh"
                        ? "統計參考"
                        : "static ref";
                  return [`MOP ${Number(v).toLocaleString()} (${tag})`, lang === "zh" ? "月薪中位" : "Median /mo"];
                }}
              />
              <Bar dataKey="median" name="MOP" fill="#0B1F3A" radius={[6, 6, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
        <ul className="mt-3 grid gap-1 text-[11px] text-macau-navy/50 sm:grid-cols-2">
          {earningsData.map((row) => (
            <li key={row.name}>
              · {row.name}: n={row.sample}
              {row.method === "dsal_sample"
                ? lang === "zh"
                  ? "（官方樣本中位）"
                  : " (DSAL sample)"
                : lang === "zh"
                  ? "（回退參考）"
                  : " (fallback)"}
            </li>
          ))}
        </ul>
      </section>

      {/* Training */}
      <section className="mt-6 rounded-3xl border border-macau-navy/8 bg-white p-6 shadow-card">
        <h2 className="text-lg font-bold text-macau-navy">{tr("trainingSupply")}</h2>
        <p className="mt-1 text-xs text-macau-navy/45">
          {lang === "zh"
            ? "對應 data.gov.mo 培訓類數據集（課程數、學員數等概念）。"
            : "Mapped to data.gov.mo training-category concepts (courses, trainees)."}
        </p>
        <div className="mt-4 h-72">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={trainingData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#0B1F3A15" />
              <XAxis dataKey="name" tick={{ fontSize: 10 }} interval={0} angle={-15} textAnchor="end" height={70} />
              <YAxis tick={{ fontSize: 11 }} />
              <Tooltip />
              <Legend />
              <Bar
                dataKey="courses"
                name={lang === "zh" ? "課程" : "Courses"}
                fill="#C4A35A"
                radius={[4, 4, 0, 0]}
              />
              <Bar
                dataKey="trainees"
                name={lang === "zh" ? "學員" : "Trainees"}
                fill="#0D9488"
                radius={[4, 4, 0, 0]}
              />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </section>

      {/* 1+4 */}
      <section className="mt-6">
        <h2 className="text-lg font-bold text-macau-navy">{tr("onePlusFour")}</h2>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {onePlusFour.map((p) => (
            <div
              key={p.id}
              className="rounded-2xl border border-macau-navy/8 bg-white p-5 shadow-card"
              style={{ borderTopColor: p.color, borderTopWidth: 3 }}
            >
              <h3 className="font-semibold text-macau-navy">
                {lang === "zh" ? p.nameZh : p.name}
              </h3>
              <ul className="mt-3 space-y-1 text-sm text-macau-navy/65">
                {(lang === "zh" ? p.youthPathsZh : p.youthPaths).map((path) => (
                  <li key={path}>· {path}</li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </section>

      {/* Provenance */}
      <section className="mt-10 rounded-3xl border border-macau-navy/8 bg-macau-navy p-6 text-white">
        <h2 className="text-lg font-bold">{tr("provenance")}</h2>
        <p className="mt-1 text-sm text-white/50">
          {tr("lastRefreshed")}: {dataProvenance.lastRefreshed}
        </p>
        <ul className="mt-4 space-y-3">
          {dataProvenance.sources.map((s) => (
            <li key={s.url} className="flex items-start justify-between gap-4 text-sm">
              <div>
                <div className="font-medium text-white">
                  {lang === "zh" ? s.nameZh : s.name}
                </div>
                <div className="text-white/50">{s.note}</div>
              </div>
              <a
                href={s.url}
                target="_blank"
                rel="noreferrer"
                className="inline-flex shrink-0 items-center gap-1 text-macau-gold hover:underline"
              >
                <ExternalLink className="h-3.5 w-3.5" />
              </a>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
