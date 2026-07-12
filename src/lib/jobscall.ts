import type { JobLane, JobPosting, Sector } from "./types";

/** Commercial Macau job aggregator (Squarespace blog of employer pages). */
export const JOBSCALL_BASE = "https://www.jobscall.me";
export const JOBSCALL_COLLECTION_JSON = `${JOBSCALL_BASE}/job?format=json`;

const FETCH_TIMEOUT_MS = 15_000;
/** 20 companies/page → 10 pages ≈ 200 employers */
const DEFAULT_MAX_PAGES = 10;
const MAX_ROLES_PER_COMPANY = 6;
/** First pass: take this many roles per employer so large casinos don’t crowd out SMEs */
const FAIR_ROLES_PER_COMPANY = 3;
const DEFAULT_MAX_JOBS = 400;

export interface JobscallCollectionItem {
  id: string;
  title?: string;
  urlId?: string;
  fullUrl?: string;
  body?: string;
  tags?: string[];
  categories?: string[];
  publishOn?: number;
  addedOn?: number;
  updatedOn?: number;
  excerpt?: string;
}

interface JobscallPagination {
  nextPage?: boolean;
  nextPageOffset?: number;
  pageSize?: number;
}

interface JobscallCollectionResponse {
  items?: JobscallCollectionItem[];
  pagination?: JobscallPagination;
}

function stripHtml(s: string): string {
  return s
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&quot;/gi, '"')
    .replace(/\s+/g, " ")
    .trim();
}

async function fetchJson<T>(url: string): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      headers: {
        Accept: "application/json",
        "User-Agent": "MYEIB-MacauYouthEmploymentBridge/1.0 (research pilot)",
      },
      cache: "no-store",
      signal: controller.signal,
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(`Jobscall ${res.status}: ${text.slice(0, 160)}`);
    }
    return res.json() as Promise<T>;
  } finally {
    clearTimeout(timer);
  }
}

/** Fetch employer collection pages (Squarespace blog JSON). */
export async function fetchJobscallCollectionPages(
  maxPages = DEFAULT_MAX_PAGES
): Promise<JobscallCollectionItem[]> {
  const out: JobscallCollectionItem[] = [];
  let offset: number | undefined;
  const seen = new Set<string>();

  for (let page = 0; page < maxPages; page++) {
    const url =
      offset === undefined
        ? JOBSCALL_COLLECTION_JSON
        : `${JOBSCALL_COLLECTION_JSON}&offset=${offset}`;
    const data = await fetchJson<JobscallCollectionResponse>(url);
    const items = data.items || [];
    for (const item of items) {
      if (!item?.id || seen.has(item.id)) continue;
      seen.add(item.id);
      out.push(item);
    }
    const pag = data.pagination;
    if (!pag?.nextPage || pag.nextPageOffset == null) break;
    offset = pag.nextPageOffset;
  }

  return out;
}

const ROLE_NOISE =
  /^(申請|福利|關於|about|application|工作地點|requirements?|responsibilities|our benefit|apply now|contact|聯絡|如何申請|薪酬|福利待遇|注意|note|disclaimer|terms)/i;

const DEPT_ONLY =
  /^(human resources|food\s*&\s*beverage|front office|finance|engineering|operations?|marketing|security|it|hr)\s*(人力|餐飲|前廳|財務|工程|營運|市場|保安|資訊)?$/i;

function extractRolesFromBody(body?: string): string[] {
  if (!body) return [];
  const h1s = [...body.matchAll(/<h1[^>]*>([\s\S]*?)<\/h1>/gi)].map((m) =>
    stripHtml(m[1])
  );
  const roles: string[] = [];
  const seen = new Set<string>();

  for (const raw of h1s) {
    const title = raw.replace(/\s+/g, " ").trim();
    if (!title || title.length < 2 || title.length > 120) continue;
    if (ROLE_NOISE.test(title)) continue;
    if (DEPT_ONLY.test(title)) continue;
    // Event / recruitment-day noise
    if (/招聘日|career\s*day|job\s*fair|招聘會/i.test(title)) continue;
    const key = title.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    roles.push(title);
    if (roles.length >= MAX_ROLES_PER_COMPANY) break;
  }
  return roles;
}

