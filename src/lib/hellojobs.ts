import type { JobLane, JobPosting, Sector } from "./types";

/** Commercial Macau job board (ASP.NET search at jobsearch.hello-jobs.com). */
export const HELLOJOBS_BASE = "https://www.hello-jobs.com";
export const HELLOJOBS_SEARCH_BASE = "https://jobsearch.hello-jobs.com";

/** All-function listing — sorted recent-first by the board (page 1 = newest). */
const LIST_PATH =
  "/Job-Search/Any-Functional-Area-Jobs-in-Macau/F-1.aspx";

const FETCH_TIMEOUT_MS = 12_000;
/** Defaults tuned for Vercel time limits + memory (~15 jobs/page) */
const DEFAULT_MAX_PAGES = 40;
const DEFAULT_MAX_JOBS = 500;
/** Concurrent HTML page fetches (lower = less RAM spike) */
const PAGE_CONCURRENCY = 4;

export interface HelloJobsFetchResult {
  jobs: JobPosting[];
  pagesFetched: number;
  totalOnBoard: number | null;
  fetchedAt: string;
}

interface RawHelloJob {
  id: string;
  title: string;
  company: string;
  postedAt: string;
  href: string;
  categoryHint?: string;
}

function decodeHtmlEntities(s: string): string {
  return (s || "")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&nbsp;/gi, " ")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, h) =>
      String.fromCharCode(parseInt(h, 16))
    );
}

function stripHtml(s: string): string {
  return decodeHtmlEntities(s.replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim();
}

async function fetchText(url: string): Promise<string> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      headers: {
        Accept: "text/html,application/xhtml+xml",
        "User-Agent":
          "MYEIB-MacauYouthEmploymentBridge/1.0 (research pilot; +hello-jobs)",
        "Accept-Language": "en-US,en;q=0.9,zh-TW;q=0.8,zh;q=0.7",
      },
      cache: "no-store",
      signal: controller.signal,
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(`Hello-Jobs ${res.status}: ${text.slice(0, 120)}`);
    }
    return res.text();
  } finally {
    clearTimeout(timer);
  }
}

function listUrl(pageNumber: number): string {
  const q = new URLSearchParams({ Lang: "ENU" });
  if (pageNumber > 1) q.set("pageNumber", String(pageNumber));
  return `${HELLOJOBS_SEARCH_BASE}${LIST_PATH}?${q.toString()}`;
}

/**
 * Resolve relative Job-Description href to absolute URL.
 *
 * List pages live at /Job-Search/<folder>/F-1.aspx and link with
 *   ../Category-Job-Description/slug/id.aspx
 * which resolves to:
 *   https://jobsearch.hello-jobs.com/Job-Search/Category-Job-Description/slug/id.aspx
 *
 * (Previously we stripped ".." and joined at site root → missing /Job-Search/ → 404.)
 */
/** Fix stored/legacy apply links that omitted /Job-Search/ (site 404 page). */
export function repairHelloJobsExternalUrl(url: string | undefined | null): string | undefined {
  if (!url) return undefined;
  try {
    const u = new URL(url);
    if (!u.hostname.includes("hello-jobs")) return url;
    if (
      /Job-Description\//i.test(u.pathname) &&
      !u.pathname.includes("/Job-Search/")
    ) {
      u.pathname = `/Job-Search${u.pathname.startsWith("/") ? "" : "/"}${u.pathname}`;
    }
    if (!u.searchParams.has("Lang")) u.searchParams.set("Lang", "ENU");
    return u.toString();
  } catch {
    return url;
  }
}

export function absoluteJobUrl(
  href: string,
  jobId: string,
  titleSlug?: string
): string {
  const cleaned = href.replace(/&amp;/g, "&").trim();
  // Base must be a file URL under /Job-Search/ so ".." resolves correctly
  const listBase = `${HELLOJOBS_SEARCH_BASE}${LIST_PATH}`;

  let absolute: string;
  try {
    if (cleaned.startsWith("http://") || cleaned.startsWith("https://")) {
      absolute = cleaned;
    } else {
      absolute = new URL(cleaned, listBase).href;
    }
  } catch {
    const slug = titleSlug || "job";
    // Category segment unknown — still keep under /Job-Search/
    absolute = `${HELLOJOBS_SEARCH_BASE}/Job-Search/Job-Description/${slug}/${jobId}.aspx`;
  }

  return (
    repairHelloJobsExternalUrl(absolute) ||
    (absolute.includes("?") ? absolute : `${absolute}?Lang=ENU`)
  );
}

