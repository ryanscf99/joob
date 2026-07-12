import type { JobLane, Sector } from "./types";
import {
  SECTION_LOOKUP,
  cleanName,
  detectLayoutFamily,
  normHeader,
  scoreNameCandidate,
  type CvLayoutFamily,
} from "./cv-templates";

/**
 * Multi-template CV feature extraction.
 * Layout-agnostic strategies + section aliases (EN/ZH/PT) + career-aware defaults.
 */

export type EducationLevel =
  | "primary"
  | "secondary"
  | "vocational"
  | "bachelor"
  | "master"
  | "phd"
  | "other"
  | null;

export interface CvFeatures {
  name?: string;
  emails: string[];
  phones: string[];
  languages: string[];
  skills: string[];
  keywords: string[];
  preferredSectors: Sector[];
  preferredLanes: JobLane[];
  educationLevel: EducationLevel;
  educationHints: string[];
  isStudent: boolean;
  careerStage:
    | "secondary_student"
    | "undergrad"
    | "postgrad"
    | "early_career"
    | "professional";
  experienceYears: number | null;
  estimatedAge: number | null;
  districts: string[];
  summary: string;
  textLength: number;
  researchInterests?: string;
  /** Detected layout family (diagnostics) */
  layoutFamily?: CvLayoutFamily;
  /** Extraction confidence 0–1 */
  confidence?: number;
}

export interface CvExtractDebug {
  layoutFamily: CvLayoutFamily;
  sectionsFound: string[];
  nameCandidates: { line: string; score: number }[];
  confidence: number;
}

function splitSections(text: string): Map<string, string> {
  const lines = text.split(/\r?\n/);
  const map = new Map<string, string>();
  let current = "_header";
  const buf: string[] = [];

  const flush = () => {
    const body = buf.join("\n").trim();
    if (!body) return;
    const prev = map.get(current) || "";
    map.set(current, prev ? `${prev}\n${body}` : body);
    buf.length = 0;
  };

  for (const raw of lines) {
    const line = raw.trim();
    if (!line) continue;
    if (/^--\s*\d+\s*of\s*\d+\s*--$/i.test(line)) continue;
    if (/^page\s+\d+/i.test(line)) continue;

    const key = normHeader(line);
    // Header-like: short line, mostly letters, known alias OR ALL CAPS section
    const isAllCapsSection =
      line.length <= 48 &&
      /^[A-Z][A-Z\s/&-]{2,}$/.test(line) &&
      SECTION_LOOKUP.has(key);
    const canonical = SECTION_LOOKUP.get(key);

    if (canonical || isAllCapsSection) {
      flush();
      current = canonical || key;
      continue;
    }
    // "EDUCATION" with trailing colon already stripped by normHeader
    buf.push(line);
  }
  flush();
  return map;
}

function section(
  sections: Map<string, string>,
  ...ids: string[]
): string {
  for (const id of ids) {
    if (sections.has(id) && sections.get(id)!.trim()) return sections.get(id)!;
  }
  return "";
}

function extractEmails(text: string): string[] {
  const m = text.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi) || [];
  return [...new Set(m)].slice(0, 4);
}

function extractPhones(text: string): string[] {
  const out: string[] = [];
  const re =
    /(?:\(\s*\+?\s*(85[23])\s*\)|\+?\s*(85[23]))\s*[-\s.]?(\d{4})\s*[-\s.]?(\d{4})/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    out.push(`+${m[1] || m[2]} ${m[3]} ${m[4]}`);
  }
  // Mainland
  const cn = text.match(/(?:\+?86[-\s]?)?(1[3-9]\d{9})/g) || [];
  for (const c of cn) {
    const d = c.replace(/\D/g, "").slice(-11);
    if (d.length === 11) out.push(`+86 ${d}`);
  }
  // Generic international +XX ...
  const intl = text.match(/\+\d{1,3}[\s-]?\(?\d{2,4}\)?[\s-]?\d{3,4}[\s-]?\d{3,4}/g) || [];
  for (const i of intl.slice(0, 2)) {
    if (!out.some((o) => i.includes(o.replace(/\D/g, "").slice(-8)))) {
      out.push(i.trim());
    }
  }
  return [...new Set(out)].slice(0, 3);
}

