import type { JobPosting, YouthProfile } from "./types";
import type { CvFeatures } from "./cv-extract";
import {
  assessCredentialFit,
  isLanguageOrSoftSkill,
  type CredentialAssessment,
} from "./professional-credentials";

/**
 * Profession / occupation domain alignment + regulated credential gates.
 * Prevents high scores when a candidate's field (e.g. Statistics PhD)
 * has little to do with the job's craft (e.g. Tea Master, barista),
 * or when licensed roles (doctor, therapist) lack matching qualifications.
 */

export type ProfessionDomain =
  | "academic_research"
  | "data_stats_quant"
  | "software_it"
  | "finance_accounting"
  | "healthcare"
  | "education_teaching"
  | "hospitality_hotel"
  | "fnb_culinary"
  | "retail_sales"
  | "admin_clerical"
  | "creative_media"
  | "engineering_trades"
  | "security_ops"
  | "general_entry"
  | "unknown";

export interface ProfessionFitResult {
  seekerDomains: ProfessionDomain[];
  jobDomains: ProfessionDomain[];
  /** Combined domain + credential adjustment applied to match score */
  scoreDelta: number;
  compatible: boolean;
  /** True when domains clearly clash (PhD stats vs tea master) */
  hardMismatch: boolean;
  /** True when job requires a licence/registration not evidenced on CV */
  credentialBlock: boolean;
  credentials?: CredentialAssessment;
  reasonsEn: string[];
  reasonsZh: string[];
}

const DOMAIN_PATTERNS: {
  domain: ProfessionDomain;
  re: RegExp;
  weight: number;
}[] = [
  {
    domain: "academic_research",
    re: /professor|lecturer|faculty|research|論文|研究|學術|博士後|postdoc|tenure|journal|publication|curriculum|course\s*design|實驗室|lab\s*scient/i,
    weight: 3,
  },
  {
    domain: "data_stats_quant",
    re: /statistic|統計|data\s*scien|數據科學|machine\s*learning|機器學習|econometric|計量|quantitative|quant|actuary|精算|biostat|r\s*studio|spss|stata|regression|時間序列|time\s*series|probability|概率/i,
    weight: 3,
  },
  {
    domain: "software_it",
    re: /\b(software|developer|programmer|工程師|資訊科技|information\s*tech|full[\s-]?stack|backend|frontend|devops|cyber|網絡|系統管理|it\s*support|java|python|react|雲端|cloud)\b/i,
    weight: 2,
  },
  {
    domain: "finance_accounting",
    re: /account|會計|audit|審計|bank|銀行|financ|金融|treasury|投資|investment|cpa|bookkeep|出納|teller|櫃員/i,
    weight: 2,
  },
  {
    domain: "healthcare",
    re: /nurse|護理|clinic|診所|medical|醫療|doctor|醫師|pharmacy|藥|therap|治療|dental|牙科|patient|病人/i,
    weight: 2,
  },
  {
    domain: "education_teaching",
    re: /teacher|tutor|教學|教師|導師|kindergarten|幼稚園|school|中學|小學|curriculum|補習|instructor|講師(?!\s*教授)/i,
    weight: 2,
  },
  {
    domain: "hospitality_hotel",
    re: /hotel|酒店|resort|渡假|front\s*desk|前台|guest\s*relation|賓客|concierge|禮賓|housekeep|房務|butler|管家|receptionist|接待員/i,
    weight: 2,
  },
  {
    domain: "fnb_culinary",
    re: /barista|咖啡|tea\s*master|茶藝|茶師|chef|廚|cook|廚房|waiter|waitress|服務員|餐飲|restaurant|餐廳|bartender|調酒|fnb|f\s*&\s*b|廚藝|烘焙|bakery|sushi|壽司|火鍋|kitchen/i,
    weight: 3,
  },
  {
    domain: "retail_sales",
    re: /retail|零售|sales\s*associate|銷售員|shop\s*assistant|店務|cashier|收銀|merchandis|promoter|推廣|專櫃|boutique/i,
    weight: 2,
  },
  {
    domain: "admin_clerical",
    re: /clerk|文員|secretary|秘書|admin|行政|office\s*assistant|office\s*admin|文書|reception(?!ist\s*hotel)/i,
    weight: 1,
  },
  {
    domain: "creative_media",
    re: /design|設計|graphic|創意|marketing|市場|media|媒體|content|內容|copywrit|video|攝影|brand/i,
    weight: 2,
  },
  {
    domain: "engineering_trades",
    re: /technician|技術員|mechanic|維修|electrician|電工|plumber|plumber|construction|建築|hvac|冷氣|engineer(?!ing\s*manager)/i,
    weight: 2,
  },
  {
    domain: "security_ops",
    re: /security|保安|guard|護衛|surveillance|監控/i,
    weight: 2,
  },
];

