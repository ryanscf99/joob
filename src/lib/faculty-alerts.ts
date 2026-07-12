/**
 * Faculty job alerts (client-side), focused on UM + MUST.
 * Stores preferences + seen post IDs in localStorage; compares on each fetch.
 */

import type { UniId } from "./macau-universities";
import type { FacultyPosition, FacultyRank } from "./faculty-jobs";
import { resolveFacultyPostDate } from "./faculty-jobs";

const PREFS_KEY = "myeib_faculty_alert_prefs_v1";
const SEEN_KEY = "myeib_faculty_alert_seen_v1";
const ALERTS_KEY = "myeib_faculty_alert_inbox_v1";

export interface FacultyAlertPrefs {
  enabled: boolean;
  /** Default: UM + MUST */
  universities: UniId[];
  /** Free-text keywords (title/unit/summary) */
  keywords: string[];
  ranks: FacultyRank[];
  /** Fields like data-science-ai */
  fields: string[];
  /** Notify only assistant/associate if true */
  assistantTrackOnly: boolean;
  updatedAt: string;
}

export interface FacultyAlertItem {
  id: string;
  positionId: string;
  universityId: UniId;
  title: string;
  unit: string;
  url: string;
  refNo?: string;
  postedAt?: string;
  matchedOn: string[];
  createdAt: string;
  read: boolean;
}

export const DEFAULT_FACULTY_ALERT_PREFS: FacultyAlertPrefs = {
  enabled: true,
  universities: ["um", "must"],
  keywords: [],
  ranks: [],
  fields: [],
  assistantTrackOnly: false,
  updatedAt: new Date().toISOString(),
};