function extractName(
  text: string,
  sections: Map<string, string>
): { name?: string; candidates: { line: string; score: number }[] } {
  const header = sections.get("_header") || text.slice(0, 600);
  const lines = header
    .split(/\n/)
    .map((l) => l.trim())
    .filter(Boolean);

  // Also scan full text for "Name: ..."
  const labeled = text.match(
    /(?:^|\n)\s*(?:name|姓名|姓名\s*\/\s*name|nome)\s*[:：]\s*([^\n\r]{2,50})/i
  );

  const candidates: { line: string; score: number }[] = [];

  if (labeled) {
    const c = cleanName(labeled[1]);
    candidates.push({ line: c, score: scoreNameCandidate(`Name: ${c}`, 0) + 20 });
  }

  lines.slice(0, 12).forEach((line, i) => {
    // Skip pure contact lines
    if (/^[@+\d]|phone|email|mobile|tel\b|linkedin|github/i.test(line) && /@|\d{4}/.test(line))
      return;
    const score = scoreNameCandidate(line, i);
    if (score > 0) {
      candidates.push({ line: cleanName(line), score });
    }
  });

  // Publication-style "Fong, S.C. (2024)" → weak family-name signal only if nothing else
  if (candidates.length === 0) {
    const pub = text.match(/\b([A-Z][a-z]{2,15}),\s*[A-Z](?:\.[A-Z])*\.?\s*\(\d{4}\)/);
    if (pub) candidates.push({ line: pub[1], score: 5 });
  }

  candidates.sort((a, b) => b.score - a.score);
  const best = candidates[0];
  if (best && best.score >= 12) {
    return { name: best.line, candidates: candidates.slice(0, 6) };
  }
  return { name: undefined, candidates: candidates.slice(0, 6) };
}