/** Pairs that are a hard professional mismatch (not entry-level pivot). */
const HARD_MISMATCH: [ProfessionDomain, ProfessionDomain][] = [
  ["academic_research", "fnb_culinary"],
  ["academic_research", "retail_sales"],
  ["academic_research", "security_ops"],
  ["data_stats_quant", "fnb_culinary"],
  ["data_stats_quant", "retail_sales"],
  ["data_stats_quant", "security_ops"],
  ["data_stats_quant", "hospitality_hotel"],
  ["software_it", "fnb_culinary"],
  ["software_it", "retail_sales"],
  ["finance_accounting", "fnb_culinary"],
  ["healthcare", "fnb_culinary"],
  ["healthcare", "retail_sales"],
  ["fnb_culinary", "academic_research"],
  ["fnb_culinary", "data_stats_quant"],
  ["retail_sales", "academic_research"],
  ["retail_sales", "data_stats_quant"],
];

/** Soft mismatch — reduce score but allow career change narrative */
const SOFT_MISMATCH: [ProfessionDomain, ProfessionDomain][] = [
  ["academic_research", "hospitality_hotel"],
  ["academic_research", "admin_clerical"],
  ["data_stats_quant", "admin_clerical"],
  ["software_it", "hospitality_hotel"],
  ["education_teaching", "fnb_culinary"],
  ["finance_accounting", "retail_sales"],
  ["creative_media", "fnb_culinary"],
];

function detectDomains(text: string): Map<ProfessionDomain, number> {
  const scores = new Map<ProfessionDomain, number>();
  for (const { domain, re, weight } of DOMAIN_PATTERNS) {
    const matches = text.match(new RegExp(re.source, "gi"));
    if (matches && matches.length > 0) {
      scores.set(
        domain,
        (scores.get(domain) || 0) + matches.length * weight
      );
    }
  }
  return scores;
}

function topDomains(
  scores: Map<ProfessionDomain, number>,
  minScore = 2
): ProfessionDomain[] {
  const ranked = [...scores.entries()]
    .filter(([, s]) => s >= minScore)
    .sort((a, b) => b[1] - a[1]);
  if (ranked.length === 0) {
    // weaker signal
    const weak = [...scores.entries()].sort((a, b) => b[1] - a[1]);
    if (weak[0] && weak[0][1] > 0) return [weak[0][0]];
    return ["unknown"];
  }
  return ranked.slice(0, 3).map(([d]) => d);
}

export function inferSeekerDomains(
  youth: YouthProfile,
  cv?: CvFeatures | null
): ProfessionDomain[] {
  const blob = [
    youth.bio || "",
    (Array.isArray(youth.skills) ? youth.skills : []).join(" "),
    ...(cv
      ? [
          cv.summary || "",
          cv.researchInterests || "",
          (cv.skills || []).join(" "),
          (cv.keywords || []).join(" "),
          (cv.educationHints || []).join(" "),
          cv.educationLevel || "",
          cv.careerStage || "",
        ]
      : []),
  ].join(" \n ");

  const scores = detectDomains(blob);

  // Education-level priors
  if (cv?.educationLevel === "phd" || /ph\.?\s*d|博士/i.test(blob)) {
    scores.set(
      "academic_research",
      (scores.get("academic_research") || 0) + 8
    );
  }
  if (
    cv?.educationLevel === "master" ||
    cv?.educationLevel === "phd" ||
    /統計|statistic|data\s*scien|數學|mathematics|econom/i.test(blob)
  ) {
    if (/統計|statistic|data|數據|quant|計量|精算|數學|math/i.test(blob)) {
      scores.set(
        "data_stats_quant",
        (scores.get("data_stats_quant") || 0) + 10
      );
    }
  }

  // Sector prefs as weak prior — NOT enough to claim licensed healthcare profession
  for (const s of youth.preferredSectors || []) {
    if (s === "tech")
      scores.set("software_it", (scores.get("software_it") || 0) + 2);
    if (s === "finance")
      scores.set(
        "finance_accounting",
        (scores.get("finance_accounting") || 0) + 2
      );
    if (s === "education")
      scores.set(
        "education_teaching",
        (scores.get("education_teaching") || 0) + 2
      );
    if (s === "hospitality")
      scores.set(
        "hospitality_hotel",
        (scores.get("hospitality_hotel") || 0) + 2
      );
    if (s === "fnb")
      scores.set("fnb_culinary", (scores.get("fnb_culinary") || 0) + 2);
    if (s === "retail")
      scores.set("retail_sales", (scores.get("retail_sales") || 0) + 2);
    // big-health interest alone must NOT mark seeker as healthcare professional
  }

  return topDomains(scores, 3);
}