function cleanCompanyName(title?: string): { en: string; zh: string } {
  const t = (title || "Employer").replace(/\s+/g, " ").trim();
  // Strip common trailing recruitment slogans
  const cleaned = t
    .replace(/澳門招聘\s*$/u, "")
    .replace(/招聘\s*$/u, "")
    .replace(/\s*Macau\s+Recruitment\s*$/i, "")
    .trim();
  return { en: cleaned || t, zh: cleaned || t };
}

function parseSalaryFromCategories(categories: string[] = []): {
  payMin: number;
  payMax: number;
  payUnit: "hourly" | "monthly";
  salaryRaw?: string;
} {
  // Prefer lowest band present as a youth-relevant range
  const bands: { min: number; max: number; raw: string }[] = [];
  for (const c of categories) {
    const m = c.match(/\$?\s*(\d+)\s*k\s*[-–~to]+\s*\$?\s*(\d+)\s*k/i);
    if (m) {
      bands.push({
        min: Number(m[1]) * 1000,
        max: Number(m[2]) * 1000,
        raw: c,
      });
    }
  }
  if (bands.length === 0) {
    return { payMin: 0, payMax: 0, payUnit: "monthly" };
  }
  bands.sort((a, b) => a.min - b.min);
  const band = bands[0];
  return {
    payMin: band.min,
    payMax: band.max,
    payUnit: "monthly",
    salaryRaw: band.raw,
  };
}

function mapSector(categories: string[], tags: string[], title: string): Sector {
  const blob = `${categories.join(" ")} ${tags.join(" ")} ${title}`;
  if (/酒店|hotel|resort|渡假|客房|前台|front\s*office/i.test(blob))
    return "hospitality";
  if (/餐飲|f\s*[&＆]\s*b|fnb|restaurant|廚|chef|barista|咖啡|mcdonald|starbucks/i.test(blob))
    return "fnb";
  if (/零售|retail|店務|銷售|sales/i.test(blob)) return "retail";
  if (/醫療|medical|health|護理|藥|pharma|診所/i.test(blob)) return "big-health";
  if (/銀行|bank|金融|finance|會計|account/i.test(blob)) return "finance";
  if (/it\b|資訊|科技|tech|軟件|software|engineering|工程/i.test(blob))
    return "tech";
  if (/會展|mice|文化|娛樂|gaming|博彩|cinema|戲院/i.test(blob)) return "mice";
  if (/教育|education|學校|tutor/i.test(blob)) return "education";
  return "other";
}

function mapLane(title: string, categories: string[], tags: string[]): JobLane {
  // Prefer role title — company pages often mix 兼職 / full-time categories
  if (/暑期|summer/i.test(title)) return "summer";
  if (/實習|intern|trainee|見習/i.test(title)) return "internship";
  if (/兼職|part[\s-]?time|freelance|時薪|斜槓/i.test(title)) return "part-time";
  // Only use tags/categories when title is silent (and not mixed-band noise)
  const aux = `${tags.join(" ")}`;
  if (/intern\s*&\s*trainee|實習及見習/i.test(aux) && !/manager|經理/i.test(title))
    return "internship";
  return "full-time";
}

function mapDistrict(text: string): { district: string; districtZh: string } {
  if (/氹仔|Taipa/i.test(text)) return { district: "Taipa", districtZh: "氹仔" };
  if (/路氹|Cotai/i.test(text)) return { district: "Cotai", districtZh: "路氹" };
  if (/路環|Coloane/i.test(text))
    return { district: "Coloane", districtZh: "路環" };
  if (/半島|Peninsula/i.test(text))
    return { district: "Macau Peninsula", districtZh: "澳門半島" };
  return { district: "Macau", districtZh: "澳門" };
}

function extractLanguages(text: string): string[] {
  const langs: string[] = [];
  if (/廣東話|粵語|Cantonese/i.test(text)) langs.push("Cantonese");
  if (/普通話|國語|Mandarin|Putonghua/i.test(text)) langs.push("Mandarin");
  if (/英語|English/i.test(text)) langs.push("English");
  if (/葡語|Portuguese/i.test(text)) langs.push("Portuguese");
  return langs.length ? langs : ["Cantonese", "Mandarin"];
}