function safeParse<T>(raw: string | null, fallback: T): T {
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export function getFacultyAlertPrefs(): FacultyAlertPrefs {
  if (typeof window === "undefined") return DEFAULT_FACULTY_ALERT_PREFS;
  const p = safeParse(
    localStorage.getItem(PREFS_KEY),
    DEFAULT_FACULTY_ALERT_PREFS
  );
  return {
    ...DEFAULT_FACULTY_ALERT_PREFS,
    ...p,
    universities:
      p.universities?.length > 0
        ? p.universities
        : DEFAULT_FACULTY_ALERT_PREFS.universities,
  };
}

export function saveFacultyAlertPrefs(prefs: FacultyAlertPrefs) {
  if (typeof window === "undefined") return;
  localStorage.setItem(
    PREFS_KEY,
    JSON.stringify({ ...prefs, updatedAt: new Date().toISOString() })
  );
}

function getSeenIds(): Set<string> {
  if (typeof window === "undefined") return new Set();
  return new Set(safeParse<string[]>(localStorage.getItem(SEEN_KEY), []));
}

function saveSeenIds(ids: Set<string>) {
  if (typeof window === "undefined") return;
  // Cap storage
  const arr = [...ids].slice(-500);
  localStorage.setItem(SEEN_KEY, JSON.stringify(arr));
}

export function getFacultyAlertInbox(): FacultyAlertItem[] {
  if (typeof window === "undefined") return [];
  return safeParse<FacultyAlertItem[]>(localStorage.getItem(ALERTS_KEY), []);
}

function saveInbox(items: FacultyAlertItem[]) {
  if (typeof window === "undefined") return;
  localStorage.setItem(ALERTS_KEY, JSON.stringify(items.slice(0, 100)));
}

export function markFacultyAlertRead(id: string) {
  const inbox = getFacultyAlertInbox().map((a) =>
    a.id === id ? { ...a, read: true } : a
  );
  saveInbox(inbox);
  return inbox;
}

export function markAllFacultyAlertsRead() {
  const inbox = getFacultyAlertInbox().map((a) => ({ ...a, read: true }));
  saveInbox(inbox);
  return inbox;
}

export function clearFacultyAlerts() {
  saveInbox([]);
}

function matchesPrefs(
  p: FacultyPosition,
  prefs: FacultyAlertPrefs
): { ok: boolean; reasons: string[] } {
  if (!prefs.universities.includes(p.universityId)) {
    return { ok: false, reasons: [] };
  }

  const reasons: string[] = [];
  reasons.push(p.universityId.toUpperCase());

  if (prefs.assistantTrackOnly) {
    const okRank = p.ranks.some((r) =>
      ["assistant_professor", "associate_professor", "research_professor"].includes(
        r
      )
    );
    if (!okRank) return { ok: false, reasons: [] };
    reasons.push("assistant-track");
  }

  if (prefs.ranks.length > 0) {
    if (!p.ranks.some((r) => prefs.ranks.includes(r))) {
      return { ok: false, reasons: [] };
    }
    reasons.push("rank");
  }

  if (prefs.fields.length > 0) {
    if (!p.fields.some((f) => prefs.fields.includes(f))) {
      return { ok: false, reasons: [] };
    }
    reasons.push(...p.fields.filter((f) => prefs.fields.includes(f)));
  }

  if (prefs.keywords.length > 0) {
    const blob = `${p.title} ${p.unit} ${p.summary || ""} ${p.fields.join(" ")}`.toLowerCase();
    const hits = prefs.keywords.filter((k) =>
      blob.includes(k.toLowerCase().trim())
    );
    if (hits.length === 0) return { ok: false, reasons: [] };
    reasons.push(...hits.map((h) => `kw:${h}`));
  }

  return { ok: true, reasons };
}

/**
 * Compare current positions against prefs + seen set.
 * Returns newly detected alerts (also persisted to inbox).
 */
export function processFacultyAlerts(
  positions: FacultyPosition[],
  prefs?: FacultyAlertPrefs
): {
  prefs: FacultyAlertPrefs;
  newAlerts: FacultyAlertItem[];
  inbox: FacultyAlertItem[];
  unread: number;
} {
  const p = prefs || getFacultyAlertPrefs();
  if (!p.enabled) {
    const inbox = getFacultyAlertInbox();
    return {
      prefs: p,
      newAlerts: [],
      inbox,
      unread: inbox.filter((a) => !a.read).length,
    };
  }

  const seen = getSeenIds();
  const newAlerts: FacultyAlertItem[] = [];

  // Focus UM + MUST (and any other uni in prefs)
  const candidates = positions.filter((pos) =>
    p.universities.includes(pos.universityId)
  );

  for (const pos of candidates) {
    if (seen.has(pos.id)) continue;
    // Mark all current matching-or-not as seen after first scan of that id
    // Only create alert if matches prefs
    const { ok, reasons } = matchesPrefs(pos, p);
    seen.add(pos.id);
    if (!ok) continue;
    // Skip undated portal hubs for alerts (not a real post)
    if (pos.source === "portal" && !pos.refNo) continue;

    newAlerts.push({
      id: `alert-${pos.id}-${Date.now()}`,
      positionId: pos.id,
      universityId: pos.universityId,
      title: pos.title,
      unit: pos.unit,
      url: pos.url,
      refNo: pos.refNo,
      postedAt:
        pos.postedAt ||
        resolveFacultyPostDate(pos)?.toISOString().slice(0, 10),
      matchedOn: reasons,
      createdAt: new Date().toISOString(),
      read: false,
    });
  }

  saveSeenIds(seen);

  let inbox = getFacultyAlertInbox();
  if (newAlerts.length) {
    inbox = [...newAlerts, ...inbox].slice(0, 100);
    saveInbox(inbox);
  }

  return {
    prefs: p,
    newAlerts,
    inbox,
    unread: inbox.filter((a) => !a.read).length,
  };
}

/**
 * Seed seen set with current IDs without creating alerts (baseline on first enable).
 */
export function baselineFacultySeen(positions: FacultyPosition[]) {
  const seen = getSeenIds();
  for (const p of positions) {
    if (
      p.universityId === "um" ||
      p.universityId === "must" ||
      p.universityId === "mpu" ||
      p.universityId === "cityu"
    ) {
      seen.add(p.id);
    }
  }
  saveSeenIds(seen);
}
