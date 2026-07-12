"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { FileUp, Loader2, CheckCircle2, AlertCircle, Sparkles } from "lucide-react";
import { useApp } from "@/context/AppContext";
import type { CvFeatures } from "@/lib/cv-extract";
import { profileFromCv } from "@/lib/cv-match";
import { sectorLabel, laneLabel } from "@/lib/i18n";
import clsx from "clsx";

interface ParseResponse {
  ok: boolean;
  error?: string;
  fileName?: string;
  textLength?: number;
  textPreview?: string;
  features?: CvFeatures;
  debug?: {
    layoutFamily?: string;
    sectionsFound?: string[];
    confidence?: number;
    nameCandidates?: { line: string; score: number }[];
  };
}

export function CvUpload({
  autoMatch = true,
  onParsed,
}: {
  autoMatch?: boolean;
  onParsed?: (features: CvFeatures) => void;
}) {
  const { lang, setYouth, youth, showToast } = useApp();
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [features, setFeatures] = useState<CvFeatures | null>(
    (youth?.cv?.features as CvFeatures) || null
  );
  const [fileName, setFileName] = useState(youth?.cv?.fileName || "");
  const [debugInfo, setDebugInfo] = useState<ParseResponse["debug"] | null>(null);

  async function handleFile(file: File) {
    setError(null);
    setLoading(true);
    try {
      const lower = file.name.toLowerCase();
      if (!lower.endsWith(".pdf") && !lower.endsWith(".docx")) {
        throw new Error(
          lang === "zh"
            ? "請上傳 PDF 或 DOCX 格式"
            : "Please upload a PDF or DOCX file"
        );
      }
      if (file.size > 8 * 1024 * 1024) {
        throw new Error(lang === "zh" ? "檔案不能超過 8MB" : "File must be under 8MB");
      }

      const body = new FormData();
      body.append("file", file);
      const res = await fetch("/api/cv/parse", { method: "POST", body });
      const data = (await res.json()) as ParseResponse;
      if (!res.ok || !data.ok || !data.features) {
        throw new Error(data.error || "Parse failed");
      }

      const f = data.features;
      setFeatures(f);
      setDebugInfo(data.debug || null);
      setFileName(data.fileName || file.name);

      // Rebuild profile from CV (overwrites bad prior auto-fills like name/age/lanes)
      const profile = profileFromCv(f, {
        ...(youth || {
          id: `youth-${Date.now()}`,
          name: "",
          age: 0,
          isStudent: false,
          languages: [],
          skills: [],
          preferredLanes: [],
          preferredSectors: [],
          availability: "",
          district: "Macau Peninsula",
          bio: "",
          parentalConsent: false,
          createdAt: new Date().toISOString(),
        }),
        // Keep only stable identity fields when CV re-parse is authoritative
        id: youth?.id || `youth-${Date.now()}`,
        createdAt: youth?.createdAt || new Date().toISOString(),
        parentalConsent:
          (f.estimatedAge ?? 99) < 18
            ? youth?.parentalConsent ?? false
            : false,
      });
      profile.cv = {
        fileName: data.fileName || file.name,
        uploadedAt: new Date().toISOString(),
        textLength: data.textLength || f.textLength,
        features: {
          ...f,
          careerStage: f.careerStage,
          estimatedAge: f.estimatedAge,
          researchInterests: f.researchInterests,
        },
      };

      setYouth(profile);
      onParsed?.(f);
      showToast(
        lang === "zh"
          ? "履歷已解析，檔案與配對特徵已更新"
          : "CV parsed — profile & match features updated"
      );

      if (autoMatch) {
        // Flag match page to auto-run
        try {
          sessionStorage.setItem("myeib_auto_match", "1");
        } catch {
          /* ignore */
        }
        router.push("/match");
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Upload failed";
      setError(msg);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="rounded-3xl border border-macau-navy/8 bg-white p-6 shadow-card">
      <div className="flex items-start gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-macau-teal/10 text-macau-teal">
          <FileUp className="h-5 w-5" />
        </div>
        <div className="flex-1">
          <h2 className="text-lg font-bold text-macau-navy">
            {lang === "zh" ? "上傳履歷（PDF / DOCX）" : "Upload CV (PDF / DOCX)"}
          </h2>
          <p className="mt-1 text-sm text-macau-navy/60">
            {lang === "zh"
              ? "系統會自動擷取技能、語言、學歷、行業意向等特徵，並進行智能職位配對。"
              : "We extract skills, languages, education, and sector signals, then run automatic smart matching."}
          </p>
        </div>
      </div>

      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          const f = e.dataTransfer.files?.[0];
          if (f) void handleFile(f);
        }}
        className={clsx(
          "mt-4 flex flex-col items-center justify-center rounded-2xl border-2 border-dashed px-4 py-10 transition",
          dragging
            ? "border-macau-teal bg-macau-sky/40"
            : "border-macau-navy/15 bg-macau-cream/40 hover:border-macau-teal/40"
        )}
      >
        {loading ? (
          <div className="flex items-center gap-2 text-sm text-macau-navy/70">
            <Loader2 className="h-5 w-5 animate-spin text-macau-teal" />
            {lang === "zh" ? "正在解析履歷…" : "Parsing CV…"}
          </div>
        ) : (
          <>
            <p className="text-sm text-macau-navy/65">
              {lang === "zh"
                ? "拖放檔案到此，或點擊選擇"
                : "Drag & drop a file here, or click to browse"}
            </p>
            <button
              type="button"
              onClick={() => inputRef.current?.click()}
              className="mt-3 rounded-xl bg-macau-navy px-5 py-2.5 text-sm font-semibold text-white hover:bg-macau-navy/90"
            >
              {lang === "zh" ? "選擇檔案" : "Choose file"}
            </button>
            <p className="mt-2 text-[11px] text-macau-navy/40">
              PDF · DOCX · max 8MB ·{" "}
              {lang === "zh" ? "請使用可選取文字的檔案（非純掃描圖）" : "use text-based files (not scan-only images)"}
            </p>
          </>
        )}
        <input
          ref={inputRef}
          type="file"
          accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void handleFile(f);
            e.target.value = "";
          }}
        />
      </div>

      {error && (
        <div className="mt-3 flex items-start gap-2 rounded-xl border border-macau-red/20 bg-macau-red/5 px-3 py-2 text-sm text-macau-red">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          {error}
        </div>
      )}

      {features && (
        <div className="mt-4 rounded-2xl border border-macau-teal/20 bg-macau-sky/30 p-4">
          <div className="flex items-center gap-2 text-sm font-semibold text-macau-teal">
            <CheckCircle2 className="h-4 w-4" />
            {lang === "zh" ? "已擷取特徵" : "Extracted features"}
            {fileName && (
              <span className="font-normal text-macau-navy/45">· {fileName}</span>
            )}
          </div>
          <dl className="mt-3 grid gap-2 text-xs text-macau-navy/75 sm:grid-cols-2">
            {features.name && (
              <div>
                <dt className="font-medium text-macau-navy/45">
                  {lang === "zh" ? "姓名" : "Name"}
                </dt>
                <dd>{features.name}</dd>
              </div>
            )}
            <div>
              <dt className="font-medium text-macau-navy/45">
                {lang === "zh" ? "語言" : "Languages"}
              </dt>
              <dd>{features.languages.join(", ") || "—"}</dd>
            </div>
            <div>
              <dt className="font-medium text-macau-navy/45">
                {lang === "zh" ? "技能標籤" : "Skill tags"}
              </dt>
              <dd>{features.skills.join(", ") || "—"}</dd>
            </div>
            <div>
              <dt className="font-medium text-macau-navy/45">
                {lang === "zh" ? "行業意向" : "Sector signals"}
              </dt>
              <dd>
                {features.preferredSectors.length
                  ? features.preferredSectors
                      .map((s) => sectorLabel(lang, s))
                      .join(", ")
                  : "—"}
              </dd>
            </div>
            <div>
              <dt className="font-medium text-macau-navy/45">
                {lang === "zh" ? "工作類型" : "Lane signals"}
              </dt>
              <dd>
                {features.preferredLanes
                  .map((l) => laneLabel(lang, l))
                  .join(", ")}
              </dd>
            </div>
            <div>
              <dt className="font-medium text-macau-navy/45">
                {lang === "zh" ? "學歷／年資" : "Education / experience"}
              </dt>
              <dd>
                {features.educationLevel || "—"}
                {features.experienceYears != null
                  ? ` · ~${features.experienceYears}y`
                  : ""}
                {features.isStudent
                  ? lang === "zh"
                    ? " · 在學"
                    : " · student"
                  : ""}
              </dd>
            </div>
          </dl>
          {features.summary && (
            <p className="mt-3 text-xs leading-relaxed text-macau-navy/60">
              {features.summary}
            </p>
          )}
          {features.keywords.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1">
              {features.keywords.slice(0, 12).map((k) => (
                <span
                  key={k}
                  className="rounded-full bg-white/80 px-2 py-0.5 text-[10px] text-macau-navy/55"
                >
                  {k}
                </span>
              ))}
            </div>
          )}
          {(debugInfo || features.layoutFamily || features.confidence != null) && (
            <p className="mt-2 text-[10px] text-macau-navy/40">
              {lang === "zh" ? "模板偵測" : "Template"}:{" "}
              {debugInfo?.layoutFamily || features.layoutFamily || "generic"}
              {" · "}
              {lang === "zh" ? "信心" : "confidence"}{" "}
              {Math.round(
                ((debugInfo?.confidence ?? features.confidence) || 0) * 100
              )}
              %
              {debugInfo?.sectionsFound?.length
                ? ` · sections: ${debugInfo.sectionsFound.filter((s) => s !== "_header").slice(0, 6).join(", ")}`
                : ""}
            </p>
          )}
          <button
            type="button"
            onClick={() => {
              try {
                sessionStorage.setItem("myeib_auto_match", "1");
              } catch {
                /* ignore */
              }
              router.push("/match");
            }}
            className="mt-4 inline-flex items-center gap-2 rounded-xl bg-macau-teal px-4 py-2 text-sm font-semibold text-white hover:bg-macau-teal/90"
          >
            <Sparkles className="h-4 w-4" />
            {lang === "zh" ? "立即智能配對" : "Run smart match now"}
          </button>
        </div>
      )}
    </div>
  );
}
