import type { JobLane, JobPosting, Sector } from "./types";

/** Official DSAL online job-matching service (public browser API). */
export const DSAL_API_BASE =
  "https://www.dsal.gov.mo/jobseeking/service/DeJobSeekApi";

export const DSAL_PORTAL_URL =
  "https://www.dsal.gov.mo/jobseeking/app/?language=zh-Hant#";

/** Youth-relevant occupation groups on DSAL local vacancy catalog */
export const DSAL_YOUTH_CATEGORY_GROUPS = [
  "14", // hotel ops
  "9", // retail
  "10", // F&B
  "5", // customer service / reception
  "4", // clerical
  "13", // applied tech / design
  "1", // beauty / personal care
] as const;

export interface DsalRawJob {
  jobOfferId: string;
  jobOfferNo?: string;
  companyType?: string;
  jobOfferTitle?: string;
  salary?: string;
  companyName?: string;
  education?: string;
  experienceSkill?: string;
  workingArea?: string;
  workingTime?: string;
  jobDescription?: string;
  email?: string;
  telNum?: string;
  contactDescription?: string;
  isValid?: number;
  needCv?: number;
  eventId?: string | null;
  hashTag?: string | null;
}

export interface DsalCatalogCategory {
  id: string;
  nameCn: string;
  namePt?: string;
  nameEn?: string;
  metaDatas?: { keyCn: string; value: number }[];
  subCategories?: {
    id: string;
    groupId?: string;
    nameCn: string;
    metaDatas?: { keyCn: string; value: number }[];
  }[];
}