export function inferJobDomains(job: JobPosting): ProfessionDomain[] {
  const blob = [
    job.title,
    job.titleZh,
    job.description,
    job.descriptionZh,
    (job.requirements || []).join(" "),
    (job.requirementsZh || []).join(" "),
    (job.skills || []).join(" "),
    job.sector,
    job.lane,
    job.companyType || "",
  ].join(" \n ");

  const scores = detectDomains(blob);

  // Sector prior for jobs
  if (job.sector === "fnb")
    scores.set("fnb_culinary", (scores.get("fnb_culinary") || 0) + 4);
  if (job.sector === "hospitality")
    scores.set(
      "hospitality_hotel",
      (scores.get("hospitality_hotel") || 0) + 4
    );
  if (job.sector === "retail")
    scores.set("retail_sales", (scores.get("retail_sales") || 0) + 4);
  if (job.sector === "finance")
    scores.set(
      "finance_accounting",
      (scores.get("finance_accounting") || 0) + 4
    );
  if (job.sector === "tech")
    scores.set("software_it", (scores.get("software_it") || 0) + 4);
  if (job.sector === "education")
    scores.set(
      "education_teaching",
      (scores.get("education_teaching") || 0) + 3
    );
  if (job.sector === "big-health")
    scores.set("healthcare", (scores.get("healthcare") || 0) + 4);

  return topDomains(scores, 2);
}

function pairMismatch(
  a: ProfessionDomain,
  b: ProfessionDomain,
  table: [ProfessionDomain, ProfessionDomain][]
): boolean {
  return table.some(
    ([x, y]) => (x === a && y === b) || (x === b && y === a)
  );
}

/**
 * Skill token overlap between seeker and job (normalized, meaningful tokens only).
 */
export function skillOverlapRatio(
  youth: YouthProfile,
  job: JobPosting,
  cv?: CvFeatures | null
): { ratio: number; shared: string[]; jobSkillCount: number } {
  const seekerSkills = new Set(
    [
      ...(Array.isArray(youth.skills) ? youth.skills : []),
      ...(cv?.skills || []),
      ...(cv?.keywords || []).slice(0, 20),
    ]
      .map((s) => String(s).toLowerCase().trim())
      .filter((s) => s.length >= 2 && !isLanguageOrSoftSkill(s))
  );

  const jobSkills = [
    ...(Array.isArray(job.skills) ? job.skills : []),
    ...tokenizeTitleSkills(
      `${job.title || ""} ${job.titleZh || ""}`
    ),
  ]
    .map((s) => String(s).toLowerCase().trim())
    .filter((s) => s.length >= 2 && !isLanguageOrSoftSkill(s));

  const uniqueJob = [...new Set(jobSkills)];
  const shared = uniqueJob.filter((s) => {
    if (seekerSkills.has(s)) return true;
    for (const sk of seekerSkills) {
      if (sk.includes(s) || s.includes(sk)) return true;
    }
    return false;
  });

  const ratio =
    uniqueJob.length === 0 ? 0 : shared.length / Math.max(uniqueJob.length, 1);

  return { ratio, shared, jobSkillCount: uniqueJob.length };
}