function extractSkills(text: string): string[] {
  const skills: string[] = [];
  const rules: [RegExp, string][] = [
    [/customer|接待|客戶|服務|銷售/, "customer-service"],
    [/team|團隊/, "teamwork"],
    [/office|excel|word|文書|行政/, "computers"],
    [/english|英語/, "english"],
    [/mandarin|普通話/, "mandarin"],
    [/cantonese|廣東話/, "cantonese"],
    [/廚|餐飲|fnb|barista|咖啡/, "fnb"],
    [/酒店|房務|管家|hotel/, "hospitality"],
    [/銷售|retail|零售/, "sales"],
    [/it|電腦|網絡|資訊|軟件/, "it-support"],
    [/會計|finance|金融/, "finance"],
    [/設計|design/, "design"],
  ];
  const lower = text.toLowerCase();
  for (const [re, skill] of rules) {
    if (re.test(text) || re.test(lower)) skills.push(skill);
  }
  return [...new Set(skills)].slice(0, 8);
}

function youthSignals(title: string, tags: string[]): {
  youthFriendly: boolean;
  minorAllowed: boolean;
} {
  const blob = `${title} ${tags.join(" ")}`;
  const junior =
    /junior|基層|助理|見習|trainee|intern|學徒|兼職|part[\s-]?time|barista|服務員|店務|cashier|接待/i.test(
      blob
    );
  const senior =
    /manager|經理|director|總監|executive|高級|督導|supervisor|主任|10\+|senior/i.test(
      blob
    );
  const youthFriendly = junior || !senior;
  const minorAllowed =
    youthFriendly &&
    /兼職|part[\s-]?time|暑期|summer|barista|服務員|店務|cashier/i.test(blob) &&
    !/18歲|年滿\s*18|must be 18|adult/i.test(blob);
  return { youthFriendly, minorAllowed };
}

function postedDate(item: JobscallCollectionItem): string {
  const ms = item.updatedOn || item.publishOn || item.addedOn;
  if (!ms) return new Date().toISOString().slice(0, 10);
  try {
    return new Date(ms).toISOString().slice(0, 10);
  } catch {
    return new Date().toISOString().slice(0, 10);
  }
}

function slugify(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9\u4e00-\u9fff]+/gi, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
}

function excerptFromBody(body?: string, max = 320): string {
  if (!body) return "";
  const plain = stripHtml(body);
  if (plain.length <= max) return plain;
  return plain.slice(0, max).trim() + "…";
}

/**
 * Map one Jobscall employer post into one or more MYEIB JobPosting rows
 * (one per role title found in the page body).
 */
