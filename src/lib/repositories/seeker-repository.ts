"use client";

import type { Application, JobPosting, YouthCvMeta, YouthProfile } from "@/lib/types";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import {
  addApplication as addLocalApplication,
  getApplications,
  getYouth,
  saveYouth,
  updateApplicationStatus as updateLocalApplicationStatus,
} from "@/lib/storage";

const SAVED_KEY = "joob_saved_jobs_v1";
const ALERTS_KEY = "joob_job_alerts_v1";

export interface SavedJob {
  jobId: string;
  job: JobPosting;
  createdAt: string;
}

export interface JobAlert {
  id: string;
  name: string;
  filters: Record<string, unknown>;
  enabled: boolean;
  createdAt: string;
}

async function currentUserId() {
  const client = getSupabaseBrowserClient();
  if (!client) return null;
  const { data } = await client.auth.getUser();
  return data.user?.id ?? null;
}

export async function loadYouthProfile(): Promise<YouthProfile | null> {
  try {
    const client = getSupabaseBrowserClient();
    const userId = await currentUserId();
    if (!client || !userId) return getYouth();
    const [{ data: base }, { data: detail }] = await Promise.all([
      client
        .from("profiles")
        .select("display_name,created_at")
        .eq("id", userId)
        .maybeSingle(),
      client.from("youth_profiles").select("*").eq("user_id", userId).maybeSingle(),
    ]);
    if (!detail) return getYouth();
    const cvFeatures = detail.cv_features as YouthCvMeta["features"] | null;
    return {
      id: userId,
      name: base?.display_name || "",
      age: detail.age,
      isStudent: detail.is_student,
      languages: detail.languages || [],
      skills: detail.skills || [],
      preferredLanes: detail.preferred_lanes || [],
      preferredSectors: detail.preferred_sectors || [],
      availability: detail.availability || "",
      district: detail.district || "",
      bio: detail.bio || "",
      parentalConsent: detail.parental_consent,
      createdAt: base?.created_at || new Date().toISOString(),
      cv:
        cvFeatures && detail.cv_file_name
          ? {
              fileName: detail.cv_file_name,
              uploadedAt: detail.cv_uploaded_at || new Date().toISOString(),
              textLength: cvFeatures.textLength || 0,
              features: cvFeatures,
            }
          : undefined,
    };
  } catch {
    return getYouth();
  }
}

export async function persistYouthProfile(profile: YouthProfile) {
  saveYouth(profile);
  const client = getSupabaseBrowserClient();
  const userId = await currentUserId();
  if (!client || !userId) return;
  const profileResult = await client
    .from("profiles")
    .upsert({ id: userId, display_name: profile.name, updated_at: new Date().toISOString() });
  if (profileResult.error) throw profileResult.error;
  const result = await client.from("youth_profiles").upsert({
    user_id: userId,
    age: profile.age,
    is_student: profile.isStudent,
    languages: profile.languages,
    skills: profile.skills,
    preferred_lanes: profile.preferredLanes,
    preferred_sectors: profile.preferredSectors,
    availability: profile.availability,
    district: profile.district,
    bio: profile.bio,
    parental_consent: profile.parentalConsent,
    cv_features: profile.cv?.features ?? null,
    cv_file_name: profile.cv?.fileName ?? null,
    cv_uploaded_at: profile.cv?.uploadedAt ?? null,
    updated_at: new Date().toISOString(),
  });
  if (result.error) throw result.error;
}

function loadSavedJobsLocal(): SavedJob[] {
  try {
    return JSON.parse(localStorage.getItem(SAVED_KEY) || "[]") as SavedJob[];
  } catch {
    return [];
  }
}

export async function loadSavedJobs(): Promise<SavedJob[]> {
  try {
    const client = getSupabaseBrowserClient();
    const userId = await currentUserId();
    if (!client || !userId) return loadSavedJobsLocal();
    const { data, error } = await client
      .from("saved_jobs")
      .select("job_id,job_snapshot,created_at")
      .order("created_at", { ascending: false });
    if (error) return loadSavedJobsLocal();
    return (data || []).map(
      (row: { job_id: string; job_snapshot: unknown; created_at: string }) => ({
        jobId: row.job_id,
        job: row.job_snapshot as JobPosting,
        createdAt: row.created_at,
      })
    );
  } catch {
    return loadSavedJobsLocal();
  }
}

export async function toggleSavedJob(job: JobPosting, currentlySaved: boolean) {
  const client = getSupabaseBrowserClient();
  const userId = await currentUserId();
  if (!client || !userId) {
    const saved = await loadSavedJobs();
    const next = currentlySaved
      ? saved.filter((item) => item.jobId !== job.id)
      : [{ jobId: job.id, job, createdAt: new Date().toISOString() }, ...saved];
    localStorage.setItem(SAVED_KEY, JSON.stringify(next));
    return next;
  }
  const query = currentlySaved
    ? client.from("saved_jobs").delete().eq("user_id", userId).eq("job_id", job.id)
    : client.from("saved_jobs").upsert({
        user_id: userId,
        job_id: job.id,
        job_snapshot: job,
      });
  const { error } = await query;
  if (error) throw error;
  return loadSavedJobs();
}

