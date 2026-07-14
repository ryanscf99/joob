"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useApp } from "@/context/AppContext";
import { JobCard } from "@/components/JobCard";
import { CvUpload } from "@/components/CvUpload";
import { matchJobsWithCv } from "@/lib/cv-match";
import type { CvFeatures } from "@/lib/cv-extract";
import { demoYouth } from "@/lib/storage";
import type { JobAiStrip } from "@/lib/job-ai-types";
import type { MatchEvidence, MatchResult } from "@/lib/types";
import { saveMatchRun } from "@/lib/repositories/seeker-repository";
import { applyLocalHireAndSalaryToMatchResults } from "@/lib/match-rank-signals";
import { lookupEmployerWorkforce } from "@/lib/employer-transparency";
import {
  FileText,
  Sparkles,
  Bot,
  Loader2,
  ListOrdered,
  Brain,
} from "lucide-react";
import clsx from "clsx";

/** Fewer jobs → one Grok call → much faster Smart Match */
const DEFAULT_LLM_DEPTH = 8;

interface LlmScoreRow {
  jobId: string;
  fitScore: number;
  verdict: string;
  reasons: string[];
  blurb: string;
  ruleMatchScore?: number;
  provider: "xai" | "heuristic";
  rank?: number;
}

interface DisplayMatchRow {
  job: MatchResult["job"];
  score: number;
  reasons: string[];
  reasonsZh: string[];
  evidence?: MatchEvidence;
  llm?: LlmScoreRow;
}

