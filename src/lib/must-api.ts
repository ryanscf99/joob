/**
 * MUST (Macau University of Science and Technology) careers API client.
 *
 * careers.must.edu.mo is a Vue SPA. Public job data comes from:
 *   https://careers.must.edu.mo/x-e-recruitment-api/...
 *
 * Requests require query params:
 *   lang, nonce, signature
 * where:
 *   nonce = md5(random)
 *   signature = md5(sorted "key=value" pairs joined + salt)
 *   salt = "wm-recruitment"  (from SPA bundle API_SALT)
 *
 * Academic/teaching posts use workClassification=TP.
 */

import { createHash, randomBytes } from "crypto";
import type { FacultyPosition } from "./faculty-jobs";
import { inferFields, inferRanks } from "./faculty-jobs";
import { MACAU_TOP4 } from "./macau-universities";

const MUST_API = "https://careers.must.edu.mo/x-e-recruitment-api";
const MUST_PORTAL = "https://careers.must.edu.mo";
const API_SALT = "wm-recruitment";

export interface MustJobListItem {
  id: number;
  jobPostNo?: string;
  deptDcName?: string;
  jobTitleName?: string;
  deadlineDate?: string | null;
  schedulePublishDate?: string | null;
  workClassification?: string;
  employmentType?: string | null;
}

export interface MustJobDetail extends MustJobListItem {
  jobPostDesc?: string;
  recruitDcCntyName?: string;
  employmentType?: string | null;
  /** other fields may exist */
  [key: string]: unknown;
}

function md5(s: string): string {
  return createHash("md5").update(s, "utf8").digest("hex");
}

function signParams(
  params: Record<string, string | number>,
  salt = API_SALT
): string {
  const pairs = Object.entries(params)
    .filter(([, v]) => v !== null && v !== undefined && v !== "")
    .map(([k, v]) => [k, String(v)] as [string, string])
    .sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));
  const paramString = pairs.map(([k, v]) => `${k}=${v}`).join("");
  return md5(paramString + salt);
}

function buildSignedQuery(
  extra: Record<string, string | number | null | undefined> = {},
  lang = "en_US"
): string {
  const nonce = md5(randomBytes(12).toString("hex"));
  const params: Record<string, string | number> = { lang, nonce };
  for (const [k, v] of Object.entries(extra)) {
    if (v !== null && v !== undefined && v !== "") params[k] = v;
  }
  params.signature = signParams(params);
  return new URLSearchParams(
    Object.entries(params).map(([k, v]) => [k, String(v)])
  ).toString();
}

