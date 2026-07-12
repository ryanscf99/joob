"use client";

import type { Application, EmployerProfile, JobPosting, YouthProfile } from "./types";
import { seedJobs } from "./jobs-data";

const KEYS = {
  youth: "myeib_youth",
  employer: "myeib_employer",
  jobs: "myeib_jobs",
  apps: "myeib_applications",
  lang: "myeib_lang",
  compliance: "myeib_compliance",
} as const;

function safeParse<T>(raw: string | null, fallback: T): T {
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export function getLang(): "en" | "zh" {
  if (typeof window === "undefined") return "en";
  return safeParse(localStorage.getItem(KEYS.lang), "en" as const);
}

export function setLang(lang: "en" | "zh") {
  localStorage.setItem(KEYS.lang, JSON.stringify(lang));
}

export function getJobs(): JobPosting[] {
  if (typeof window === "undefined") return seedJobs;
  const stored = safeParse<JobPosting[] | null>(localStorage.getItem(KEYS.jobs), null);
  if (!stored || stored.length === 0) {
    localStorage.setItem(KEYS.jobs, JSON.stringify(seedJobs));
    return seedJobs;
  }
  return stored;
}

export function saveJobs(jobs: JobPosting[]) {
  localStorage.setItem(KEYS.jobs, JSON.stringify(jobs));
}

export function addJob(job: JobPosting) {
  const jobs = getJobs();
  jobs.unshift(job);
  saveJobs(jobs);
}

export function getYouth(): YouthProfile | null {
  if (typeof window === "undefined") return null;
  return safeParse(localStorage.getItem(KEYS.youth), null);
}

export function saveYouth(profile: YouthProfile) {
  localStorage.setItem(KEYS.youth, JSON.stringify(profile));
}

export function getEmployer(): EmployerProfile | null {
  if (typeof window === "undefined") return null;
  return safeParse(localStorage.getItem(KEYS.employer), null);
}

export function saveEmployer(profile: EmployerProfile) {
  localStorage.setItem(KEYS.employer, JSON.stringify(profile));
}

export function getApplications(): Application[] {
  if (typeof window === "undefined") return [];
  return safeParse(localStorage.getItem(KEYS.apps), []);
}

export function addApplication(app: Application) {
  const apps = getApplications();
  if (apps.some((a) => a.jobId === app.jobId && a.youthId === app.youthId)) return false;
  apps.unshift(app);
  localStorage.setItem(KEYS.apps, JSON.stringify(apps));
  return true;
}

export function getComplianceChecks(): Record<string, boolean> {
  if (typeof window === "undefined") return {};
  return safeParse(localStorage.getItem(KEYS.compliance), {});
}

export function setComplianceChecks(checks: Record<string, boolean>) {
  localStorage.setItem(KEYS.compliance, JSON.stringify(checks));
}

export const demoYouth: YouthProfile = {
  id: "demo-youth-1",
  name: "Chan Mei Ling",
  age: 17,
  isStudent: true,
  languages: ["Cantonese", "English", "Mandarin"],
  skills: ["customer-service", "teamwork", "english", "cantonese", "computers"],
  preferredLanes: ["summer", "part-time"],
  preferredSectors: ["fnb", "retail", "hospitality", "mice"],
  availability: "Weekends & summer full-time",
  district: "Taipa",
  bio: "Form 5 student seeking fair summer / weekend work. Friendly, punctual, bilingual.",
  parentalConsent: true,
  createdAt: new Date().toISOString(),
};
