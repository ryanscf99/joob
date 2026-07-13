"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type {
  Application,
  EmployerProfile,
  JobPosting,
  Lang,
  YouthProfile,
} from "@/lib/types";
import { t, type DictKey } from "@/lib/i18n";
import {
  addApplication as storeAddApp,
  addJob as storeAddJob,
  getApplications,
  getEmployer,
  getJobs,
  getLang,
  getYouth,
  saveEmployer,
  saveYouth,
  setLang as storeSetLang,
} from "@/lib/storage";
import { seedJobs } from "@/lib/jobs-data";
import {
  buildSectorBenchmarks,
  type SectorWageBenchmark,
} from "@/lib/wage-benchmark";
import type { Sector } from "@/lib/types";
import {
  setOfficialWorkforceLookup,
  type EmployerWorkforce,
} from "@/lib/employer-transparency";
import { repairHelloJobsExternalUrl } from "@/lib/hellojobs";

interface DsalStats {
  officialTotalVacancies: number | null;
  officialProfessionCount: number | null;
  returned: number;
}

interface JobscallStats {
  companies: number;
  returned: number;
}

interface HelloJobsStats {
  pagesFetched: number;
  totalOnBoard: number | null;
  returned: number;
}

interface AppContextValue {
  lang: Lang;
  setLang: (l: Lang) => void;
  tr: (key: DictKey) => string;
  /** Merged public vacancies only: DSAL + Jobscall + Hello-Jobs (no demo/in-app seed) */
  jobs: JobPosting[];
  /** Employer/demo local posts — not shown in public job browse */
  localJobs: JobPosting[];
  officialJobs: JobPosting[];
  jobscallJobs: JobPosting[];
  hellojobsJobs: JobPosting[];
  /** Sector pay benchmarks (prefer DSAL sample median) */
  wageBenchmarks: Record<Sector, SectorWageBenchmark>;
  dsalLoading: boolean;
  dsalError: string | null;
  dsalStats: DsalStats | null;
  dsalFetchedAt: string | null;
  jobscallLoading: boolean;
  jobscallError: string | null;
  jobscallStats: JobscallStats | null;
  jobscallFetchedAt: string | null;
  hellojobsLoading: boolean;
  hellojobsError: string | null;
  hellojobsStats: HelloJobsStats | null;
  hellojobsFetchedAt: string | null;
  refreshJobs: () => void;
  refreshOfficialJobs: (opts?: { force?: boolean }) => Promise<void>;
  refreshJobscallJobs: (opts?: { force?: boolean }) => Promise<void>;
  refreshHelloJobs: (opts?: { force?: boolean }) => Promise<void>;
  addJob: (job: JobPosting) => void;
  youth: YouthProfile | null;
  setYouth: (p: YouthProfile) => void;
  employer: EmployerProfile | null;
  setEmployer: (p: EmployerProfile) => void;
  applications: Application[];
  applyToJob: (jobId: string, note?: string) => boolean;
  toast: string | null;
  showToast: (msg: string) => void;
}

const AppContext = createContext<AppContextValue | null>(null);

const PUBLIC_SOURCES = new Set(["dsal", "jobscall", "hellojobs"]);

function isPublicVacancy(j: JobPosting): boolean {
  const src = j.source || "";
  return PUBLIC_SOURCES.has(src);
}

function mergeJobs(
  _local: JobPosting[],
  official: JobPosting[],
  jobscall: JobPosting[],
  hellojobs: JobPosting[]
): JobPosting[] {
  // Public boards only — hide seed / in-app platform demos
  const seen = new Set<string>();
  const ordered: JobPosting[] = [];

  for (const j of official) {
    if (seen.has(j.id)) continue;
    seen.add(j.id);
    ordered.push({ ...j, source: j.source || "dsal" });
  }
  for (const j of jobscall) {
    if (seen.has(j.id)) continue;
    seen.add(j.id);
    ordered.push({ ...j, source: j.source || "jobscall" });
  }
  for (const j of hellojobs) {
    if (seen.has(j.id)) continue;
    seen.add(j.id);
    ordered.push({
      ...j,
      source: j.source || "hellojobs",
      // Repair legacy apply links missing /Job-Search/ (Hello-Jobs 404 page)
      externalUrl:
        repairHelloJobsExternalUrl(j.externalUrl) || j.externalUrl,
    });
  }
  // Intentionally omit seed/platform localJobs from public catalog
  return ordered.filter(isPublicVacancy);
}