async function mustGet<T = unknown>(
  path: string,
  extra: Record<string, string | number | null | undefined> = {},
  timeoutMs = 15000
): Promise<T> {
  const qs = buildSignedQuery(extra);
  const url = `${MUST_API}/${path.replace(/^\//, "")}?${qs}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      headers: {
        Accept: "application/json",
        "X-Requested-With": "XMLHttpRequest",
        "User-Agent":
          "MYEIB-FacultyFinder/1.0 (Macau research; MUST e-recruitment)",
      },
      signal: controller.signal,
      cache: "no-store",
    });
    const json = (await res.json()) as {
      success?: boolean;
      errorMsg?: string;
      data?: unknown;
      model?: unknown;
      total?: number;
    };
    if (json.success === false) {
      throw new Error(json.errorMsg || "MUST API error");
    }
    return json as T;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * List open academic/teaching posts (workClassification=TP).
 */
export async function fetchMustTeachingJobs(
  maxItems = 100
): Promise<MustJobListItem[]> {
  const json = await mustGet<{ data?: MustJobListItem[]; total?: number }>(
    "web-job-posts",
    {
      offsetStart: 1,
      maxPageItems: maxItems,
      workClassification: "TP",
    }
  );
  return json.data || [];
}

/**
 * Full job description for a post id.
 */
export async function fetchMustJobDetail(
  id: number | string
): Promise<MustJobDetail | null> {
  const json = await mustGet<{ model?: MustJobDetail }>(
    `web-job-posts/${id}`
  );
  return json.model || null;
}

/**
 * Map MUST list (+ optional detail) → FacultyPosition.
 */
export function mapMustToFaculty(
  item: MustJobListItem,
  detail?: MustJobDetail | null
): FacultyPosition {
  const uni = MACAU_TOP4.find((u) => u.id === "must")!;
  const title = item.jobTitleName || "Academic position";
  const unit = item.deptDcName || "MUST";
  const desc = detail?.jobPostDesc || "";
  // SPA route: path "recruitment-latest-details", id in query[0] (see goDetailsPage → toPage(..., [id]))
  // Example: /recruitment-latest-details?0=691&locale=en_US&workClassification=TP
  const applyUrl = mustJobPortalUrl(item.id);

  return {
    id: `must-api-${item.id}`,
    universityId: "must",
    universityNameEn: uni.nameEn,
    universityNameZh: uni.nameZh,
    title,
    unit,
    category: "Academic and Research (TP)",
    refNo: item.jobPostNo,
    postedAt: item.schedulePublishDate || undefined,
    closeDate: item.deadlineDate || undefined,
    url: applyUrl,
    ranks: inferRanks(title),
    fields: inferFields(title, unit + " " + desc),
    source: "live",
    summary: desc
      ? desc.replace(/\s+/g, " ").trim().slice(0, 400)
      : `${unit} — open academic post on MUST recruitment portal.`,
  };
}

/**
 * Fetch all MUST teaching posts with details (batched concurrency).
 */
export async function fetchMustFacultyPositions(
  opts: { withDetails?: boolean; detailLimit?: number; concurrency?: number } = {}
): Promise<{
  positions: FacultyPosition[];
  total: number;
  detailsFetched: number;
}> {
  const withDetails = opts.withDetails !== false;
  const detailLimit = opts.detailLimit ?? 40;
  const concurrency = opts.concurrency ?? 5;

  const list = await fetchMustTeachingJobs(120);
  const positions: FacultyPosition[] = [];
  let detailsFetched = 0;

  // Fetch details for first N (JD text for matching)
  const toDetail = withDetails ? list.slice(0, detailLimit) : [];
  const rest = withDetails ? list.slice(detailLimit) : list;

  async function mapPool<T, R>(
    items: T[],
    n: number,
    fn: (t: T) => Promise<R>
  ): Promise<R[]> {
    const out = new Array<R>(items.length);
    let i = 0;
    async function worker() {
      while (i < items.length) {
        const idx = i++;
        out[idx] = await fn(items[idx]);
      }
    }
    await Promise.all(
      Array.from({ length: Math.min(n, items.length) }, () => worker())
    );
    return out;
  }

  if (toDetail.length) {
    const detailed = await mapPool(toDetail, concurrency, async (item) => {
      try {
        const d = await fetchMustJobDetail(item.id);
        detailsFetched++;
        return mapMustToFaculty(item, d);
      } catch {
        return mapMustToFaculty(item, null);
      }
    });
    positions.push(...detailed);
  }

  for (const item of rest) {
    positions.push(mapMustToFaculty(item, null));
  }

  return { positions, total: list.length, detailsFetched };
}

/**
 * Public SPA deep link to a MUST job detail page.
 * Frontend uses vue-router name PositionDetails, path `recruitment-latest-details`,
 * and reads the job id from `$route.query[0]` (set via toPage(..., [id])).
 */
export function mustJobPortalUrl(id: number | string): string {
  const qs = new URLSearchParams({
    "0": String(id),
    locale: "en_US",
    workClassification: "TP",
    from: "RecruitmentLatest",
  });
  return `${MUST_PORTAL}/recruitment-latest-details?${qs.toString()}`;
}
