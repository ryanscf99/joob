import type { JobPosting } from "./types";

/** Cap description length in browser memory / sessionStorage */
const DESC_MAX = 360;
const REQ_MAX = 5;
const SKILL_MAX = 10;

/**
 * Slim a job for list UI + session cache.
 * Keeps ranking/match fields; drops long HTML-ish blobs.
 */
export function slimJob(job: JobPosting): JobPosting {
  return {
    ...job,
    description: (job.description || "").slice(0, DESC_MAX),
    descriptionZh: (job.descriptionZh || "").slice(0, DESC_MAX),
    requirements: (job.requirements || []).slice(0, REQ_MAX),
    requirementsZh: (job.requirementsZh || []).slice(0, REQ_MAX),
    skills: (job.skills || []).slice(0, SKILL_MAX),
    languages: (job.languages || []).slice(0, 6),
  };
}

export function slimJobs(jobs: JobPosting[]): JobPosting[] {
  return jobs.map(slimJob);
}

/** Safe sessionStorage write; retries with smaller payload on quota errors. */
export function setSessionJson(key: string, value: unknown): boolean {
  if (typeof sessionStorage === "undefined") return false;
  try {
    sessionStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    try {
      // Drop large job bodies if present
      const v = value as { data?: { jobs?: JobPosting[] } };
      if (v?.data?.jobs?.length) {
        const smaller = {
          ...v,
          data: {
            ...v.data,
            jobs: slimJobs(v.data.jobs).map((j) => ({
              ...j,
              description: (j.description || "").slice(0, 160),
              descriptionZh: (j.descriptionZh || "").slice(0, 160),
              requirements: [],
              requirementsZh: [],
            })),
          },
        };
        sessionStorage.setItem(key, JSON.stringify(smaller));
        return true;
      }
    } catch {
      try {
        sessionStorage.removeItem(key);
      } catch {
        /* ignore */
      }
    }
    return false;
  }
}

export function getSessionJson<T>(key: string): T | null {
  if (typeof sessionStorage === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(key);
    if (!raw) return null;
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}