function parsePostedDate(raw: string): string {
  const t = (raw || "").trim();
  // M/D/YYYY or MM/DD/YYYY
  const m = t.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (m) {
    const month = m[1].padStart(2, "0");
    const day = m[2].padStart(2, "0");
    return `${m[3]}-${month}-${day}`;
  }
  // YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}/.test(t)) return t.slice(0, 10);
  return new Date().toISOString().slice(0, 10);
}

function parseTotalOnBoard(html: string): number | null {
  // Board splits number and label: <font class="jobMatches">2573</font>
  const m =
    html.match(/class="jobMatches"[^>]*>\s*([\d,]+)\s*</i) ||
    html.match(/([\d,]+)\s*<\/font>\s*<font[^>]*class="jobMatchesText"/i) ||
    html.match(/([\d,]+)\s+jobs that match/i) ||
    html.match(/([\d,]+)\s*符合配對/i);
  if (!m) return null;
  const n = Number(m[1].replace(/,/g, ""));
  return Number.isFinite(n) ? n : null;
}

/**
 * Parse one search-results HTML page into raw job rows.
 * Board markup: .RMjob-table-row with lnkJobTitle + lnkCompName + lblPosted.
 */
export function parseHelloJobsListHtml(html: string): RawHelloJob[] {
  const out: RawHelloJob[] = [];
  const seen = new Set<string>();

  // Match job title anchors (stable id pattern …lnkJobTitle)
  const re =
    /href="([^"]*Job-Description\/[^"]+\/(\d+)\.aspx[^"]*)"([^>]*)>([\s\S]*?)<\/a>[\s\S]*?lnkCompName[^>]*>([\s\S]*?)<\/a>[\s\S]*?lblPosted[^>]*>([^<]*)</gi;

  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    const attrs = m[3] || "";
    if (!/lnkJobTitle/i.test(attrs)) continue;

    const href = decodeHtmlEntities(m[1]);
    const id = m[2];
    const titleAttrM = attrs.match(/\btitle="([^"]*)"/i);
    const titleAttr = stripHtml(titleAttrM?.[1] || "");
    const titleBody = stripHtml(m[4] || "");
    const company = stripHtml(m[5] || "") || "Anonymous";
    const postedRaw = (m[6] || "").trim();
    const title = titleAttr || titleBody;
    if (!id || !title || seen.has(id)) continue;
    seen.add(id);

    // Category hint from path segment before -Job-Description
    let categoryHint: string | undefined;
    const catM = href.match(/(?:^|\/|\.\.\/)([^/]+)-Job-Description\//i);
    if (catM) {
      try {
        categoryHint = decodeURIComponent(catM[1]).replace(/-/g, " ");
      } catch {
        categoryHint = catM[1].replace(/-/g, " ");
      }
    }

    // Title slug from path
    let titleSlug: string | undefined;
    const slugM = href.match(/Job-Description\/([^/]+)\/\d+\.aspx/i);
    if (slugM) {
      try {
        titleSlug = decodeURIComponent(slugM[1]);
      } catch {
        titleSlug = slugM[1];
      }
    }

    out.push({
      id,
      title,
      company,
      postedAt: parsePostedDate(postedRaw),
      href: absoluteJobUrl(href, id, titleSlug),
      categoryHint,
    });
  }

  // Fallback: looser match if board markup changes slightly
  if (out.length === 0) {
    const loose =
      /Job-Description\/([^/"']+)\/(\d+)\.aspx[^"'>\s]*["'][^>]*>([^<]{2,120})</gi;
    while ((m = loose.exec(html)) !== null) {
      const id = m[2];
      if (seen.has(id)) continue;
      seen.add(id);
      const title = stripHtml(m[3]);
      if (!title) continue;
      out.push({
        id,
        title,
        company: "Anonymous",
        postedAt: new Date().toISOString().slice(0, 10),
        href: absoluteJobUrl(
          `Job-Description/${m[1]}/${id}.aspx`,
          id,
          m[1]
        ),
      });
    }
  }

  return out;
}