function extractLanguages(text: string, langSection: string, skillsSection: string): string[] {
  const line =
    text.match(/languages?\s*[:：]\s*([^\n]+)/i) ||
    langSection.match(/languages?\s*[:：]\s*([^\n]+)/i) ||
    skillsSection.match(/languages?\s*[:：]\s*([^\n]+)/i) ||
    text.match(/語言(?:能力)?\s*[:：]\s*([^\n]+)/) ||
    text.match(/语言(?:能力)?\s*[:：]\s*([^\n]+)/);

  const scope = line ? line[1] : `${langSection}\n${skillsSection}\n${text.slice(0, 2000)}`;
  const rules: [RegExp, string][] = [
    [/cantonese|廣東話|粤语|粵語/i, "Cantonese"],
    [/mandarin|putonghua|普通話|普通话|國語|国语/i, "Mandarin"],
    [/\benglish\b|英語|英文|英语/i, "English"],
    [/portuguese|葡語|葡萄牙語|葡萄牙语/i, "Portuguese"],
    [/\bjapanese\b|日語|日文|日语/i, "Japanese"],
    [/\bkorean\b|韓語|韩语|韓文/i, "Korean"],
    [/\bfrench\b|法語|法文|法语/i, "French"],
    [/\bgerman\b|德語|德文|德语/i, "German"],
    [/\bspanish\b|西班牙語|西班牙文/i, "Spanish"],
  ];

  const found: string[] = [];
  for (const [re, label] of rules) {
    if (re.test(scope)) found.push(label);
  }
  // If we only matched from whole CV and got English from "English" university name noise —
  // require language section OR fluency words when too many false friends
  if (!line && found.length === 1 && found[0] === "English") {
    if (!/english\s*\(|fluent|native|proficient|ielts|toefl|英語|英文/i.test(text)) {
      return [];
    }
  }
  return [...new Set(found)];
}

const SKILL_LEXICON: { tag: string; patterns: RegExp[] }[] = [
  { tag: "python", patterns: [/\bpython\b/i, /\bnumpy\b/i, /\bpandas\b/i, /\bscikit-learn\b/i, /\bpytorch\b/i, /\btensorflow\b/i, /\bdjango\b/i, /\bflask\b/i] },
  { tag: "r", patterns: [/(^|[^A-Za-z])R(?=[^A-Za-z]|$)/, /,\s*R\s*,/, /\bRStudio\b/i, /\btidyverse\b/i] },
  { tag: "java", patterns: [/\bjava\b(?!script)/i, /\bspring\s*boot\b/i] },
  { tag: "javascript", patterns: [/\bjavascript\b/i, /\btypescript\b/i, /\breact\b/i, /\bnode\.?js\b/i, /\bvue\b/i] },
  { tag: "sql", patterns: [/\bsql\b/i, /\bmysql\b/i, /\bpostgresql\b/i, /\bsnowflake\b/i] },
  { tag: "machine-learning", patterns: [/machine\s*learning/i, /deep\s*learning/i, /reinforcement\s*learning/i, /neural\s*network/i, /機器學習|深度学习|深度學習|神經網絡/] },
  { tag: "statistics", patterns: [/\bstatistics\b/i, /semiparametric/i, /survival\s*analysis/i, /interval-censored/i, /econometrics/i, /統計|存活分析|计量经济/] },
  { tag: "data-science", patterns: [/data\s*science/i, /data\s*analyst/i, /data\s*analytics/i, /數據科學|数据分析|數據分析/] },
  { tag: "finance", patterns: [/\bfinance\b/i, /financial\s*risk/i, /credit\s*risk/i, /credit\s*rating/i, /\binsurance\b/i, /actuarial/i, /quantitative\s*finance/i, /金融|保险|保險|精算|信貸/] },
  { tag: "risk-management", patterns: [/risk\s*management/i, /risk\s*and\s*investment/i, /風險管理|风险管理/] },
  { tag: "accounting", patterns: [/\baccounting\b/i, /\baudit\b/i, /ifrs|gaap/i, /會計|审计|審計/] },
  { tag: "teaching", patterns: [/teaching\s*assistant/i, /teaching\s*experience/i, /\btutor\b/i, /lecturer/i, /助教|教學|教学|讲师/] },
  { tag: "research", patterns: [/research\s*interest/i, /publications?/i, /\bthesis\b/i, /dissertation/i, /研究|论文|論文/] },
  { tag: "matlab", patterns: [/\bmatlab\b/i] },
  { tag: "cpp", patterns: [/c\s*\/\s*c\+\+/i, /\bc\+\+\b/i, /\bC\/C\+\+\b/] },
  { tag: "excel", patterns: [/\bexcel\b/i, /microsoft\s*office/i, /vlookup|pivot/i, /办公软件|辦公軟件/] },
  { tag: "customer-service", patterns: [/customer\s*service/i, /client\s*facing/i, /front\s*desk/i, /guest\s*relation/i, /客戶服務|客户服务|接待/] },
  { tag: "sales", patterns: [/\bsales\s*associate\b/i, /retail\s*sales/i, /business\s*development/i, /销售代表|銷售員/] },
  { tag: "teamwork", patterns: [/\bteamwork\b/i, /team\s*player/i, /cross-functional/i, /团队|團隊合作/] },
  { tag: "leadership", patterns: [/\bleadership\b/i, /team\s*lead/i, /supervised/i, /领导|領導|管理团队/] },
  { tag: "communication", patterns: [/communication\s*skills/i, /presentation\s*skills/i, /沟通|溝通|表达能力/] },
  { tag: "hospitality", patterns: [/\bhospitality\b/i, /\bhotel\b/i, /front\s*office/i, /酒店|房务|房務/] },
  { tag: "fnb", patterns: [/food\s*(?:and|&)\s*beverage/i, /\bbarista\b/i, /\bwaiter\b/i, /\bchef\b/i, /餐饮|餐飲|咖啡师/] },
  { tag: "it-support", patterns: [/help\s*desk/i, /it\s*support/i, /desktop\s*support/i, /technical\s*support/i, /技术支持|技術支援/] },
  { tag: "admin", patterns: [/\bclerical\b/i, /administrative\s*assistant/i, /\bsecretary\b/i, /行政助理|文员|文員/] },
  { tag: "design", patterns: [/\bphotoshop\b/i, /\bfigma\b/i, /\bcanva\b/i, /\billustrator\b/i, /ui\s*\/\s*ux/i, /平面设计|設計/] },
  { tag: "digital-marketing", patterns: [/digital\s*marketing/i, /social\s*media\s*marketing/i, /\bseo\b/i, /\bsemm?\b/i, /数字营销|數碼營銷/] },
  { tag: "events", patterns: [/\bmice\b/i, /event\s*planning/i, /event\s*coordinator/i, /会展|會展活动/] },
  { tag: "project-management", patterns: [/project\s*management/i, /\bagile\b/i, /\bscrum\b/i, /\bpmp\b/i, /项目管理|項目管理/] },
  { tag: "cloud", patterns: [/\baws\b/i, /\bazure\b/i, /google\s*cloud|\bgcp\b/i, /云计算|雲端/] },
  { tag: "english", patterns: [] },
  { tag: "mandarin", patterns: [] },
  { tag: "cantonese", patterns: [] },
];

function extractSkills(text: string, skillsSection: string): string[] {
  // Weight skills section higher by concatenating it twice
  const scope = `${skillsSection}\n${skillsSection}\n${text}`;
  const found: string[] = [];
  for (const { tag, patterns } of SKILL_LEXICON) {
    if (!patterns.length) continue;
    if (patterns.some((p) => p.test(scope))) found.push(tag);
  }
  // Bullet skill lines: "• Python, SQL, Tableau"
  const skillLines = (skillsSection || text).match(
    /(?:^|\n)\s*[•\-–●○▪]\s*([^\n]{2,100})/g
  );
  if (skillLines) {
    const blob = skillLines.join(" ");
    for (const { tag, patterns } of SKILL_LEXICON) {
      if (patterns.some((p) => p.test(blob)) && !found.includes(tag)) found.push(tag);
    }
  }
  return [...new Set(found)];
}

function extractSectors(text: string, skills: string[]): Sector[] {
  const found: Sector[] = [];
  const rules: { sector: Sector; patterns: RegExp[] }[] = [
    { sector: "tech", patterns: [/machine\s*learning|data\s*science|software|developer|python|cloud|人工智能|數據科學|程序员/i] },
    { sector: "finance", patterns: [/\bfinance\b|banking|insurance|securities|asset\s*management|金融|银行|保險|证券/i] },
    { sector: "education", patterns: [/teaching|professor|lecturer|tutor|university|教育|教师|助教|讲师/i] },
    { sector: "hospitality", patterns: [/\bhotel\b|hospitality|resort|酒店|旅游|旅遊/i] },
    { sector: "retail", patterns: [/retail|e-?commerce|超市|零售|电商/i] },
    { sector: "fnb", patterns: [/restaurant|f\s*&\s*b|food\s*service|餐饮|餐飲|餐厅/i] },
    { sector: "big-health", patterns: [/hospital|clinic|nursing|pharma|healthcare|医疗|護理|护理|药/i] },
    { sector: "mice", patterns: [/\bmice\b|exhibition|event\s*management|会展|會展/i] },
  ];
  for (const { sector, patterns } of rules) {
    if (patterns.some((p) => p.test(text))) found.push(sector);
  }
  if (skills.some((s) => ["python", "machine-learning", "data-science", "statistics", "java", "javascript", "cloud"].includes(s)))
    found.push("tech");
  if (skills.some((s) => ["finance", "risk-management", "accounting"].includes(s)))
    found.push("finance");
  if (skills.includes("teaching") || skills.includes("research")) found.push("education");
  if (skills.includes("hospitality")) found.push("hospitality");
  if (skills.includes("fnb")) found.push("fnb");
  if (skills.includes("digital-marketing") || skills.includes("sales")) found.push("retail");
  return [...new Set(found)];
}

function extractEducation(text: string, eduSection: string): {
  level: EducationLevel;
  hints: string[];
  years: { start?: number; end?: number }[];
} {
  const scope = eduSection || text;
  const hints: string[] = [];
  const years: { start?: number; end?: number }[] = [];

  const rangeRe =
    /(20\d{2})\s*[–—\-至到]\s*(20\d{2}|present|now|current|今|至今|present)/gi;
  let rm: RegExpExecArray | null;
  while ((rm = rangeRe.exec(scope))) {
    years.push({
      start: Number(rm[1]),
      end: /^\d+$/.test(rm[2]) ? Number(rm[2]) : undefined,
    });
  }

  // Month Year – Month Year
  const rangeRe2 =
    /(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\.?\s+(20\d{2})\s*[–—-]\s*(?:(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\.?\s+)?(20\d{2}|present|now)/gi;
  while ((rm = rangeRe2.exec(scope))) {
    years.push({
      start: Number(rm[1]),
      end: /^\d+$/.test(rm[2]) ? Number(rm[2]) : undefined,
    });
  }

  let level: EducationLevel = null;
  if (/\bph\.?\s*d\b|dphil|doctorate|doctoral|博士/i.test(scope)) {
    level = "phd";
    const line = scope.match(/ph\.?\s*d[^\n]{0,90}/i) || scope.match(/博士[^\n]{0,40}/);
    hints.push((line?.[0] || "PhD").trim());
  } else if (
    /\bmphil\b|\bm\.?\s*sc\.?\b|\bmsc\b|\bmba\b|\bm\.?\s*eng\b|master(?:'s)?(?:\s+of|\s+in|\s+degree)?|\bma\s+in\b|碩士|硕士|研究生/i.test(
      scope
    )
  ) {
    level = "master";
    hints.push("Master");
  } else if (
    /\bbsc\b|\bb\.?\s*sc\.?\b|\bbba\b|\bb\.?\s*eng\b|bachelor|undergraduate|associate\s*degree|學士|学士|本科|大专|大專|\bba\s+in\b/i.test(
      scope
    )
  ) {
    level = "bachelor";
    hints.push("Bachelor / undergraduate");
  } else if (/diploma|vocational|polytechnic|高級文憑|副学士|職中|高职/i.test(scope)) {
    level = "vocational";
    hints.push("Diploma / vocational");
  } else if (/secondary|high\s*school|form\s*[1-6]|中學|高中|初中/i.test(scope)) {
    level = "secondary";
    hints.push("Secondary");
  }

  const inst = scope.match(
    /(?:University|College|Institute|Polytechnic|中文大學|大學|大学|理工|學院|学院)[^\n]{0,50}/i
  );
  if (inst) hints.unshift(inst[0].trim().slice(0, 90));

  if (/distinction|first\s*class|summa|magna|dean'?s\s*list|fellowship|hkpfs|gpa\s*[3-4]/i.test(scope)) {
    hints.push("Academic honours noted");
  }

  return { level, hints: [...new Set(hints)].slice(0, 6), years };
}

function extractExperienceYears(
  text: string,
  profSection: string
): number | null {
  const explicit = text.match(
    /(\d+(?:\.\d+)?)\s*\+?\s*(?:years?|yrs?)\s+(?:of\s+)?(?:experience|exp)/i
  ) || text.match(/(\d+(?:\.\d+)?)\s*年(?:以上)?(?:相關|相关)?(?:工作)?經驗/);
  if (explicit) {
    const n = Number(explicit[1]);
    if (n >= 0 && n <= 45) return n;
  }

  const scope = profSection || text;
  const rangeRe =
    /(?:(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\.?\s+)?(20\d{2})\s*[–—\-至到]\s*(?:(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\.?\s+)?(20\d{2}|present|now|current|今|至今)/gi;
  let totalMonths = 0;
  const used = new Set<string>();
  let m: RegExpExecArray | null;
  while ((m = rangeRe.exec(scope))) {
    const key = `${m[1]}-${m[2]}`;
    if (used.has(key)) continue;
    used.add(key);
    const start = Number(m[1]);
    const end = /^\d+$/.test(m[2]) ? Number(m[2]) : new Date().getFullYear();
    if (end >= start && end - start <= 20) {
      totalMonths += Math.max(2, (end - start) * 12 + 6);
    }
  }
  if (totalMonths > 0) return Math.round((totalMonths / 12) * 10) / 10;
  return null;
}

function extractDistricts(text: string): string[] {
  const d: string[] = [];
  if (/taipa|氹仔/i.test(text)) d.push("Taipa");
  if (/cotai|路氹/i.test(text)) d.push("Cotai");
  if (/coloane|路環|路环/i.test(text)) d.push("Coloane");
  if (/macau\s*peninsula|澳門半島|澳门半岛/i.test(text)) d.push("Macau Peninsula");
  if (d.length === 0 && /macau|macao|澳門|澳门/i.test(text)) d.push("Macau Peninsula");
  return [...new Set(d)];
}

function estimateCareerAndAge(
  level: EducationLevel,
  eduYears: { start?: number; end?: number }[],
  expYears: number | null,
  text: string,
  layout: CvLayoutFamily
): {
  careerStage: CvFeatures["careerStage"];
  isStudent: boolean;
  estimatedAge: number | null;
  lanes: JobLane[];
  availability: string;
} {
  const now = new Date().getFullYear();
  const hasPhD = level === "phd";
  const hasMaster = level === "master" || hasPhD;

  let estimatedAge: number | null = null;
  const bsc = text.match(
    /(?:bsc|bachelor|b\.?\s*sc|本科|學士)[\s\S]{0,80}?(20\d{2})\s*[–—\-至到]\s*(20\d{2})/i
  );
  if (bsc) estimatedAge = now - Number(bsc[1]) + 18;
  else if (eduYears.length) {
    const starts = eduYears.map((y) => y.start).filter(Boolean) as number[];
    if (starts.length) estimatedAge = now - Math.min(...starts) + 18;
  }
  if (estimatedAge != null)
    estimatedAge = Math.min(70, Math.max(16, Math.round(estimatedAge)));

  const phdStudent =
    hasPhD &&
    (/ph\.?\s*d\s*candidate|doctoral\s*student|expected\s*grad/i.test(text) ||
      /20\d{2}\s*[–—-]\s*20\d{2}/.test(text));

  let careerStage: CvFeatures["careerStage"] = "early_career";
  let isStudent = false;
  let lanes: JobLane[] = ["full-time"];
  let availability = "Full-time";

  if (layout === "academic" || hasPhD || hasMaster) {
    careerStage =
      hasPhD || (expYears != null && expYears >= 2) ? "professional" : "postgrad";
    isStudent =
      phdStudent ||
      /ph\.?\s*d\s*candidate|doctoral\s*student|mphil\s*student|研究生在读|在讀/i.test(
        text
      );
    lanes = ["full-time"];
    availability = isStudent
      ? "Full-time (available after graduation / flexible for academic roles)"
      : "Full-time";
    if (!estimatedAge) estimatedAge = hasPhD ? 28 : 25;
  } else if (
    level === "bachelor" ||
    /undergraduate|year\s*[1-4]\b|大三|大四|fresh\s*grad/i.test(text)
  ) {
    careerStage = "undergrad";
    isStudent = /student|undergraduate|在读本科|大學生|university\s*student/i.test(
      text
    );
    lanes = isStudent
      ? ["internship", "part-time", "full-time"]
      : ["full-time", "internship"];
    availability = isStudent ? "Flexible / student schedule" : "Full-time";
    if (!estimatedAge) estimatedAge = 21;
  } else if (
    level === "secondary" ||
    /form\s*[4-6]|中學生|high\s*school\s*student/i.test(text)
  ) {
    careerStage = "secondary_student";
    isStudent = true;
    lanes = ["summer", "part-time"];
    availability = "Weekends & summer";
    if (!estimatedAge) estimatedAge = 17;
  } else if (expYears != null && expYears >= 3) {
    careerStage = "professional";
    lanes = ["full-time"];
    availability = "Full-time";
    if (!estimatedAge) estimatedAge = 28;
  } else {
    careerStage = "early_career";
    lanes = ["full-time", "internship", "part-time"];
    availability = "Full-time / flexible";
    if (!estimatedAge) estimatedAge = 24;
  }

  return { careerStage, isStudent, estimatedAge, lanes, availability };
}

function extractKeywords(text: string): string[] {
  const stop = new Set(
    `the and for with from that this have university college experience research using applications presentation conference thesis advisors professor department limited company ltd page of`.split(
      " "
    )
  );
  const tokens = text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s+#./-]/gu, " ")
    .split(/\s+/)
    .filter((t) => t.length >= 4 && t.length <= 28 && !stop.has(t));
  const zh = text.match(/[\u4e00-\u9fff]{2,6}/g) || [];
  const freq = new Map<string, number>();
  for (const t of [...tokens, ...zh]) freq.set(t, (freq.get(t) || 0) + 1);
  return [...freq.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 40)
    .map(([k]) => k);
}

function buildSummary(f: CvFeatures): string {
  const parts: string[] = [];
  if (f.educationHints[0]) parts.push(f.educationHints[0]);
  else if (f.educationLevel) parts.push(String(f.educationLevel).toUpperCase());
  if (f.skills.length) parts.push(`Skills: ${f.skills.slice(0, 8).join(", ")}`);
  if (f.languages.length) parts.push(`Lang: ${f.languages.join(", ")}`);
  if (f.experienceYears != null) parts.push(`Experience: ~${f.experienceYears}y`);
  if (f.preferredSectors.length)
    parts.push(`Sectors: ${f.preferredSectors.slice(0, 4).join(", ")}`);
  if (f.researchInterests)
    parts.push(`Research: ${f.researchInterests.slice(0, 100)}`);
  return parts.join(" · ").slice(0, 400);
}

function computeConfidence(f: CvFeatures, nameScore: number): number {
  let c = 0.2;
  if (f.name) c += 0.2;
  if (nameScore >= 30) c += 0.1;
  if (f.emails.length) c += 0.1;
  if (f.educationLevel) c += 0.15;
  if (f.skills.length >= 3) c += 0.1;
  if (f.languages.length) c += 0.05;
  if (f.preferredSectors.length) c += 0.05;
  if (f.textLength > 400) c += 0.05;
  return Math.min(0.98, Math.round(c * 100) / 100);
}

/**
 * Main entry: extract features from any common CV text template.
 */
export function extractCvFeatures(rawText: string): CvFeatures {
  const text = rawText
    .replace(/\u0000/g, " ")
    .replace(/\r/g, "\n")
    .replace(/\u00a0/g, " ")
    .replace(/[ \t]+\n/g, "\n");

  const layoutFamily = detectLayoutFamily(text);
  const sections = splitSections(text);

  const eduSection = section(sections, "education");
  const skillsSection = section(sections, "skills", "certifications");
  const langSection = section(sections, "languages");
  const profSection = section(
    sections,
    "experience",
    "teaching",
    "projects"
  );
  const research = section(sections, "research");
  const summarySec = section(sections, "summary");

  const { name, candidates } = extractName(text, sections);
  const education = extractEducation(text, eduSection);
  let skills = extractSkills(text, skillsSection);
  const languages = extractLanguages(text, langSection, skillsSection);

  const langMap: Record<string, string> = {
    English: "english",
    Mandarin: "mandarin",
    Cantonese: "cantonese",
    Portuguese: "portuguese",
  };
  for (const l of languages) {
    const tag = langMap[l];
    if (tag && !skills.includes(tag)) skills.push(tag);
  }

  // Academic / professional CVs: drop noisy youth-job tags
  if (
    education.level === "phd" ||
    education.level === "master" ||
    layoutFamily === "academic"
  ) {
    skills = skills.filter(
      (s) => !["digital-marketing", "events", "fnb", "sales", "hospitality"].includes(s)
    );
  }

  const sectors = extractSectors(text, skills);
  const expYears = extractExperienceYears(text, profSection);
  const career = estimateCareerAndAge(
    education.level,
    education.years,
    expYears,
    text,
    layoutFamily
  );

  const features: CvFeatures = {
    name,
    emails: extractEmails(text),
    phones: extractPhones(text),
    languages,
    skills,
    keywords: extractKeywords(text),
    preferredSectors: sectors.length ? sectors : layoutFamily === "academic" ? ["tech", "education"] : ["other"],
    preferredLanes: career.lanes,
    educationLevel: education.level,
    educationHints: education.hints,
    isStudent: career.isStudent,
    careerStage: career.careerStage,
    experienceYears: expYears,
    estimatedAge: career.estimatedAge,
    districts: extractDistricts(text),
    researchInterests: research
      ? research.replace(/\s+/g, " ").trim().slice(0, 400)
      : summarySec
        ? summarySec.replace(/\s+/g, " ").trim().slice(0, 300)
        : undefined,
    summary: "",
    textLength: text.length,
    layoutFamily,
  };

  features.summary = buildSummary(features);
  (features as CvFeatures & { _availability?: string })._availability =
    career.availability;
  features.confidence = computeConfidence(
    features,
    candidates[0]?.score ?? 0
  );

  return features;
}

export function getAvailabilityFromFeatures(f: CvFeatures): string {
  const any = f as CvFeatures & { _availability?: string };
  if (any._availability) return any._availability;
  if (f.careerStage === "secondary_student") return "Weekends & summer";
  if (f.careerStage === "undergrad") return "Flexible / student schedule";
  return "Full-time";
}

export function extractCvFeaturesWithDebug(rawText: string): {
  features: CvFeatures;
  debug: CvExtractDebug;
} {
  const text = rawText.replace(/\u0000/g, " ").replace(/\r/g, "\n");
  const layoutFamily = detectLayoutFamily(text);
  const sections = splitSections(text);
  const { candidates } = extractName(text, sections);
  const features = extractCvFeatures(rawText);
  return {
    features,
    debug: {
      layoutFamily,
      sectionsFound: [...sections.keys()],
      nameCandidates: candidates,
      confidence: features.confidence ?? 0,
    },
  };
}

export function tokenizeForMatch(text: string): Set<string> {
  const stop = new Set(["the", "and", "for", "with", "from", "that", "this"]);
  const en = text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .split(/\s+/)
    .filter((t) => t.length >= 3 && !stop.has(t));
  const zh = text.match(/[\u4e00-\u9fff]{2,4}/g) || [];
  return new Set([...en, ...zh.map((z) => z.toLowerCase())]);
}

export function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let inter = 0;
  for (const x of a) if (b.has(x)) inter++;
  const union = a.size + b.size - inter;
  return union === 0 ? 0 : inter / union;
}