export function AppProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>("en");
  const [localJobs, setLocalJobs] = useState<JobPosting[]>(seedJobs);
  const [officialJobs, setOfficialJobs] = useState<JobPosting[]>([]);
  const [jobscallJobs, setJobscallJobs] = useState<JobPosting[]>([]);
  const [hellojobsJobs, setHellojobsJobs] = useState<JobPosting[]>([]);
  const [youth, setYouthState] = useState<YouthProfile | null>(null);
  const [employer, setEmployerState] = useState<EmployerProfile | null>(null);
  const [applications, setApplications] = useState<Application[]>([]);
  const [toast, setToast] = useState<string | null>(null);
  const [hydrated, setHydrated] = useState(false);
  const [dsalLoading, setDsalLoading] = useState(false);
  const [dsalError, setDsalError] = useState<string | null>(null);
  const [dsalStats, setDsalStats] = useState<DsalStats | null>(null);
  const [dsalFetchedAt, setDsalFetchedAt] = useState<string | null>(null);
  const [jobscallLoading, setJobscallLoading] = useState(false);
  const [jobscallError, setJobscallError] = useState<string | null>(null);
  const [jobscallStats, setJobscallStats] = useState<JobscallStats | null>(null);
  const [jobscallFetchedAt, setJobscallFetchedAt] = useState<string | null>(null);
  const [hellojobsLoading, setHellojobsLoading] = useState(false);
  const [hellojobsError, setHellojobsError] = useState<string | null>(null);
  const [hellojobsStats, setHellojobsStats] = useState<HelloJobsStats | null>(
    null
  );
  const [hellojobsFetchedAt, setHellojobsFetchedAt] = useState<string | null>(
    null
  );

  const jobs = useMemo(
    () => mergeJobs(localJobs, officialJobs, jobscallJobs, hellojobsJobs),
    [localJobs, officialJobs, jobscallJobs, hellojobsJobs]
  );

  /** Live DSAL-sample medians by sector; static fallback when n is thin */
  const wageBenchmarks = useMemo(
    () => buildSectorBenchmarks(officialJobs),
    [officialJobs]
  );

  const refreshOfficialJobs = useCallback(async (opts?: { force?: boolean }) => {
    const force = opts?.force === true;
    setDsalError(null);

    // Session cache first — no loading spinner on nav clicks
    if (!force && typeof sessionStorage !== "undefined") {
      try {
        const cached = sessionStorage.getItem("myeib_dsal_jobs_v1");
        if (cached) {
          const parsed = JSON.parse(cached) as {
            at: number;
            data: {
              jobs: JobPosting[];
              stats: DsalStats | null;
              fetchedAt: string;
            };
          };
          if (
            Date.now() - parsed.at < 15 * 60 * 1000 &&
            parsed.data?.jobs?.length
          ) {
            setOfficialJobs(parsed.data.jobs);
            setDsalStats(parsed.data.stats);
            setDsalFetchedAt(parsed.data.fetchedAt);
            return;
          }
        }
      } catch {
        /* ignore bad cache */
      }
    }

    setDsalLoading(true);
    try {
      const qs = new URLSearchParams({
        mode: "youth",
        limit: "80",
      });
      if (force) qs.set("force", "1");

      const res = await fetch(`/api/dsal/jobs?${qs.toString()}`);
      const data = await res.json();
      if (!res.ok || !data.ok) {
        throw new Error(data.error || `HTTP ${res.status}`);
      }
      const jobsList = (data.jobs || []) as JobPosting[];
      setOfficialJobs(jobsList);
      setDsalStats(data.stats || null);
      const at = data.fetchedAt || new Date().toISOString();
      setDsalFetchedAt(at);
      try {
        sessionStorage.setItem(
          "myeib_dsal_jobs_v1",
          JSON.stringify({
            at: Date.now(),
            data: { jobs: jobsList, stats: data.stats || null, fetchedAt: at },
          })
        );
      } catch {
        /* quota / private mode */
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Failed to load DSAL jobs";
      setDsalError(msg);
    } finally {
      setDsalLoading(false);
    }
  }, []);

  const refreshJobscallJobs = useCallback(async (opts?: { force?: boolean }) => {
    const force = opts?.force === true;
    setJobscallError(null);

    if (!force && typeof sessionStorage !== "undefined") {
      try {
        const cached = sessionStorage.getItem("myeib_jobscall_jobs_v3");
        if (cached) {
          const parsed = JSON.parse(cached) as {
            at: number;
            data: {
              jobs: JobPosting[];
              stats: JobscallStats | null;
              fetchedAt: string;
            };
          };
          if (
            Date.now() - parsed.at < 15 * 60 * 1000 &&
            parsed.data?.jobs?.length
          ) {
            setJobscallJobs(parsed.data.jobs);
            setJobscallStats(parsed.data.stats);
            setJobscallFetchedAt(parsed.data.fetchedAt);
            return;
          }
        }
      } catch {
        /* ignore */
      }
    }

    setJobscallLoading(true);
    try {
      const qs = new URLSearchParams({
        pages: "50",
        limit: "1000",
      });
      if (force) qs.set("force", "1");

      const res = await fetch(`/api/jobscall/jobs?${qs.toString()}`);
      const data = await res.json();
      if (!res.ok || !data.ok) {
        throw new Error(data.error || `HTTP ${res.status}`);
      }
      const jobsList = (data.jobs || []) as JobPosting[];
      setJobscallJobs(jobsList);
      const stats = (data.stats || null) as JobscallStats | null;
      setJobscallStats(stats);
      const at = data.fetchedAt || new Date().toISOString();
      setJobscallFetchedAt(at);
      try {
        sessionStorage.setItem(
          "myeib_jobscall_jobs_v3",
          JSON.stringify({
            at: Date.now(),
            data: { jobs: jobsList, stats, fetchedAt: at },
          })
        );
      } catch {
        /* quota */
      }
    } catch (e) {
      const msg =
        e instanceof Error ? e.message : "Failed to load Jobscall jobs";
      setJobscallError(msg);
    } finally {
      setJobscallLoading(false);
    }
  }, []);

  const refreshHelloJobs = useCallback(async (opts?: { force?: boolean }) => {
    const force = opts?.force === true;
    setHellojobsError(null);

    if (!force && typeof sessionStorage !== "undefined") {
      try {
        const cached = sessionStorage.getItem("myeib_hellojobs_jobs_v2");
        if (cached) {
          const parsed = JSON.parse(cached) as {
            at: number;
            data: {
              jobs: JobPosting[];
              stats: HelloJobsStats | null;
              fetchedAt: string;
            };
          };
          if (
            Date.now() - parsed.at < 15 * 60 * 1000 &&
            parsed.data?.jobs?.length
          ) {
            setHellojobsJobs(parsed.data.jobs);
            setHellojobsStats(parsed.data.stats);
            setHellojobsFetchedAt(parsed.data.fetchedAt);
            return;
          }
        }
      } catch {
        /* ignore */
      }
    }

    setHellojobsLoading(true);
    try {
      const qs = new URLSearchParams({
        pages: "67",
        limit: "1000",
      });
      if (force) qs.set("force", "1");

      const res = await fetch(`/api/hellojobs/jobs?${qs.toString()}`);
      const data = await res.json();
      if (!res.ok || !data.ok) {
        throw new Error(data.error || `HTTP ${res.status}`);
      }
      const jobsList = (data.jobs || []) as JobPosting[];
      setHellojobsJobs(jobsList);
      const stats = (data.stats || null) as HelloJobsStats | null;
      setHellojobsStats(stats);
      const at = data.fetchedAt || new Date().toISOString();
      setHellojobsFetchedAt(at);
      try {
        sessionStorage.setItem(
          "myeib_hellojobs_jobs_v2",
          JSON.stringify({
            at: Date.now(),
            data: { jobs: jobsList, stats, fetchedAt: at },
          })
        );
      } catch {
        /* quota — large payload may not fit */
      }
    } catch (e) {
      const msg =
        e instanceof Error ? e.message : "Failed to load Hello-Jobs listings";
      setHellojobsError(msg);
    } finally {
      setHellojobsLoading(false);
    }
  }, []);

  useEffect(() => {
    setLangState(getLang());
    setLocalJobs(getJobs());
    setYouthState(getYouth());
    setEmployerState(getEmployer());
    setApplications(getApplications());

    // Warm-start jobs from session so nav clicks paint instantly (no empty wait)
    try {
      const dsalRaw = sessionStorage.getItem("myeib_dsal_jobs_v1");
      if (dsalRaw) {
        const parsed = JSON.parse(dsalRaw) as {
          at: number;
          data: {
            jobs: JobPosting[];
            stats: DsalStats | null;
            fetchedAt: string;
          };
        };
        if (
          Date.now() - parsed.at < 15 * 60 * 1000 &&
          parsed.data?.jobs?.length
        ) {
          setOfficialJobs(parsed.data.jobs);
          setDsalStats(parsed.data.stats);
          setDsalFetchedAt(parsed.data.fetchedAt);
        }
      }
      const jcRaw = sessionStorage.getItem("myeib_jobscall_jobs_v3");
      if (jcRaw) {
        const parsed = JSON.parse(jcRaw) as {
          at: number;
          data: {
            jobs: JobPosting[];
            stats: JobscallStats | null;
            fetchedAt: string;
          };
        };
        if (
          Date.now() - parsed.at < 15 * 60 * 1000 &&
          parsed.data?.jobs?.length
        ) {
          setJobscallJobs(parsed.data.jobs);
          setJobscallStats(parsed.data.stats);
          setJobscallFetchedAt(parsed.data.fetchedAt);
        }
      }
      const hjRaw = sessionStorage.getItem("myeib_hellojobs_jobs_v2");
      if (hjRaw) {
        const parsed = JSON.parse(hjRaw) as {
          at: number;
          data: {
            jobs: JobPosting[];
            stats: HelloJobsStats | null;
            fetchedAt: string;
          };
        };
        if (
          Date.now() - parsed.at < 15 * 60 * 1000 &&
          parsed.data?.jobs?.length
        ) {
          setHellojobsJobs(parsed.data.jobs);
          setHellojobsStats(parsed.data.stats);
          setHellojobsFetchedAt(parsed.data.fetchedAt);
        }
      }
    } catch {
      /* private mode / quota */
    }

    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    // DSAL first (smaller) so first paint / jobs feel fast
    void refreshOfficialJobs();
    // Commercial boards are heavier — stagger so tunnels aren't flooded on open
    const tJc = window.setTimeout(() => {
      void refreshJobscallJobs();
    }, 600);
    const tHj = window.setTimeout(() => {
      void refreshHelloJobs();
    }, 1400);
    return () => {
      window.clearTimeout(tJc);
      window.clearTimeout(tHj);
    };
  }, [hydrated, refreshOfficialJobs, refreshJobscallJobs, refreshHelloJobs]);

  /** Stable company set for NRW — recompute only when listing companies change */
  const nrwCompanies = useMemo(() => {
    if (jobs.length === 0) return [] as string[];
    return [
      ...new Set(
        jobs
          .map((j) => {
            const a = (j.company || "").trim();
            const b = (j.companyZh || "").trim();
            // Avoid "EHR… EHR…" when DSAL sets both fields to the same string
            if (a && b && a === b) return a;
            return `${a} ${b}`.trim();
          })
          .filter((s) => s.length >= 2)
      ),
    ]
      .slice(0, 80)
      .sort();
  }, [jobs]);

  const companyFingerprint = useMemo(
    () => nrwCompanies.join("\u0001").slice(0, 2500),
    [nrwCompanies]
  );

  /**
   * Batch-match listing companies against DSAL A3 (group aggregates).
   * Single POST, long session cache, only when company set changes.
   */
  useEffect(() => {
    if (!hydrated) return;
    if (nrwCompanies.length === 0) return;

    const companies = nrwCompanies;
    const fingerprint = companyFingerprint;
    // v5: whole-word Latin match (invalidates A&P→Fisherman false maps)
    const cacheKey = "myeib_dsal_nrw_match_v5";
    let cancelled = false;

    const applyMap = (map: Record<string, EmployerWorkforce>) => {
      // Exact key only — fuzzy substring matching caused cross-firm false hits
      const exact = new Map<string, EmployerWorkforce>();
      for (const [k, v] of Object.entries(map)) {
        exact.set(k, v);
        exact.set(k.trim().toLowerCase(), v);
      }
      setOfficialWorkforceLookup((name) => {
        if (!name) return null;
        if (exact.has(name)) return exact.get(name) ?? null;
        const lower = name.trim().toLowerCase();
        if (exact.has(lower)) return exact.get(lower) ?? null;
        return null;
      });
    };

    // Defer so first paint / jobs list is not blocked
    const timer = window.setTimeout(async () => {
      try {
        if (typeof sessionStorage !== "undefined") {
          try {
            const raw = sessionStorage.getItem(cacheKey);
            if (raw) {
              const parsed = JSON.parse(raw) as {
                at: number;
                fingerprint?: string;
                matches: Record<string, EmployerWorkforce>;
              };
              if (
                Date.now() - parsed.at < 60 * 60 * 1000 &&
                parsed.matches &&
                Object.keys(parsed.matches).length > 0 &&
                (!parsed.fingerprint || parsed.fingerprint === fingerprint)
              ) {
                applyMap(parsed.matches);
                return;
              }
            }
          } catch {
            /* ignore */
          }
        }

        if (cancelled) return;

        const res = await fetch("/api/dsal/nrw", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ names: companies }),
        });
        const data = await res.json();
        if (cancelled || !res.ok || !data.ok) return;

        const matches = (data.matches || {}) as Record<
          string,
          EmployerWorkforce
        >;
        applyMap(matches);

        try {
          sessionStorage.setItem(
            cacheKey,
            JSON.stringify({
              at: Date.now(),
              fingerprint,
              matches,
            })
          );
        } catch {
          /* quota — skip persisting large payload */
        }
      } catch {
        /* best-effort */
      }
    }, 600);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [hydrated, companyFingerprint, nrwCompanies]);

  const setLang = useCallback((l: Lang) => {
    setLangState(l);
    storeSetLang(l);
  }, []);

  const tr = useCallback((key: DictKey) => t(lang, key), [lang]);

  const showToast = useCallback((msg: string) => {
    setToast(msg);
    window.setTimeout(() => setToast(null), 2800);
  }, []);

  const refreshJobs = useCallback(() => {
    setLocalJobs(getJobs());
  }, []);

  const addJob = useCallback(
    (job: JobPosting) => {
      const withSource = { ...job, source: job.source || ("platform" as const) };
      storeAddJob(withSource);
      setLocalJobs(getJobs());
      showToast(t(lang, "successPosted"));
    },
    [lang, showToast]
  );

  const setYouth = useCallback(
    (p: YouthProfile) => {
      saveYouth(p);
      setYouthState(p);
      showToast(t(lang, "successSaved"));
    },
    [lang, showToast]
  );

  const setEmployer = useCallback(
    (p: EmployerProfile) => {
      saveEmployer(p);
      setEmployerState(p);
      showToast(t(lang, "successSaved"));
    },
    [lang, showToast]
  );

  const applyToJob = useCallback(
    (jobId: string, note?: string) => {
      const y = getYouth();
      if (!y) {
        showToast(
          lang === "zh" ? "請先建立青年檔案" : "Please create a youth profile first"
        );
        return false;
      }
      const job = jobs.find((j) => j.id === jobId);
      if (job?.source === "dsal") {
        // Official vacancies must be applied via DSAL / employer contact
        showToast(
          lang === "zh"
            ? "此為勞工局官方空缺：請使用官方聯絡方式或勞工局平台申請"
            : "Official DSAL vacancy: apply via listed contact or the DSAL portal"
        );
        if (job.externalUrl && typeof window !== "undefined") {
          window.open(job.externalUrl, "_blank", "noopener,noreferrer");
        }
        return false;
      }
      if (job?.source === "jobscall") {
        showToast(
          lang === "zh"
            ? "此為 Jobscall.me 職位：請於原網站申請"
            : "Jobscall.me listing: apply on the original employer page"
        );
        if (job.externalUrl && typeof window !== "undefined") {
          window.open(job.externalUrl, "_blank", "noopener,noreferrer");
        }
        return false;
      }
      if (job?.source === "hellojobs") {
        showToast(
          lang === "zh"
            ? "此為 Hello-Jobs 職位：請於原網站申請"
            : "Hello-Jobs listing: apply on the original job page"
        );
        if (job.externalUrl && typeof window !== "undefined") {
          window.open(job.externalUrl, "_blank", "noopener,noreferrer");
        }
        return false;
      }
      const app: Application = {
        id: `app-${Date.now()}`,
        jobId,
        youthId: y.id,
        status: "applied",
        appliedAt: new Date().toISOString(),
        note,
      };
      const ok = storeAddApp(app);
      if (ok) {
        setApplications(getApplications());
        showToast(t(lang, "successApplied"));
      } else {
        showToast(lang === "zh" ? "你已申請此職位" : "Already applied to this job");
      }
      return ok;
    },
    [lang, showToast, jobs]
  );

  const value = useMemo(
    () => ({
      lang,
      setLang,
      tr,
      jobs,
      localJobs,
      officialJobs,
      jobscallJobs,
      hellojobsJobs,
      wageBenchmarks,
      dsalLoading,
      dsalError,
      dsalStats,
      dsalFetchedAt,
      jobscallLoading,
      jobscallError,
      jobscallStats,
      jobscallFetchedAt,
      hellojobsLoading,
      hellojobsError,
      hellojobsStats,
      hellojobsFetchedAt,
      refreshJobs,
      refreshOfficialJobs,
      refreshJobscallJobs,
      refreshHelloJobs,
      addJob,
      youth,
      setYouth,
      employer,
      setEmployer,
      applications,
      applyToJob,
      toast,
      showToast,
    }),
    [
      lang,
      setLang,
      tr,
      jobs,
      localJobs,
      officialJobs,
      jobscallJobs,
      hellojobsJobs,
      wageBenchmarks,
      dsalLoading,
      dsalError,
      dsalStats,
      dsalFetchedAt,
      jobscallLoading,
      jobscallError,
      jobscallStats,
      jobscallFetchedAt,
      hellojobsLoading,
      hellojobsError,
      hellojobsStats,
      hellojobsFetchedAt,
      refreshJobs,
      refreshOfficialJobs,
      refreshJobscallJobs,
      refreshHelloJobs,
      addJob,
      youth,
      setYouth,
      employer,
      setEmployer,
      applications,
      applyToJob,
      toast,
      showToast,
    ]
  );

  if (!hydrated) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-macau-cream">
        <div className="text-joob-cocoaSoft text-sm tracking-wide font-semibold">
          jOOB · loading… 🐱
        </div>
      </div>
    );
  }

  return (
    <AppContext.Provider value={value}>
      {children}
      {toast && (
        <div
          role="status"
          className="fixed left-1/2 z-[100] w-[min(92vw,28rem)] -translate-x-1/2 rounded-2xl border border-white/10 bg-joob-cocoa/95 px-5 py-3.5 text-center text-sm font-semibold text-white shadow-cat backdrop-blur-md lg:bottom-6"
          style={{
            bottom: "calc(5rem + env(safe-area-inset-bottom, 0px))",
          }}
        >
          {toast}
        </div>
      )}
    </AppContext.Provider>
  );
}

export function useApp() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error("useApp must be used within AppProvider");
  return ctx;
}