export async function loadApplications(): Promise<Application[]> {
  try {
    const client = getSupabaseBrowserClient();
    const userId = await currentUserId();
    if (!client || !userId) return getApplications();
    const { data, error } = await client
      .from("applications")
      .select("*")
      .order("updated_at", { ascending: false });
    if (error) return getApplications();
    return (data || []).map(
      (row: {
        id: string;
        job_id: string;
        user_id: string;
        status: Application["status"];
        applied_at: string;
        note: string | null;
        source: Application["source"];
        source_url: string | null;
        title_snapshot: string;
        company_snapshot: string;
        follow_up_at: string | null;
      }) => ({
        id: row.id,
        jobId: row.job_id,
        youthId: row.user_id,
        status: row.status,
        appliedAt: row.applied_at,
        note: row.note || undefined,
        source: row.source,
        sourceUrl: row.source_url || undefined,
        titleSnapshot: row.title_snapshot,
        companySnapshot: row.company_snapshot,
        followUpAt: row.follow_up_at || undefined,
      })
    );
  } catch {
    return getApplications();
  }
}

export async function recordApplication(job: JobPosting, note?: string) {
  const client = getSupabaseBrowserClient();
  const userId = await currentUserId();
  const localProfile = getYouth();
  if (!client || !userId) {
    if (!localProfile) return false;
    return addLocalApplication({
      id: `app-${Date.now()}`,
      jobId: job.id,
      youthId: localProfile.id,
      status: "applied",
      appliedAt: new Date().toISOString(),
      note,
      source: job.source,
      sourceUrl: job.externalUrl,
      titleSnapshot: job.title,
      companySnapshot: job.company,
    });
  }
  const { error } = await client.from("applications").upsert({
    user_id: userId,
    job_id: job.id,
    source: job.source || "platform",
    source_url: job.externalUrl || null,
    title_snapshot: job.title,
    company_snapshot: job.company,
    status: "applied",
    note: note || null,
    applied_at: new Date().toISOString(),
    follow_up_at: new Date(Date.now() + 7 * 86400000).toISOString(),
    updated_at: new Date().toISOString(),
  });
  if (error) throw error;
  return true;
}

export async function updateApplicationStatus(
  applicationId: string,
  status: Application["status"]
) {
  const client = getSupabaseBrowserClient();
  const userId = await currentUserId();
  if (!client || !userId) {
    updateLocalApplicationStatus(applicationId, status);
    return;
  }
  const { error } = await client
    .from("applications")
    .update({ status, updated_at: new Date().toISOString() })
    .eq("id", applicationId)
    .eq("user_id", userId);
  if (error) throw error;
}

export async function loadAlerts(): Promise<JobAlert[]> {
  const client = getSupabaseBrowserClient();
  const userId = await currentUserId();
  if (!client || !userId) {
    try {
      return JSON.parse(localStorage.getItem(ALERTS_KEY) || "[]") as JobAlert[];
    } catch {
      return [];
    }
  }
  const { data, error } = await client.from("job_alerts").select("*").order("created_at");
  if (error) throw error;
  return (data || []).map((row: {
    id: string;
    name: string;
    filters: Record<string, unknown>;
    enabled: boolean;
    created_at: string;
  }) => ({
    id: row.id,
    name: row.name,
    filters: row.filters,
    enabled: row.enabled,
    createdAt: row.created_at,
  }));
}

export async function saveAlert(name: string, filters: Record<string, unknown>) {
  const client = getSupabaseBrowserClient();
  const userId = await currentUserId();
  if (!client || !userId) {
    const current = await loadAlerts();
    localStorage.setItem(
      ALERTS_KEY,
      JSON.stringify([
        ...current,
        { id: `alert-${Date.now()}`, name, filters, enabled: true, createdAt: new Date().toISOString() },
      ])
    );
    return;
  }
  const { error } = await client.from("job_alerts").insert({ user_id: userId, name, filters });
  if (error) throw error;
}

export async function saveMatchRun(payload: {
  algorithmVersion: string;
  provenance: Record<string, unknown>;
  preferences: Record<string, unknown>;
  results: Array<{ jobId: string; score: number }>;
}) {
  const client = getSupabaseBrowserClient();
  const userId = await currentUserId();
  if (!client || !userId) return;
  await client.from("match_runs").insert({
    user_id: userId,
    algorithm_version: payload.algorithmVersion,
    input_provenance: payload.provenance,
    preferences: payload.preferences,
    result_summary: payload.results.slice(0, 20),
  });
}

export async function deleteSeekerData() {
  const client = getSupabaseBrowserClient();
  const userId = await currentUserId();
  if (!client || !userId) {
    [SAVED_KEY, ALERTS_KEY, "myeib_youth", "myeib_applications"].forEach((key) =>
      localStorage.removeItem(key)
    );
    return;
  }
  await Promise.all([
    client.from("match_runs").delete().eq("user_id", userId),
    client.from("job_alerts").delete().eq("user_id", userId),
    client.from("applications").delete().eq("user_id", userId),
    client.from("saved_jobs").delete().eq("user_id", userId),
    client.from("youth_profiles").delete().eq("user_id", userId),
  ]);
}