function stripHtml(s: string) {
  return s.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

function parseSalary(salary?: string): {
  payMin: number;
  payMax: number;
  payUnit: "hourly" | "monthly";
} {
  if (!salary) return { payMin: 0, payMax: 0, payUnit: "monthly" };
  const raw = salary.replace(/,/g, "").replace(/，/g, "");
  const hourly = /時|小時|hour|hr/i.test(raw);
  const nums = [...raw.matchAll(/\$?\s*(\d+(?:\.\d+)?)/g)].map((m) =>
    Number(m[1])
  );
  if (nums.length === 0)
    return { payMin: 0, payMax: 0, payUnit: hourly ? "hourly" : "monthly" };
  if (nums.length === 1) {
    return {
      payMin: nums[0],
      payMax: nums[0],
      payUnit: hourly ? "hourly" : "monthly",
    };
  }
  return {
    payMin: Math.min(nums[0], nums[1]),
    payMax: Math.max(nums[0], nums[1]),
    payUnit: hourly ? "hourly" : "monthly",
  };
}

function mapSector(companyType?: string, title?: string): Sector {
  const t = `${companyType || ""} ${title || ""}`;
  if (/酒店|旅遊|渡假|resort|hotel/i.test(t)) return "hospitality";
  if (/零售|銷售|市場|店|超市|retail/i.test(t)) return "retail";
  if (/餐飲|餐廳|廚|酒吧|飲食|fnb|food/i.test(t)) return "fnb";
  if (/醫療|衛生|護理|診所|健康|health|醫院/i.test(t)) return "big-health";
  if (/銀行|金融|保險|會計|finance|bank/i.test(t)) return "finance";
  if (/電腦|資訊|科技|IT|軟件|數碼|技術員/i.test(t)) return "tech";
  if (/會展|活動|文化|體育|娛樂/i.test(t)) return "mice";
  if (/教育|教學|學校|tutor/i.test(t)) return "education";
  return "other";
}

function mapLane(title?: string, workingTime?: string, salary?: string): JobLane {
  const t = `${title || ""} ${workingTime || ""} ${salary || ""}`;
  if (/暑期|summer/i.test(t)) return "summer";
  if (/實習|intern/i.test(t)) return "internship";
  if (/兼職|part[\s-]?time|時薪|每小時/i.test(t)) return "part-time";
  return "full-time";
}

function mapDistrict(area?: string): { district: string; districtZh: string } {
  const a = area || "澳門";
  if (/氹仔|Taipa/i.test(a)) return { district: "Taipa", districtZh: "氹仔" };
  if (/路氹|Cotai/i.test(a)) return { district: "Cotai", districtZh: "路氹" };
  if (/路環|Coloane/i.test(a)) return { district: "Coloane", districtZh: "路環" };
  if (/半島|Macau Peninsula/i.test(a))
    return { district: "Macau Peninsula", districtZh: "澳門半島" };
  return { district: "Macau", districtZh: a.includes("澳門") ? a : "澳門" };
}

function extractLanguages(text: string): string[] {
  const langs: string[] = [];
  if (/廣東話|粵語|Cantonese/i.test(text)) langs.push("Cantonese");
  if (/普通話|國語|Mandarin|Putonghua/i.test(text)) langs.push("Mandarin");
  if (/英語|English/i.test(text)) langs.push("English");
  if (/葡語|Portuguese/i.test(text)) langs.push("Portuguese");
  return langs.length ? langs : ["Cantonese"];
}

function extractSkills(text: string): string[] {
  const skills: string[] = [];
  const lower = text.toLowerCase();
  const rules: [RegExp, string][] = [
    [/customer|接待|客戶|服務|銷售|銷售員/, "customer-service"],
    [/team|團隊|合作/, "teamwork"],
    [/office|microsoft|excel|word|電腦|文書/, "computers"],
    [/english|英語/, "english"],
    [/mandarin|普通話/, "mandarin"],
    [/cantonese|廣東話/, "cantonese"],
    [/廚|餐飲|餐廳|fnb/, "fnb"],
    [/酒店|房務|管家/, "hospitality"],
    [/銷售|retail|零售/, "sales"],
    [/it|電腦技術|網絡|資訊/, "it-support"],
    [/會計|finance|金融/, "finance"],
    [/設計|design|美工/, "design"],
  ];
  for (const [re, skill] of rules) {
    if (re.test(text) || re.test(lower)) skills.push(skill);
  }
  return [...new Set(skills)].slice(0, 8);
}

function youthSignals(title?: string, education?: string, experience?: string) {
  const t = `${title || ""} ${education || ""} ${experience || ""}`;
  const junior =
    /助理|學徒|見習|初級|junior|trainee|intern|無經驗|經驗優先|歡迎應屆|畢業生|中學|高中|小學/i.test(
      t
    );
  const heavyExp = /(\d{2,})\s*年|10年|8年|5年或以上|管理經驗|督導/i.test(t);
  const youthFriendly = junior || !heavyExp;
  const minorAllowed =
    youthFriendly &&
    !/年滿\s*18|18歲|必須成年|成人|駕照|危險|高空|化學品監督/i.test(t) &&
    /助理|服務員|銷售|收銀|接待|文員|學徒|見習|兼職|暑期/i.test(t);
  return { youthFriendly, minorAllowed: !!minorAllowed };
}

/**
 * Map one DSAL vacancy record into MYEIB JobPosting shape.
 */
export function mapDsalJobToPosting(raw: DsalRawJob): JobPosting {
  const title = stripHtml(raw.jobOfferTitle || "職位空缺");
  const company = stripHtml(raw.companyName || "僱主（勞工局登記）");
  const desc = stripHtml(raw.jobDescription || "");
  const education = stripHtml(raw.education || "");
  const experience = stripHtml(raw.experienceSkill || "");
  const workingTime = stripHtml(raw.workingTime || "");
  const blob = `${title} ${education} ${experience} ${desc}`;
  const { payMin, payMax, payUnit } = parseSalary(raw.salary);
  const { district, districtZh } = mapDistrict(raw.workingArea);
  const { youthFriendly, minorAllowed } = youthSignals(
    title,
    education,
    experience
  );
  const sector = mapSector(raw.companyType, title);
  const lane = mapLane(title, workingTime, raw.salary);
  const requirements = [education, experience].filter(Boolean);
  const contactBits = [
    raw.contactDescription,
    raw.telNum ? `Tel: ${raw.telNum}` : "",
    raw.email ? `Email: ${raw.email}` : "",
  ]
    .filter(Boolean)
    .join(" ");

  const descriptionZh = [
    desc,
    workingTime ? `工作時間：${workingTime}` : "",
    contactBits ? `聯絡：${contactBits}` : "",
    raw.jobOfferNo ? `空缺編號：${raw.jobOfferNo}` : "",
  ]
    .filter(Boolean)
    .join("\n\n");

  const description = [
    desc,
    workingTime ? `Working hours: ${workingTime}` : "",
    contactBits ? `Contact: ${contactBits}` : "",
    raw.jobOfferNo ? `Vacancy no.: ${raw.jobOfferNo}` : "",
    "Source: Labour Affairs Bureau (DSAL) local vacancy register.",
  ]
    .filter(Boolean)
    .join("\n\n");

  return {
    id: `dsal-${raw.jobOfferId.replace(/\|/g, "-")}`,
    title,
    titleZh: title,
    company,
    companyZh: company,
    sector,
    lane,
    district,
    districtZh,
    payMin,
    payMax,
    payUnit,
    hoursPerWeek:
      workingTime || (payUnit === "hourly" ? "Variable" : "Full-time schedule"),
    languages: extractLanguages(blob),
    description,
    descriptionZh,
    requirements: requirements.length
      ? requirements
      : ["See official DSAL listing"],
    requirementsZh: requirements.length
      ? requirements
      : ["詳見勞工局官方空缺"],
    skills: extractSkills(blob),
    youthFriendly,
    minorAllowed,
    postedAt: new Date().toISOString().slice(0, 10),
    openings: 1,
    trainingProvided: /培訓|訓練|training/i.test(blob),
    source: "dsal",
    officialNo: raw.jobOfferNo,
    companyType: raw.companyType,
    contact: contactBits || undefined,
    externalUrl: DSAL_PORTAL_URL,
    salaryRaw: raw.salary,
  };
}

/** Per-request timeout so one slow DSAL call cannot stall the whole refresh. */
const DSAL_FETCH_TIMEOUT_MS = 8_000;

export async function dsalFetchJson<T>(
  path: string,
  params?: Record<string, string | number | undefined>
): Promise<T> {
  const url = new URL(`${DSAL_API_BASE}${path}`);
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      if (v !== undefined && v !== "") url.searchParams.set(k, String(v));
    }
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), DSAL_FETCH_TIMEOUT_MS);

  try {
    const res = await fetch(url.toString(), {
      headers: {
        Accept: "application/json",
        "User-Agent": "MYEIB-MacauYouthEmploymentBridge/1.0 (research pilot)",
      },
      cache: "no-store",
      signal: controller.signal,
    });

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(`DSAL API ${res.status}: ${text.slice(0, 200)}`);
    }
    return res.json() as Promise<T>;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Run async tasks with a concurrency limit (faster than sequential, safer than all-at-once).
 */
export async function mapPool<T, R>(
  items: T[],
  concurrency: number,
  worker: (item: T, index: number) => Promise<R>
): Promise<R[]> {
  if (items.length === 0) return [];
  const results = new Array<R>(items.length);
  let next = 0;

  async function run() {
    while (next < items.length) {
      const i = next++;
      results[i] = await worker(items[i], i);
    }
  }

  const n = Math.min(concurrency, items.length);
  await Promise.all(Array.from({ length: n }, () => run()));
  return results;
}
