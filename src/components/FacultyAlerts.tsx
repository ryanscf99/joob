"use client";

import { useEffect, useState } from "react";
import {
  Bell,
  BellOff,
  CheckCheck,
  ExternalLink,
  Trash2,
} from "lucide-react";
import type { FacultyPosition } from "@/lib/faculty-jobs";
import {
  baselineFacultySeen,
  clearFacultyAlerts,
  DEFAULT_FACULTY_ALERT_PREFS,
  getFacultyAlertInbox,
  getFacultyAlertPrefs,
  markAllFacultyAlertsRead,
  markFacultyAlertRead,
  processFacultyAlerts,
  saveFacultyAlertPrefs,
  type FacultyAlertItem,
  type FacultyAlertPrefs,
} from "@/lib/faculty-alerts";
import clsx from "clsx";

export function FacultyAlertsPanel({
  positions,
  lang,
  onNewAlerts,
}: {
  positions: FacultyPosition[];
  lang: "en" | "zh";
  onNewAlerts?: (n: number) => void;
}) {
  const [prefs, setPrefs] = useState<FacultyAlertPrefs>(
    DEFAULT_FACULTY_ALERT_PREFS
  );
  const [inbox, setInbox] = useState<FacultyAlertItem[]>([]);
  const [kwInput, setKwInput] = useState("");
  const [hydrated, setHydrated] = useState(false);
  const [justNew, setJustNew] = useState(0);
  const [baselined, setBaselined] = useState(false);

  useEffect(() => {
    const p = getFacultyAlertPrefs();
    setPrefs(p);
    setKwInput(p.keywords.join(", "));
    setInbox(getFacultyAlertInbox());
    setHydrated(true);
  }, []);

  // When positions refresh, detect new UM/MUST matches
  useEffect(() => {
    if (!hydrated || positions.length === 0) return;
    const p = getFacultyAlertPrefs();
    // First-ever load with empty seen: baseline without flooding inbox
    const seenRaw = localStorage.getItem("myeib_faculty_alert_seen_v1");
    if (!seenRaw || seenRaw === "[]") {
      baselineFacultySeen(positions);
      setBaselined(true);
      setInbox(getFacultyAlertInbox());
      return;
    }
    const result = processFacultyAlerts(positions, p);
    setInbox(result.inbox);
    setJustNew(result.newAlerts.length);
    onNewAlerts?.(result.unread);
  }, [positions, hydrated, onNewAlerts]);

  const save = (next: FacultyAlertPrefs) => {
    setPrefs(next);
    saveFacultyAlertPrefs(next);
  };

  const unread = inbox.filter((a) => !a.read).length;

  if (!hydrated) return null;

  return (
    <section className="mt-6 rounded-3xl border border-macau-navy/10 bg-white p-5 shadow-card">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-lg font-bold text-macau-navy">
            {prefs.enabled ? (
              <Bell className="h-5 w-5 text-macau-teal" />
            ) : (
              <BellOff className="h-5 w-5 text-macau-navy/40" />
            )}
            {lang === "zh" ? "教職新盤提醒（澳大／科大）" : "Faculty job alerts (UM / MUST)"}
            {unread > 0 && (
              <span className="rounded-full bg-macau-red px-2 py-0.5 text-xs font-bold text-white">
                {unread}
              </span>
            )}
          </h2>
          <p className="mt-1 text-xs text-macau-navy/55 leading-relaxed max-w-2xl">
            {lang === "zh"
              ? "預設監察澳門大學與澳門科技大學。每次重新整理職位時，符合條件的新盤會出現在下方收件箱（儲存在本機瀏覽器）。"
              : "Default watch: University of Macau & MUST. On each refresh, new matching posts are added to the inbox below (stored in this browser)."}
          </p>
          {justNew > 0 && (
            <p className="mt-1 text-xs font-semibold text-macau-teal">
              {lang === "zh"
                ? `今次發現 ${justNew} 個新提醒`
                : `${justNew} new alert(s) this refresh`}
            </p>
          )}
          {baselined && (
            <p className="mt-1 text-xs text-macau-navy/40">
              {lang === "zh"
                ? "已建立基準：目前職位不會全部推送，之後的新增才會提醒。"
                : "Baseline set: current posts won’t flood you; only newer ones will alert."}
            </p>
          )}
        </div>
        <label className="inline-flex items-center gap-2 text-sm text-macau-navy/70">
          <input
            type="checkbox"
            checked={prefs.enabled}
            onChange={(e) => save({ ...prefs, enabled: e.target.checked })}
          />
          {lang === "zh" ? "啟用提醒" : "Enable alerts"}
        </label>
      </div>

      <div className="mt-4 grid gap-3 md:grid-cols-2">
        <div>
          <div className="text-xs font-semibold text-macau-navy/50 mb-1.5">
            {lang === "zh" ? "監察院校" : "Watch universities"}
          </div>
          <div className="flex flex-wrap gap-2">
            {(
              [
                { id: "um" as const, en: "UM (UMAC)", zh: "澳門大學" },
                { id: "must" as const, en: "MUST", zh: "澳門科大" },
              ] as const
            ).map((u) => {
              const on = prefs.universities.includes(u.id);
              return (
                <button
                  key={u.id}
                  type="button"
                  onClick={() => {
                    const universities = on
                      ? prefs.universities.filter((x) => x !== u.id)
                      : [...prefs.universities, u.id];
                    // Always keep at least one if possible
                    save({
                      ...prefs,
                      universities:
                        universities.length > 0 ? universities : [u.id],
                    });
                  }}
                  className={clsx(
                    "rounded-full px-3 py-1 text-xs font-semibold border transition",
                    on
                      ? "bg-macau-navy text-white border-macau-navy"
                      : "bg-white text-macau-navy/60 border-macau-navy/15"
                  )}
                >
                  {lang === "zh" ? u.zh : u.en}
                </button>
              );
            })}
          </div>
        </div>
        <div>
          <div className="text-xs font-semibold text-macau-navy/50 mb-1.5">
            {lang === "zh" ? "關鍵詞（逗號分隔，可留空＝全部）" : "Keywords (comma-separated, empty = all)"}
          </div>
          <input
            value={kwInput}
            onChange={(e) => setKwInput(e.target.value)}
            onBlur={() =>
              save({
                ...prefs,
                keywords: kwInput
                  .split(/[,，]/)
                  .map((s) => s.trim())
                  .filter(Boolean),
              })
            }
            placeholder={
              lang === "zh"
                ? "例如：Data Science, Statistics, Finance"
                : "e.g. Data Science, Statistics, Finance"
            }
            className="w-full rounded-xl border border-macau-navy/10 px-3 py-2 text-sm outline-none focus:border-macau-teal"
          />
        </div>
      </div>

      <label className="mt-3 flex items-center gap-2 text-xs text-macau-navy/65">
        <input
          type="checkbox"
          checked={prefs.assistantTrackOnly}
          onChange={(e) =>
            save({ ...prefs, assistantTrackOnly: e.target.checked })
          }
        />
        {lang === "zh"
          ? "只提醒助理教授／副教授／研究教授軌道"
          : "Only Assistant / Associate / Research Professor tracks"}
      </label>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-macau-navy/8 pt-3">
        <div className="text-xs font-semibold text-macau-navy/50">
          {lang === "zh" ? "提醒收件箱" : "Alert inbox"}
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setInbox(markAllFacultyAlertsRead())}
            className="inline-flex items-center gap-1 rounded-lg border border-macau-navy/10 px-2 py-1 text-[11px] text-macau-navy/60 hover:bg-macau-cream"
          >
            <CheckCheck className="h-3 w-3" />
            {lang === "zh" ? "全部已讀" : "Mark all read"}
          </button>
          <button
            type="button"
            onClick={() => {
              clearFacultyAlerts();
              setInbox([]);
            }}
            className="inline-flex items-center gap-1 rounded-lg border border-macau-navy/10 px-2 py-1 text-[11px] text-macau-navy/60 hover:bg-macau-cream"
          >
            <Trash2 className="h-3 w-3" />
            {lang === "zh" ? "清空" : "Clear"}
          </button>
        </div>
      </div>

      {inbox.length === 0 ? (
        <p className="mt-3 text-xs text-macau-navy/40">
          {lang === "zh"
            ? "尚無提醒。重新整理職位列表後，符合條件的新盤會顯示於此。"
            : "No alerts yet. After refresh, new matching UM/MUST posts appear here."}
        </p>
      ) : (
        <ul className="mt-3 max-h-64 space-y-2 overflow-y-auto">
          {inbox.map((a) => (
            <li
              key={a.id}
              className={clsx(
                "flex flex-wrap items-start justify-between gap-2 rounded-xl border px-3 py-2 text-sm",
                a.read
                  ? "border-macau-navy/8 bg-macau-cream/40"
                  : "border-macau-teal/30 bg-macau-sky/30"
              )}
            >
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="rounded bg-macau-navy px-1.5 py-0.5 text-[10px] font-bold text-white">
                    {a.universityId.toUpperCase()}
                  </span>
                  {!a.read && (
                    <span className="text-[10px] font-bold text-macau-teal">
                      NEW
                    </span>
                  )}
                </div>
                <div className="mt-0.5 font-semibold text-macau-navy leading-snug">
                  {a.title}
                </div>
                <div className="text-xs text-macau-navy/50">
                  {a.unit}
                  {a.postedAt ? ` · ${a.postedAt}` : ""}
                  {a.refNo ? ` · ${a.refNo}` : ""}
                </div>
              </div>
              <div className="flex gap-1">
                <a
                  href={a.url}
                  target="_blank"
                  rel="noreferrer"
                  onClick={() => setInbox(markFacultyAlertRead(a.id))}
                  className="inline-flex items-center gap-1 rounded-lg bg-macau-red px-2.5 py-1.5 text-[11px] font-semibold text-white"
                >
                  {lang === "zh" ? "查看" : "Open"}
                  <ExternalLink className="h-3 w-3" />
                </a>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