function mapSector(title: string, categoryHint?: string): Sector {
  const blob = `${title} ${categoryHint || ""}`;
  if (/酒店|hotel|resort|渡假|客房|前台|front\s*office|housekeeping|管家/i.test(blob))
    return "hospitality";
  if (
    /餐飲|f\s*[&＆]\s*b|fnb|restaurant|廚|chef|barista|咖啡|food|beverage/i.test(
      blob
    )
  )
    return "fnb";
  if (/零售|retail|店務|銷售|sales|store|client advisor/i.test(blob))
    return "retail";
  if (/醫療|medical|health|護理|藥|pharma|診所|clinic|nurse/i.test(blob))
    return "big-health";
  if (
    /銀行|bank|金融|finance|會計|account|insurance|保險|treasury/i.test(blob)
  )
    return "finance";
  if (
    /it\b|資訊|科技|tech|軟件|software|engineering|工程|systems?\s*admin/i.test(
      blob
    )
  )
    return "tech";
  if (
    /會展|mice|文化|娛樂|gaming|博彩|casino|娛樂場|cinema|戲院/i.test(blob)
  )
    return "mice";
  if (
    /教育|education|學校|teacher|tutor|kindergarten|school|教學/i.test(blob)
  )
    return "education";
  return "other";
}

function mapLane(title: string): JobLane {
  if (/暑期|summer/i.test(title)) return "summer";
  if (/實習|intern|trainee|見習|management\s*trainee/i.test(title))
    return "internship";
  if (/兼職|part[\s-]?time|freelance|時薪|斜槓/i.test(title))
    return "part-time";
  return "full-time";
}

function youthSignals(title: string): {
  youthFriendly: boolean;
  minorAllowed: boolean;
} {
  const junior =
    /junior|基層|助理|見習|trainee|intern|學徒|兼職|part[\s-]?time|barista|服務員|店務|cashier|接待|assistant|clerk|文員/i.test(
      title
    );
  const senior =
    /manager|經理|director|總監|executive|高級|督導|supervisor|主任|senior|general\s*manager/i.test(
      title
    );
  const youthFriendly = junior || !senior;
  const minorAllowed =
    youthFriendly &&
    /兼職|part[\s-]?time|暑期|summer|barista|服務員|店務|cashier/i.test(
      title
    );
  return { youthFriendly, minorAllowed };
}

function splitCompany(name: string): { en: string; zh: string } {
  const cleaned = decodeHtmlEntities(name).replace(/\s+/g, " ").trim();
  if (!cleaned || /^anonymous$/i.test(cleaned)) {
    return { en: "Anonymous employer", zh: "匿名僱主" };
  }
  // Often "中文 English Name"
  const m = cleaned.match(
    /^([\u4e00-\u9fff\u3400-\u4dbf\s·．.、（）()]+)\s+([A-Za-z].+)$/
  );
  if (m) {
    return { zh: m[1].trim(), en: m[2].trim() };
  }
  return { en: cleaned, zh: cleaned };
}

function mapRawToPosting(raw: RawHelloJob): JobPosting {
  const company = splitCompany(raw.company);
  const sector = mapSector(raw.title, raw.categoryHint);
  const lane = mapLane(raw.title);
  const { youthFriendly, minorAllowed } = youthSignals(raw.title);
  const title = raw.title;

  const description = [
    `${title} at ${company.en}.`,
    `Listed on Hello-Jobs.com — apply on the original job page.`,
    raw.categoryHint ? `Category: ${raw.categoryHint}` : "",
  ]
    .filter(Boolean)
    .join("\n\n");

  const descriptionZh = [
    `${company.zh} — ${title}`,
    `來源：Hello-Jobs.com，請於原網站申請。`,
    raw.categoryHint ? `類別：${raw.categoryHint}` : "",
  ]
    .filter(Boolean)
    .join("\n\n");

  return {
    id: `hellojobs-${raw.id}`,
    title,
    titleZh: title,
    company: company.en,
    companyZh: company.zh,
    sector,
    lane,
    district: "Macau",
    districtZh: "澳門",
    payMin: 0,
    payMax: 0,
    payUnit: "monthly",
    hoursPerWeek:
      lane === "part-time"
        ? "Part-time / flexible"
        : lane === "internship"
          ? "Internship schedule"
          : "Full-time schedule",
    languages: ["Cantonese", "Mandarin", "English"],
    description,
    descriptionZh,
    requirements: ["See Hello-Jobs listing for full requirements"],
    requirementsZh: ["詳情請參閱 Hello-Jobs 原職位頁"],
    skills: [],
    youthFriendly,
    minorAllowed,
    postedAt: raw.postedAt,
    openings: 1,
    trainingProvided: /培訓|訓練|training|trainee|見習/i.test(title),
    source: "hellojobs",
    companyType: raw.categoryHint,
    externalUrl: raw.href,
  };
}

