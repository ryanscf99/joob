"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useApp } from "@/context/AppContext";
import type { JobLane, Sector, YouthProfile } from "@/lib/types";
import { laneLabel, sectorLabel } from "@/lib/i18n";
import { demoYouth } from "@/lib/storage";
import { CvUpload } from "@/components/CvUpload";
import { useAuth } from "@/components/auth/AuthProvider";
import {
  deleteSeekerData,
  loadAlerts,
  loadSavedJobs,
  saveAlert,
  updateApplicationStatus,
  type JobAlert,
  type SavedJob,
} from "@/lib/repositories/seeker-repository";

const ALL_LANES: JobLane[] = ["summer", "part-time", "internship", "full-time"];
const ALL_SECTORS: Sector[] = [
  "hospitality",
  "retail",
  "fnb",
  "big-health",
  "finance",
  "tech",
  "mice",
  "education",
];

export default function YouthPage() {
  const { tr, lang, youth, setYouth, applications, jobs } = useApp();
  const { user } = useAuth();
  const [savedJobs, setSavedJobs] = useState<SavedJob[]>([]);
  const [alerts, setAlerts] = useState<JobAlert[]>([]);
  const [alertName, setAlertName] = useState("");
  const [form, setForm] = useState({
    name: "",
    age: 17,
    isStudent: true,
    languages: "Cantonese, English",
    skills: "customer-service, teamwork, english",
    preferredLanes: ["summer", "part-time"] as JobLane[],
    preferredSectors: ["fnb", "retail"] as Sector[],
    availability: "Weekends & summer",
    district: "Taipa",
    bio: "",
    parentalConsent: false,
  });

  useEffect(() => {
    if (youth) {
      setForm({
        name: youth.name,
        age: youth.age,
        isStudent: youth.isStudent,
        languages: youth.languages.join(", "),
        skills: youth.skills.join(", "),
        preferredLanes: youth.preferredLanes,
        preferredSectors: youth.preferredSectors,
        availability: youth.availability,
        district: youth.district,
        bio: youth.bio,
        parentalConsent: youth.parentalConsent,
      });
    }
  }, [youth]);

  useEffect(() => {
    void Promise.all([loadSavedJobs(), loadAlerts()]).then(([saved, nextAlerts]) => {
      setSavedJobs(saved);
      setAlerts(nextAlerts);
    });
  }, [user?.id]);

  const toggleLane = (l: JobLane) => {
    setForm((f) => ({
      ...f,
      preferredLanes: f.preferredLanes.includes(l)
        ? f.preferredLanes.filter((x) => x !== l)
        : [...f.preferredLanes, l],
    }));
  };

  const toggleSector = (s: Sector) => {
    setForm((f) => ({
      ...f,
      preferredSectors: f.preferredSectors.includes(s)
        ? f.preferredSectors.filter((x) => x !== s)
        : [...f.preferredSectors, s],
    }));
  };

  const save = () => {
    const profile: YouthProfile = {
      id: youth?.id || `youth-${Date.now()}`,
      name: form.name.trim() || (lang === "zh" ? "青年求職者" : "Youth seeker"),
      age: Number(form.age) || 16,
      isStudent: form.isStudent,
      languages: form.languages.split(",").map((s) => s.trim()).filter(Boolean),
      skills: form.skills.split(",").map((s) => s.trim().toLowerCase()).filter(Boolean),
      preferredLanes: form.preferredLanes,
      preferredSectors: form.preferredSectors,
      availability: form.availability,
      district: form.district,
      bio: form.bio,
      parentalConsent: form.parentalConsent,
      createdAt: youth?.createdAt || new Date().toISOString(),
      cv: youth?.cv,
    };
    setYouth(profile);
  };

  const myApps = applications.filter((a) => a.youthId === youth?.id);

  return (
    <div className="mx-auto max-w-3xl px-4 py-10">
      <h1 className="text-3xl font-bold text-macau-navy">{tr("youthPortal")}</h1>
      <p className="mt-2 text-macau-navy/60">
        {lang === "zh"
          ? "上傳履歷自動擷取特徵，或手動建立檔案：技能、語言、可工作時間與（如適用）家長同意。"
          : "Upload a CV for automatic feature extraction, or build your profile manually: skills, languages, availability, and parental consent when needed."}
      </p>

      <div className="mt-6">
        <CvUpload autoMatch />
      </div>

      <div className="mt-6 rounded-3xl border border-macau-navy/8 bg-white p-6 shadow-card space-y-4">
        <h2 className="font-bold text-macau-navy">
          {lang === "zh" ? "檔案詳情（可手動修改）" : "Profile details (editable)"}
        </h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block text-sm">
            <span className="font-medium text-macau-navy">{tr("name")}</span>
            <input
              className="mt-1 w-full rounded-xl border border-macau-navy/10 px-3 py-2 outline-none focus:border-macau-teal"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
            />
          </label>
          <label className="block text-sm">
            <span className="font-medium text-macau-navy">{tr("age")}</span>
            <input
              type="number"
              min={14}
              max={30}
              className="mt-1 w-full rounded-xl border border-macau-navy/10 px-3 py-2 outline-none focus:border-macau-teal"
              value={form.age}
              onChange={(e) => setForm({ ...form, age: Number(e.target.value) })}
            />
          </label>
        </div>

        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={form.isStudent}
            onChange={(e) => setForm({ ...form, isStudent: e.target.checked })}
          />
          {tr("student")}
        </label>

        <label className="block text-sm">
          <span className="font-medium text-macau-navy">{tr("languages")}</span>
          <input
            className="mt-1 w-full rounded-xl border border-macau-navy/10 px-3 py-2 outline-none focus:border-macau-teal"
            value={form.languages}
            onChange={(e) => setForm({ ...form, languages: e.target.value })}
          />
        </label>

        <label className="block text-sm">
          <span className="font-medium text-macau-navy">{tr("skills")}</span>
          <input
            className="mt-1 w-full rounded-xl border border-macau-navy/10 px-3 py-2 outline-none focus:border-macau-teal"
            value={form.skills}
            onChange={(e) => setForm({ ...form, skills: e.target.value })}
            placeholder="customer-service, english, teamwork"
          />
        </label>

        <label className="block text-sm">
          <span className="font-medium text-macau-navy">{tr("district")}</span>
          <select
            className="mt-1 w-full rounded-xl border border-macau-navy/10 px-3 py-2 outline-none focus:border-macau-teal"
            value={form.district}
            onChange={(e) => setForm({ ...form, district: e.target.value })}
          >
            <option value="Macau Peninsula">{tr("peninsula")}</option>
            <option value="Taipa">{tr("taipa")}</option>
            <option value="Cotai">{tr("cotai")}</option>
            <option value="Coloane">{tr("coloane")}</option>
          </select>
        </label>

        <label className="block text-sm">
          <span className="font-medium text-macau-navy">
            {lang === "zh" ? "可工作時間" : "Availability"}
          </span>
          <input
            className="mt-1 w-full rounded-xl border border-macau-navy/10 px-3 py-2 outline-none focus:border-macau-teal"
            value={form.availability}
            onChange={(e) => setForm({ ...form, availability: e.target.value })}
          />
        </label>

        <div>
          <div className="text-sm font-medium text-macau-navy mb-2">
            {lang === "zh" ? "偏好類型" : "Preferred lanes"}
          </div>
          <div className="flex flex-wrap gap-2">
            {ALL_LANES.map((l) => (
              <button
                key={l}
                type="button"
                onClick={() => toggleLane(l)}
                className={`rounded-full px-3 py-1 text-xs font-medium border transition ${
                  form.preferredLanes.includes(l)
                    ? "bg-macau-teal text-white border-macau-teal"
                    : "bg-white border-macau-navy/15 text-macau-navy/70"
                }`}
              >
                {laneLabel(lang, l)}
              </button>
            ))}
          </div>
        </div>

        <div>
          <div className="text-sm font-medium text-macau-navy mb-2">{tr("sector")}</div>
          <div className="flex flex-wrap gap-2">
            {ALL_SECTORS.map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => toggleSector(s)}
                className={`rounded-full px-3 py-1 text-xs font-medium border transition ${
                  form.preferredSectors.includes(s)
                    ? "bg-macau-navy text-white border-macau-navy"
                    : "bg-white border-macau-navy/15 text-macau-navy/70"
                }`}
              >
                {sectorLabel(lang, s)}
              </button>
            ))}
          </div>
        </div>

        <label className="block text-sm">
          <span className="font-medium text-macau-navy">{tr("bio")}</span>
          <textarea
            rows={3}
            className="mt-1 w-full rounded-xl border border-macau-navy/10 px-3 py-2 outline-none focus:border-macau-teal"
            value={form.bio}
            onChange={(e) => setForm({ ...form, bio: e.target.value })}
          />
        </label>

        {form.age < 18 && (
          <label className="flex items-start gap-2 rounded-xl bg-macau-cream p-3 text-sm">
            <input
              type="checkbox"
              className="mt-1"
              checked={form.parentalConsent}
              onChange={(e) => setForm({ ...form, parentalConsent: e.target.checked })}
            />
            <span>
              {tr("parentalConsent")}
              <span className="block text-xs text-macau-navy/50 mt-1">
                {lang === "zh"
                  ? "未滿18歲申請前應取得父母／監護人同意。"
                  : "Under-18 applicants should record guardian consent before applying."}
              </span>
            </span>
          </label>
        )}

        <div className="flex flex-wrap gap-3 pt-2">
          <button
            type="button"
            onClick={save}
            className="rounded-xl bg-macau-red px-5 py-2.5 text-sm font-semibold text-white hover:bg-macau-red/90"
          >
            {tr("saveProfile")}
          </button>
          <button
            type="button"
            onClick={() => setYouth({ ...demoYouth, createdAt: new Date().toISOString() })}
            className="rounded-xl border border-macau-navy/15 px-5 py-2.5 text-sm font-medium hover:bg-macau-cream"
          >
            {tr("useDemoProfile")}
          </button>
          <Link
            href="/match"
            className="rounded-xl bg-macau-teal px-5 py-2.5 text-sm font-semibold text-white hover:bg-macau-teal/90"
          >
            {tr("ctaMatch")}
          </Link>
        </div>
      </div>

      <section className="mt-10">
        <h2 className="text-xl font-bold text-macau-navy">{tr("myApplications")}</h2>
        {myApps.length === 0 ? (
          <p className="mt-3 text-sm text-macau-navy/50">{tr("applicationsEmpty")}</p>
        ) : (
          <ul className="mt-4 space-y-2">
            {myApps.map((a) => {
              const job = jobs.find((j) => j.id === a.jobId);
              return (
                <li
                  key={a.id}
                  className="flex items-center justify-between rounded-xl border border-macau-navy/8 bg-white px-4 py-3 text-sm shadow-card"
                >
                  <div>
                    <div className="font-semibold text-macau-navy">
                      {job
                        ? lang === "zh"
                          ? job.titleZh
                          : job.title
                        : a.titleSnapshot || a.jobId}
                    </div>
                    {!job && a.companySnapshot && (
                      <div className="text-xs text-macau-navy/55">{a.companySnapshot}</div>
                    )}
                    <div className="text-xs text-macau-navy/45">
                      {new Date(a.appliedAt).toLocaleString()}
                    </div>
                  </div>
                  <select
                    value={a.status}
                    onChange={async (event) => {
                      await updateApplicationStatus(a.id, event.target.value as typeof a.status);
                      window.location.reload();
                    }}
                    className="rounded-full bg-macau-sky px-2.5 py-1 text-xs font-medium text-macau-teal"
                    aria-label={lang === "zh" ? "申請狀態" : "Application status"}
                  >
                    {["applied", "reviewing", "interview", "offered", "rejected", "withdrawn"].map((status) => (
                      <option key={status} value={status}>{status}</option>
                    ))}
                  </select>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section className="mt-10">
        <h2 className="text-xl font-bold text-macau-navy">
          {lang === "zh" ? "收藏職位" : "Saved jobs"}
        </h2>
        {savedJobs.length === 0 ? (
          <p className="mt-3 text-sm text-macau-navy/50">
            {lang === "zh" ? "尚未收藏職位。" : "No saved jobs yet."}
          </p>
        ) : (
          <div className="mt-4 grid gap-2 sm:grid-cols-2">
            {savedJobs.map(({ job }) => (
              <Link key={job.id} href={`/jobs/${job.id}`} className="rounded-xl border bg-white p-4 shadow-card">
                <strong className="text-macau-navy">{lang === "zh" ? job.titleZh : job.title}</strong>
                <p className="mt-1 text-xs text-macau-navy/50">{lang === "zh" ? job.companyZh : job.company}</p>
              </Link>
            ))}
          </div>
        )}
      </section>

      <section className="mt-10 rounded-2xl border bg-white p-5 shadow-card">
        <h2 className="text-xl font-bold text-macau-navy">
          {lang === "zh" ? "職位提示" : "Job alerts"}
        </h2>
        <p className="mt-1 text-xs text-macau-navy/55">
          {lang === "zh"
            ? "先建立站內提示；日後可選擇電郵通知。"
            : "Create an in-app alert now; email delivery can be enabled later."}
        </p>
        <div className="mt-3 flex gap-2">
          <input
            value={alertName}
            onChange={(event) => setAlertName(event.target.value)}
            placeholder={lang === "zh" ? "例如：氹仔實習" : "e.g. Taipa internships"}
            className="min-w-0 flex-1 rounded-xl border px-3 py-2 text-sm"
          />
          <button
            type="button"
            disabled={!alertName.trim()}
            onClick={async () => {
              await saveAlert(alertName.trim(), {
                sectors: youth?.preferredSectors || [],
                lanes: youth?.preferredLanes || [],
                district: youth?.district || "",
              });
              setAlerts(await loadAlerts());
              setAlertName("");
            }}
            className="rounded-xl bg-macau-teal px-4 py-2 text-sm font-semibold text-white disabled:opacity-40"
          >
            {lang === "zh" ? "新增" : "Add"}
          </button>
        </div>
        <ul className="mt-3 space-y-1 text-sm text-macau-navy/65">
          {alerts.map((alert) => <li key={alert.id}>· {alert.name}</li>)}
        </ul>
      </section>

      <section className="mt-10 rounded-2xl border border-macau-red/15 bg-white p-5">
        <h2 className="font-bold text-macau-navy">
          {lang === "zh" ? "私隱與資料控制" : "Privacy and data controls"}
        </h2>
        <p className="mt-1 text-xs text-macau-navy/55">
          {lang === "zh"
            ? "jOOB 預設只保存結構化履歷特徵，不保存原始履歷檔案或全文。"
            : "jOOB stores structured CV features by default, not the original file or full CV text."}
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => {
              const blob = new Blob([JSON.stringify({ youth, applications, savedJobs, alerts }, null, 2)], { type: "application/json" });
              const url = URL.createObjectURL(blob);
              const anchor = document.createElement("a");
              anchor.href = url;
              anchor.download = "joob-data-export.json";
              anchor.click();
              URL.revokeObjectURL(url);
            }}
            className="rounded-xl border px-4 py-2 text-sm"
          >
            {lang === "zh" ? "匯出我的資料" : "Export my data"}
          </button>
          <button
            type="button"
            onClick={async () => {
              if (!window.confirm(lang === "zh" ? "確定刪除所有求職資料？" : "Delete all job-seeker data?")) return;
              await deleteSeekerData();
              window.location.reload();
            }}
            className="rounded-xl border border-macau-red/30 px-4 py-2 text-sm text-macau-red"
          >
            {lang === "zh" ? "刪除求職資料" : "Delete seeker data"}
          </button>
        </div>
      </section>
    </div>
  );
}