function tokenizeTitleSkills(title: string): string[] {
  return title
    .toLowerCase()
    .split(/[^a-z0-9\u4e00-\u9fff+#.]+/i)
    .filter((t) => t.length >= 3);
}

/**
 * Main profession-fit assessment used by Smart Match + AI context.
 * Includes regulated professional qualifications (doctor, therapist, etc.).
 */
export function assessProfessionFit(
  youth: YouthProfile,
  job: JobPosting,
  cv?: CvFeatures | null
): ProfessionFitResult {
  const seekerDomains = inferSeekerDomains(youth, cv);
  const jobDomains = inferJobDomains(job);
  const { ratio, shared, jobSkillCount } = skillOverlapRatio(youth, job, cv);
  const credentials = assessCredentialFit(youth, job, cv);

  const reasonsEn: string[] = [];
  const reasonsZh: string[] = [];
  let scoreDelta = 0;
  let hardMismatch = false;
  let credentialBlock = false;

  // ── Regulated credentials (highest priority gate) ──────────────
  scoreDelta += credentials.scoreDelta;
  credentialBlock = credentials.hardBlock;
  if (credentials.hardBlock) {
    hardMismatch = true;
    reasonsEn.push(...credentials.reasonsEn);
    reasonsZh.push(...credentials.reasonsZh);
  } else if (credentials.matched.length > 0) {
    reasonsEn.push(...credentials.reasonsEn);
    reasonsZh.push(...credentials.reasonsZh);
  }

  // Domain overlap — never treat as aligned when credential is missing for licensed roles
  const domainHits = seekerDomains.filter(
    (d) => d !== "unknown" && jobDomains.includes(d)
  );
  if (domainHits.length > 0 && !credentialBlock) {
    scoreDelta += 12 + domainHits.length * 6;
    reasonsEn.push(
      `Profession domain match: ${domainHits.join(", ")}`
    );
    reasonsZh.push(`職業領域吻合：${domainHits.join("、")}`);
  }

  // Hard / soft domain clash
  for (const sd of seekerDomains) {
    for (const jd of jobDomains) {
      if (sd === "unknown" || jd === "unknown") continue;
      if (pairMismatch(sd, jd, HARD_MISMATCH)) {
        hardMismatch = true;
        scoreDelta -= 42;
        reasonsEn.push(
          `Profession mismatch: your field (${sd}) is not aligned with this role (${jd}) — e.g. specialist academic/quant profiles rarely fit craft F&B roles`
        );
        reasonsZh.push(
          `職業錯配：你的領域（${domainLabelZh(sd)}）與本職（${domainLabelZh(jd)}）相關性很低——高專學歷背景通常不適配茶藝／餐飲技藝崗`
        );
      } else if (pairMismatch(sd, jd, SOFT_MISMATCH)) {
        scoreDelta -= 18;
        reasonsEn.push(
          `Weak profession link: ${sd} → ${jd} (career pivot would need clear motivation)`
        );
        reasonsZh.push(
          `職業關聯偏弱：${domainLabelZh(sd)} → ${domainLabelZh(jd)}（轉職需額外動機說明）`
        );
      }
    }
  }

  // Skills required: if job lists skills and none overlap, penalize
  if (jobSkillCount >= 2 && ratio === 0 && shared.length === 0) {
    scoreDelta -= 20;
    reasonsEn.push("No overlap with listed job skills / craft keywords");
    reasonsZh.push("與職位所列技能／工種關鍵詞無重疊");
  } else if (ratio >= 0.35 || shared.length >= 2) {
    scoreDelta += Math.min(18, Math.round(ratio * 25) + shared.length * 3);
    reasonsEn.push(`Skills aligned: ${shared.slice(0, 5).join(", ")}`);
    reasonsZh.push(`技能對齊：${shared.slice(0, 5).join("、")}`);
  } else if (jobSkillCount >= 1 && ratio < 0.15) {
    scoreDelta -= 10;
    reasonsEn.push("Low skill overlap with role requirements");
    reasonsZh.push("與職位技能要求重疊偏低");
  }

  // Overqualified service roles for advanced degrees
  const advanced =
    cv?.educationLevel === "phd" ||
    cv?.educationLevel === "master" ||
    cv?.careerStage === "professional" ||
    cv?.careerStage === "postgrad";
  const serviceCraft =
    jobDomains.includes("fnb_culinary") ||
    jobDomains.includes("retail_sales") ||
    (job.lane === "summer" &&
      (job.sector === "fnb" || job.sector === "retail"));

  if (advanced && serviceCraft && domainHits.length === 0) {
    hardMismatch = hardMismatch || cv?.educationLevel === "phd";
    scoreDelta -= cv?.educationLevel === "phd" ? 25 : 14;
    reasonsEn.push(
      "Advanced degree / professional CV is a poor profession fit for this entry service or craft role"
    );
    reasonsZh.push(
      "高學歷／專業履歷與此入門服務或技藝崗職業契合度低"
    );
  }

  // Cap delta (credential penalties already large)
  scoreDelta = Math.max(-70, Math.min(32, scoreDelta));

  const compatible = !hardMismatch && !credentialBlock && scoreDelta >= -12;

  if (
    !hardMismatch &&
    domainHits.length === 0 &&
    scoreDelta >= 0 &&
    seekerDomains[0] !== "unknown"
  ) {
    scoreDelta -= 6;
    reasonsEn.push("Profession domains only loosely related");
    reasonsZh.push("職業領域關聯有限");
  }

  return {
    seekerDomains,
    jobDomains,
    scoreDelta,
    compatible,
    hardMismatch,
    credentialBlock,
    credentials,
    reasonsEn: reasonsEn.slice(0, 4),
    reasonsZh: reasonsZh.slice(0, 4),
  };
}

function domainLabelZh(d: ProfessionDomain): string {
  const m: Record<ProfessionDomain, string> = {
    academic_research: "學術研究",
    data_stats_quant: "統計／數據／量化",
    software_it: "資訊科技",
    finance_accounting: "金融會計",
    healthcare: "醫療健康",
    education_teaching: "教學教育",
    hospitality_hotel: "酒店旅遊",
    fnb_culinary: "餐飲／茶藝廚藝",
    retail_sales: "零售銷售",
    admin_clerical: "文職行政",
    creative_media: "創意媒體",
    engineering_trades: "工程技工",
    security_ops: "保安營運",
    general_entry: "一般入門",
    unknown: "未分類",
  };
  return m[d] || d;
}

export function domainLabelEn(d: ProfessionDomain): string {
  return d.replace(/_/g, " ");
}