async function mapPool<T, R>(
  items: T[],
  concurrency: number,
  fn: (item: T, index: number) => Promise<R>
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;
  async function worker() {
    while (next < items.length) {
      const i = next++;
      results[i] = await fn(items[i], i);
    }
  }
  const n = Math.min(concurrency, Math.max(1, items.length));
  await Promise.all(Array.from({ length: n }, () => worker()));
  return results;
}

/**
 * Live pull from hello-jobs.com / jobsearch (server-side).
 * Pages are newest-first; we walk pageNumber=1…N until maxJobs.
 */
export async function fetchHelloJobs(opts?: {
  maxPages?: number;
  maxJobs?: number;
}): Promise<HelloJobsFetchResult> {
  const maxPages = opts?.maxPages ?? DEFAULT_MAX_PAGES;
  const maxJobs = opts?.maxJobs ?? DEFAULT_MAX_JOBS;

  // Always fetch page 1 first (total count + newest jobs)
  const page1Html = await fetchText(listUrl(1));
  const totalOnBoard = parseTotalOnBoard(page1Html);
  const page1Jobs = parseHelloJobsListHtml(page1Html);

  const byId = new Map<string, RawHelloJob>();
  for (const j of page1Jobs) {
    if (byId.size >= maxJobs) break;
    byId.set(j.id, j);
  }

  // Remaining pages 2…maxPages in parallel batches
  const remainingPages: number[] = [];
  for (let p = 2; p <= maxPages && byId.size < maxJobs; p++) {
    remainingPages.push(p);
  }

  // How many pages we still need (estimate 15/page)
  const stillNeed = maxJobs - byId.size;
  const pagesNeeded = Math.min(
    remainingPages.length,
    Math.ceil(stillNeed / 12) + 2 // small buffer for sparse pages
  );
  const pagesToFetch = remainingPages.slice(0, pagesNeeded);

  let pagesFetched = 1;
  if (pagesToFetch.length > 0) {
    const batches: number[][] = [];
    for (let i = 0; i < pagesToFetch.length; i += PAGE_CONCURRENCY) {
      batches.push(pagesToFetch.slice(i, i + PAGE_CONCURRENCY));
    }

    for (const batch of batches) {
      if (byId.size >= maxJobs) break;
      const htmls = await mapPool(batch, PAGE_CONCURRENCY, async (pageNum) => {
        try {
          return await fetchText(listUrl(pageNum));
        } catch {
          return "";
        }
      });
      pagesFetched += batch.length;
      for (const html of htmls) {
        if (!html) continue;
        for (const j of parseHelloJobsListHtml(html)) {
          if (byId.has(j.id)) continue;
          byId.set(j.id, j);
          if (byId.size >= maxJobs) break;
        }
        if (byId.size >= maxJobs) break;
      }
    }
  }

  // Preserve discovery order: page 1 first, then remaining by id insertion order
  const ordered: RawHelloJob[] = [];
  const used = new Set<string>();
  for (const j of page1Jobs) {
    if (!byId.has(j.id) || used.has(j.id)) continue;
    used.add(j.id);
    ordered.push(j);
    if (ordered.length >= maxJobs) break;
  }
  if (ordered.length < maxJobs) {
    for (const j of byId.values()) {
      if (used.has(j.id)) continue;
      used.add(j.id);
      ordered.push(j);
      if (ordered.length >= maxJobs) break;
    }
  }

  const jobs = ordered.slice(0, maxJobs).map(mapRawToPosting);

  return {
    jobs,
    pagesFetched,
    totalOnBoard,
    fetchedAt: new Date().toISOString(),
  };
}