export default function MatchPage() {
  const {
    tr,
    lang,
    youth,
    setYouth,
    jobs,
    officialJobs,
    wageBenchmarks,
    dsalLoading,
    dsalStats,
    refreshOfficialJobs,
  } = useApp();
  const zh = lang === "zh";
  const [ran, setRan] = useState(false);
  const [matchLoading, setMatchLoading] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);
  const [aiOverview, setAiOverview] = useState<string | null>(null);
  const [scoringMode, setScoringMode] = useState<"llm" | "rules" | null>(null);
  const [llmModel, setLlmModel] = useState<string | null>(null);
  const [llmByJobId, setLlmByJobId] = useState<Record<string, LlmScoreRow>>(
    {}
  );
  const [llmOrder, setLlmOrder] = useState<string[] | null>(null);
  const [maxJobs, setMaxJobs] = useState(DEFAULT_LLM_DEPTH);
  const [xaiReady, setXaiReady] = useState<boolean | null>(null);
  const [minimumScore, setMinimumScore] = useState(0);
  const [hideBlocked, setHideBlocked] = useState(true);

  const cvFeatures = (youth?.cv?.features as CvFeatures | undefined) || null;

  // Rule baseline + hard local-hire / pay caps (same panel logic as Local Hiring Likelihood)
  const ruleResults = useMemo(() => {
    if (!youth || !ran) return [] as MatchResult[];
    const publicJobs = jobs.filter(
      (j) =>
        j.source === "dsal" ||
        j.source === "jobscall" ||
        j.source === "hellojobs"
    );
    const base = matchJobsWithCv(youth, publicJobs, cvFeatures);
    return applyLocalHireAndSalaryToMatchResults(
      base,
      youth,
      wageBenchmarks,
      (job) => {
        const key =
          job.company && job.companyZh && job.company === job.companyZh
            ? job.company
            : `${job.company} ${job.companyZh}`.trim();
        return lookupEmployerWorkforce(key, job.sector);
      },
      cvFeatures
    );
  }, [youth, jobs, ran, cvFeatures, wageBenchmarks]);

  // Display: LLM scores as primary when present
  const displayResults = useMemo((): DisplayMatchRow[] => {
    if (!ruleResults.length) return [];

    if (llmOrder?.length) {
      const map = new Map(ruleResults.map((r) => [r.job.id, r]));
      const ordered: DisplayMatchRow[] = [];
      for (const id of llmOrder) {
        const row = map.get(id);
        const llm = llmByJobId[id];
        if (!row) continue;
        ordered.push({
          job: row.job,
          score: llm?.fitScore ?? row.score,
          reasons: llm?.reasons?.length
            ? llm.reasons
            : lang === "zh"
              ? row.reasonsZh
              : row.reasons,
          reasonsZh: llm?.reasons?.length ? llm.reasons : row.reasonsZh,
          evidence: row.evidence,
          llm,
        });
      }
      // Append remaining rule-only jobs (lower priority, rule score)
      for (const r of ruleResults) {
        if (llmOrder.includes(r.job.id)) continue;
        ordered.push({
          job: r.job,
          score: r.score,
          reasons: lang === "zh" ? r.reasonsZh : r.reasons,
          reasonsZh: r.reasonsZh,
          evidence: r.evidence,
        });
      }
      return ordered;
    }

    return ruleResults.map((r) => ({
      job: r.job,
      score: r.score,
      reasons: lang === "zh" ? r.reasonsZh : r.reasons,
      reasonsZh: r.reasonsZh,
      evidence: r.evidence,
    }));
  }, [ruleResults, llmOrder, llmByJobId, lang]);

  const visibleResults = useMemo(
    () =>
      displayResults.filter(
        (row) =>
          row.score >= minimumScore &&
          (!hideBlocked || !(row.evidence?.constraints || []).some((item) => /credential|age|18\\+|ceiling: 1[0-9]/i.test(item)))
      ),
    [displayResults, minimumScore, hideBlocked]
  );
  const top = visibleResults[0];

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/ai/job-match");
        const data = await res.json();
        if (!cancelled) setXaiReady(!!data.xaiConfigured);
      } catch {
        if (!cancelled) setXaiReady(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Auto-run after CV upload redirect (wait until XAI probe settles)
  useEffect(() => {
    if (!youth || xaiReady === null) return;
    try {
      if (sessionStorage.getItem("myeib_auto_match") === "1") {
        sessionStorage.removeItem("myeib_auto_match");
        void runMatch(true);
      }
    } catch {
      /* ignore */
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [youth?.id, xaiReady]);

  useEffect(() => {
    setLlmByJobId({});
    setLlmOrder(null);
    setAiOverview(null);
    setAiError(null);
    setScoringMode(null);
    setLlmModel(null);
  }, [youth?.id]);

  const persistStrips = (scores: LlmScoreRow[]) => {
    try {
      const key = "myeib_ai_strips_v1";
      const prev = JSON.parse(sessionStorage.getItem(key) || "{}") as Record<
        string,
        JobAiStrip
      >;
      const map: Record<string, JobAiStrip> = { ...prev };
      for (const s of scores) {
        map[s.jobId] = {
          jobId: s.jobId,
          fitScore: s.fitScore,
          verdict: s.verdict as JobAiStrip["verdict"],
          blurb: s.blurb,
          rank: s.rank,
          ruleMatchScore: s.ruleMatchScore,
          provider: s.provider,
        };
      }
      sessionStorage.setItem(key, JSON.stringify(map));
    } catch {
      /* ignore */
    }
  };

  /**
   * Primary match: LLM scores JD ↔ profile when XAI is configured.
   * Falls back to pure rules without a key.
   */
  const runMatch = async (preferLlm = true) => {
    if (!youth) return;
    setRan(true);
    setAiError(null);
    setMatchLoading(true);
    setLlmByJobId({});
    setLlmOrder(null);
    setAiOverview(null);

    // Rules + local-hire caps (same as ruleResults) for shortlist order
    const publicJobs = jobs.filter(
      (j) =>
        j.source === "dsal" ||
        j.source === "jobscall" ||
        j.source === "hellojobs"
    );
    const baseline = applyLocalHireAndSalaryToMatchResults(
      matchJobsWithCv(youth, publicJobs, cvFeatures),
      youth,
      wageBenchmarks,
      (job) => {
        const key =
          job.company && job.companyZh && job.company === job.companyZh
            ? job.company
            : `${job.company} ${job.companyZh}`.trim();
        return lookupEmployerWorkforce(key, job.sector);
      },
      cvFeatures
    );

    try {
      if (!preferLlm || xaiReady === false) {
        setScoringMode("rules");
        setLlmOrder(baseline.map((r) => r.job.id));
        setLlmByJobId({});
        setAiOverview(
          zh
            ? "使用規則配對：專業適合度 + 本地招聘可能性（「低」上限約 48 分）+ 預期薪酬。"
            : "Using rules: profession fit + local hiring (Low capped ~48) + expected salary."
        );
        void saveMatchRun({
          algorithmVersion: "rules-2026.07",
          provenance: { cv: Boolean(cvFeatures), sources: ["dsal", "jobscall", "hellojobs"] },
          preferences: { minimumScore, hideBlocked },
          results: baseline.slice(0, 20).map((row) => ({ jobId: row.job.id, score: row.score })),
        });
        return;
      }

      // Paint rule results immediately so UI feels instant; Grok upgrades in place
      setScoringMode("rules");
      setLlmOrder(baseline.map((r) => r.job.id));
      setLlmByJobId({});
      setAiOverview(
        zh
          ? "規則結果已就緒，Grok 語義精排進行中…"
          : "Rule results ready — Grok semantic re-rank in progress…"
      );
      // Stop the full-page spinner so users can browse while Grok runs
      setMatchLoading(false);

      const shortlist = baseline.slice(0, maxJobs).map((r) => r.job);
      const res = await fetch("/api/ai/job-match", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          youth,
          jobs: shortlist,
          lang,
          maxJobs,
          cv: cvFeatures,
          officialJobs: officialJobs.slice(0, 80),
          consent: true,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        throw new Error(data.error || `HTTP ${res.status}`);
      }

      const scores = (data.scores || []) as LlmScoreRow[];
      const map: Record<string, LlmScoreRow> = {};
      for (const s of scores) map[s.jobId] = s;
      setLlmByJobId(map);
      if (scores.length) setLlmOrder(scores.map((s) => s.jobId));
      setAiOverview(data.overview || null);
      const usedGrok =
        data.provider === "xai" || data.meta?.usedGrok === true;
      setScoringMode(usedGrok ? "llm" : "rules");
      setLlmModel(data.model || null);
      setXaiReady(!!data.meta?.xaiConfigured);
      if (!usedGrok && data.meta?.xaiConfigured) {
        setAiError(
          zh
            ? "金鑰已設定，但本次未使用 Grok（可能回退規則）。"
            : "API key is set but this run did not use Grok (fell back to rules)."
        );
      } else {
        setAiError(null);
      }
      persistStrips(scores);
      void saveMatchRun({
        algorithmVersion: usedGrok ? `grok+rules-2026.07` : "rules-2026.07",
        provenance: {
          cv: Boolean(cvFeatures),
          sources: ["dsal", "jobscall", "hellojobs"],
          usedGrok,
        },
        preferences: { maxJobs, minimumScore, hideBlocked },
        results: scores.map((score) => ({
          jobId: score.jobId,
          score: score.fitScore,
        })),
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Match failed";
      setAiError(msg);
      setScoringMode("rules");
      setAiOverview(
        zh
          ? `AI 精排失敗（${msg}），保留規則配對結果。`
          : `AI re-rank failed (${msg}) — keeping rule-based results.`
      );
    } finally {
      setMatchLoading(false);
    }
  };

  const toStrip = (row: DisplayMatchRow): JobAiStrip | null => {
    if (!row.llm) return null;
    return {
      jobId: row.llm.jobId,
      fitScore: row.llm.fitScore,
      verdict: row.llm.verdict as JobAiStrip["verdict"],
      blurb: row.llm.blurb,
      rank: row.llm.rank,
      ruleMatchScore: row.llm.ruleMatchScore,
      provider: row.llm.provider,
    };
  };

  return (
    <div className="mx-auto max-w-6xl px-4 py-10">
      <h1 className="text-3xl font-bold text-macau-navy">{tr("smartMatchTitle")}</h1>
      <p className="mt-2 max-w-2xl text-macau-navy/60">
        {zh
          ? "公開職缺配對：專業適合度優先；本地招聘可能性「低」的職位配對分會被壓低（不會再以 100 分排第一）；並加權可提出的預期薪酬。"
          : "Public vacancy matching: profession fit first; Low local-hiring ads are score-capped (no more perfect #1 ranks); higher expected proposed salary ranks up."}
      </p>
      <p className="mt-2 text-xs text-macau-navy/45">
        {zh
          ? `公開配對池：共 ${jobs.length} 個（勞工局 ${officialJobs.length} + 商業平台 ${Math.max(0, jobs.length - officialJobs.length)}）`
          : `Public match pool: ${jobs.length} total (${officialJobs.length} DSAL + ${Math.max(0, jobs.length - officialJobs.length)} commercial boards)`}
        {dsalStats?.officialTotalVacancies != null &&
          ` · ${zh ? "市場空缺總數" : "market total"} ${dsalStats.officialTotalVacancies.toLocaleString()}`}
        {dsalLoading && ` · ${tr("loadingOfficial")}`}
        {cvFeatures
          ? zh
            ? " · 已載入履歷特徵"
            : " · CV features loaded"
          : zh
            ? " · 尚未上傳履歷（仍可用檔案配對）"
            : " · no CV yet (profile-only match still works)"}
        {xaiReady === true &&
          (zh ? " · Grok API 已設定" : " · Grok API configured")}
        {xaiReady === false &&
          (zh ? " · 未設定 XAI_API_KEY" : " · XAI_API_KEY not set")}
        {scoringMode === "llm" &&
          (zh ? " · 本次：Grok 語義打分" : " · this run: Grok semantic scores")}
        {scoringMode === "rules" &&
          ran &&
          (zh ? " · 本次：規則引擎" : " · this run: rules engine")}
      </p>

      <div className="mt-6">
        <CvUpload
          autoMatch={false}
          onParsed={() => {
            void runMatch(true);
          }}
        />
      </div>

      <div className="mt-6 flex flex-wrap items-center gap-3 rounded-2xl border border-macau-navy/8 bg-white p-5 shadow-card">
        {youth ? (
          <div className="flex-1 text-sm text-macau-navy/70">
            <span className="font-semibold text-macau-navy">{youth.name}</span>
            {" · "}
            {youth.age} {zh ? "歲" : "y/o"}
            {" · "}
            {youth.district}
            {" · "}
            {youth.skills.slice(0, 4).join(", ")}
            {youth.cv && (
              <span className="ml-2 inline-flex items-center gap-1 rounded-full bg-macau-sky px-2 py-0.5 text-[11px] font-medium text-macau-teal">
                <FileText className="h-3 w-3" />
                {youth.cv.fileName}
              </span>
            )}
          </div>
        ) : (
          <p className="flex-1 text-sm text-macau-navy/50">
            {zh
              ? "上傳履歷或建立檔案後即可配對。"
              : "Upload a CV or create a profile to match."}
          </p>
        )}
        <button
          type="button"
          onClick={() => {
            setYouth({
              ...demoYouth,
              id: demoYouth.id,
              createdAt: new Date().toISOString(),
            });
            setRan(false);
            setLlmOrder(null);
          }}
          className="rounded-xl border border-macau-navy/15 px-4 py-2 text-sm font-medium hover:bg-macau-cream transition"
        >
          {tr("useDemoProfile")}
        </button>
        <Link
          href="/youth"
          className="rounded-xl border border-macau-navy/15 px-4 py-2 text-sm font-medium hover:bg-macau-cream transition"
        >
          {tr("youthPortal")}
        </Link>
        <button
          type="button"
          onClick={() => void refreshOfficialJobs({ force: true })}
          disabled={dsalLoading}
          className="rounded-xl border border-macau-navy/15 px-4 py-2 text-sm font-medium hover:bg-macau-cream transition disabled:opacity-50"
        >
          {dsalLoading ? tr("loadingOfficial") : tr("refreshOfficial")}
        </button>

        <label className="flex items-center gap-1.5 text-xs text-macau-navy/60">
          <ListOrdered className="h-3.5 w-3.5" />
          {zh ? "LLM 深度" : "LLM depth"}
          <select
            value={maxJobs}
            onChange={(e) => setMaxJobs(Number(e.target.value))}
            className="rounded-lg border border-macau-navy/15 bg-white px-2 py-1.5 text-sm font-medium text-macau-navy"
          >
            {[6, 8, 12, 16].map((n) => (
              <option key={n} value={n}>
                {n}
                {n <= 8 ? (zh ? "（快）" : " (fast)") : n >= 16 ? (zh ? "（較慢）" : " (slower)") : ""}
              </option>
            ))}
          </select>
        </label>
        <label className="flex items-center gap-1.5 text-xs text-macau-navy/60">
          {zh ? "最低分" : "Minimum score"}
          <select value={minimumScore} onChange={(e) => setMinimumScore(Number(e.target.value))} className="rounded-lg border px-2 py-1.5">
            {[0, 40, 60, 75].map((score) => <option key={score} value={score}>{score}+</option>)}
          </select>
        </label>
        <label className="flex items-center gap-2 text-xs text-macau-navy/60">
          <input type="checkbox" checked={hideBlocked} onChange={(e) => setHideBlocked(e.target.checked)} />
          {zh ? "隱藏資格明顯不符" : "Hide eligibility conflicts"}
        </label>

        <button
          type="button"
          disabled={!youth || matchLoading}
          onClick={() => void runMatch(true)}
          className={clsx(
            "inline-flex items-center gap-2 rounded-xl bg-macau-teal px-5 py-2 text-sm font-semibold text-white disabled:opacity-40 hover:bg-macau-teal/90 transition",
            matchLoading && "opacity-80"
          )}
        >
          {matchLoading ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Brain className="h-4 w-4" />
          )}
          {matchLoading
            ? zh
              ? "LLM 配對中…"
              : "LLM matching…"
            : zh
              ? "智能配對（LLM 打分）"
              : "Smart match (LLM scores)"}
        </button>

        <button
          type="button"
          disabled={!youth || matchLoading}
          onClick={() => void runMatch(false)}
          className="inline-flex items-center gap-2 rounded-xl border border-macau-navy/15 px-4 py-2 text-sm font-medium hover:bg-macau-cream transition disabled:opacity-40"
        >
          <Sparkles className="h-4 w-4" />
          {zh ? "僅規則配對" : "Rules only"}
        </button>
      </div>

      {aiError && (
        <p className="mt-3 text-xs text-macau-red">{aiError}</p>
      )}

      {ran && (
        <div className="mt-4 flex flex-wrap items-center gap-2 text-[11px]">
          <span
            className={clsx(
              "inline-flex items-center gap-1 rounded-full px-2.5 py-1 font-semibold",
              scoringMode === "llm"
                ? "bg-macau-teal/15 text-macau-teal"
                : "bg-macau-navy/5 text-macau-navy/60"
            )}
          >
            <Bot className="h-3.5 w-3.5" />
            {scoringMode === "llm"
              ? zh
                ? `主分數：Grok 語義配對${llmModel ? ` · ${llmModel}` : ""}`
                : `Primary score: Grok semantic match${llmModel ? ` · ${llmModel}` : ""}`
              : scoringMode === "rules"
                ? zh
                  ? "主分數：規則引擎"
                  : "Primary score: rules engine"
                : zh
                  ? "準備中"
                  : "Preparing"}
          </span>
          {matchLoading && (
            <span className="text-macau-navy/45">
              {zh
                ? "正在比較職位描述與你的檔案／履歷…"
                : "Comparing job descriptions with your profile/CV…"}
            </span>
          )}
        </div>
      )}

      {aiOverview && (
        <div className="mt-4 rounded-2xl border border-macau-teal/20 bg-white p-4 shadow-card">
          <div className="flex flex-wrap items-center gap-2 text-[11px] font-semibold uppercase tracking-wide text-macau-teal">
            <Brain className="h-3.5 w-3.5" />
            {zh ? "配對說明" : "Match notes"}
          </div>
          <p className="mt-2 text-sm leading-relaxed text-macau-navy/75">
            {aiOverview}
          </p>
        </div>
      )}

      {ran && top && (
        <div className="mt-6 rounded-2xl border border-macau-teal/30 bg-gradient-to-r from-macau-sky/50 to-white p-5">
          <div className="text-xs font-semibold uppercase tracking-wide text-macau-teal">
            {scoringMode === "llm"
              ? zh
                ? "LLM 最佳配對"
                : "LLM best match"
              : zh
                ? "最佳配對"
                : "Best match"}
          </div>
          <div className="mt-1 text-lg font-bold text-macau-navy">
            {zh ? top.job.titleZh : top.job.title}
            <span className="ml-2 text-macau-teal">· {top.score}</span>
          </div>
          <p className="mt-1 text-sm text-macau-navy/60">
            {zh ? top.job.companyZh : top.job.company}
          </p>
          {top.llm?.blurb ? (
            <p className="mt-2 text-xs text-macau-navy/70 leading-relaxed">
              {top.llm.blurb}
            </p>
          ) : null}
          <ul className="mt-2 text-xs text-macau-navy/65 space-y-0.5">
            {top.reasons.map((r, i) => (
              <li key={i}>· {r}</li>
            ))}
          </ul>
          {top.llm?.ruleMatchScore != null && scoringMode === "llm" && (
            <p className="mt-2 text-[11px] text-macau-navy/40">
              {zh ? "規則參考分" : "Rule reference"}: {top.llm.ruleMatchScore}
            </p>
          )}
        </div>
      )}

      {ran && visibleResults.length > 0 && (
        <div className="mt-8 grid gap-4">
          {visibleResults.slice(0, 40).map((r) => (
            <div key={r.job.id}>
              <JobCard job={r.job} matchScore={r.score} reasons={r.reasons} aiStrip={toStrip(r)} />
              {r.evidence && (
                <div className="mx-3 -mt-2 rounded-b-2xl border border-t-0 bg-white px-4 py-3 text-xs text-macau-navy/65">
                  <strong>{zh ? "下一步：" : "Next step: "}</strong>
                  {r.evidence.nextSteps[0]}
                  <span className="ml-2 text-macau-navy/40">
                    {zh ? "資料信心" : "Data confidence"}: {r.evidence.confidence}
                  </span>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {ran && !matchLoading && displayResults.length === 0 && (
        <p className="mt-10 text-center text-macau-navy/50">{tr("noJobs")}</p>
      )}
    </div>
  );
}
