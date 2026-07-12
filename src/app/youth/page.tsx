"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useApp } from "@/context/AppContext";
import type { JobLane, Sector, YouthProfile } from "@/lib/types";
import { laneLabel, sectorLabel } from "@/lib/i18n";
import { demoYouth } from "@/lib/storage";
import { CvUpload } from "@/components/CvUpload";

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
                        : a.jobId}
                    </div>
                    <div className="text-xs text-macau-navy/45">
                      {new Date(a.appliedAt).toLocaleString()}
                    </div>
                  </div>
                  <span className="rounded-full bg-macau-sky px-2.5 py-0.5 text-xs font-medium text-macau-teal">
                    {a.status}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