export function mapJobscallItemToPostings(
  item: JobscallCollectionItem
): JobPosting[] {
  const company = cleanCompanyName(item.title);
  const path = item.fullUrl || (item.urlId ? `/job/${item.urlId}` : "/job");
  const externalUrl = path.startsWith("http")
    ? path
    : `${JOBSCALL_BASE}${path.startsWith("/") ? "" : "/"}${path}`;
  const tags = item.tags || [];
  const categories = item.categories || [];
  const bodyPlain = stripHtml(item.body || "");
  const roles = extractRolesFromBody(item.body);
  const salary = parseSalaryFromCategories(categories);
  const postedAt = postedDate(item);
  const companyBlob = `${item.title || ""} ${tags.join(" ")} ${categories.join(" ")}`;

  const makeOne = (roleTitle: string, index: number): JobPosting => {
    const sector = mapSector(categories, tags, roleTitle);
    const lane = mapLane(roleTitle, categories, tags);
    const { district, districtZh } = mapDistrict(`${roleTitle} ${bodyPlain}`);
    const { youthFriendly, minorAllowed } = youthSignals(roleTitle, tags);
    const blob = `${roleTitle} ${companyBlob} ${bodyPlain.slice(0, 800)}`;
    const excerpt = excerptFromBody(item.body, 280);
    const idBase = item.urlId || item.id || "employer";
    const roleSlug = slugify(roleTitle) || `role-${index}`;

    const description = [
      excerpt || `${roleTitle} at ${company.en}.`,
      `Employer page on Jobscall.me — apply via the original listing.`,
      tags.length ? `Tags: ${tags.slice(0, 8).join(", ")}` : "",
    ]
      .filter(Boolean)
      .join("\n\n");

    const descriptionZh = [
      excerpt || `${company.zh} — ${roleTitle}`,
      `來源：Jobscall.me 僱主招聘頁，請於原網站申請。`,
      tags.length ? `標籤：${tags.slice(0, 8).join("、")}` : "",
    ]
      .filter(Boolean)
      .join("\n\n");

    return {
      id: `jobscall-${idBase}-${roleSlug}-${index}`,
      title: roleTitle,
      titleZh: roleTitle,
      company: company.en,
      companyZh: company.zh,
      sector,
      lane,
      district,
      districtZh,
      payMin: salary.payMin,
      payMax: salary.payMax,
      payUnit: salary.payUnit,
      hoursPerWeek:
        lane === "part-time"
          ? "Part-time / flexible"
          : lane === "internship"
            ? "Internship schedule"
            : "Full-time schedule",
      languages: extractLanguages(blob),
      description,
      descriptionZh,
      requirements: ["See Jobscall.me employer page for full requirements"],
      requirementsZh: ["詳情請參閱 Jobscall.me 僱主招聘頁"],
      skills: extractSkills(blob),
      youthFriendly,
      minorAllowed,
      postedAt,
      openings: 1,
      trainingProvided: /培訓|訓練|training|trainee|見習/i.test(blob),
      source: "jobscall",
      companyType: categories.find((c) => !/^\$|\d+k|JSCM|M0\d/i.test(c)),
      externalUrl,
      salaryRaw: salary.salaryRaw,
    };
  };

  if (roles.length === 0) {
    // Image-only or unstructured employer page → single company listing
    const fallbackTitle =
      stripHtml(item.excerpt || "") ||
      `${company.en} — open roles / 多個職位`;
    return [makeOne(fallbackTitle.slice(0, 100), 0)];
  }

  return roles.map((role, i) => makeOne(role, i));
}

export interface JobscallFetchResult {
  jobs: JobPosting[];
  companies: number;
  fetchedAt: string;
}

/**
 * Live pull from jobscall.me (server-side). Caps pages and total jobs for latency.
 * Two-pass selection: first a fair share per employer, then fill remaining slots.
 */
export async function fetchJobscallJobs(opts?: {
  maxPages?: number;
  maxJobs?: number;
}): Promise<JobscallFetchResult> {
  const maxPages = opts?.maxPages ?? DEFAULT_MAX_PAGES;
  const maxJobs = opts?.maxJobs ?? DEFAULT_MAX_JOBS;

  const items = await fetchJobscallCollectionPages(maxPages);
  const perCompany = items.map((item) => mapJobscallItemToPostings(item));
  const jobs: JobPosting[] = [];
  const seenIds = new Set<string>();

  const push = (job: JobPosting) => {
    if (jobs.length >= maxJobs) return false;
    if (seenIds.has(job.id)) return true;
    seenIds.add(job.id);
    jobs.push(job);
    return jobs.length < maxJobs;
  };

  // Pass 1 — diversity across employers
  for (const mapped of perCompany) {
    for (const job of mapped.slice(0, FAIR_ROLES_PER_COMPANY)) {
      if (!push(job)) {
        return {
          jobs,
          companies: items.length,
          fetchedAt: new Date().toISOString(),
        };
      }
    }
  }

  // Pass 2 — fill remaining capacity with extra roles
  if (jobs.length < maxJobs) {
    for (const mapped of perCompany) {
      for (const job of mapped.slice(FAIR_ROLES_PER_COMPANY)) {
        if (!push(job)) break;
      }
      if (jobs.length >= maxJobs) break;
    }
  }

  return {
    jobs,
    companies: items.length,
    fetchedAt: new Date().toISOString(),
  };
}
