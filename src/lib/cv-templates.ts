/**
 * Multi-template CV knowledge base.
 * Covers common résumé layouts (chronological, functional, academic,
 * LinkedIn export, Europass-like, Macau/HK bilingual, Chinese mainland style).
 * Used for section detection, name scoring, and layout heuristics — not a single hard-coded sample.
 */

/** Normalize a line for header matching */
export function normHeader(line: string): string {
  return line
    .trim()
    .toLowerCase()
    .replace(/[:：.。|｜•·\-–—_/\\]+$/g, "")
    .replace(/^[:：.。|｜•·\-–—_/\\]+/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Canonical section id → surface forms (EN / 繁中 / 简中 / PT common in Macau).
 */
export const SECTION_ALIASES: Record<string, string[]> = {
  header: ["curriculum vitae", "curriculum vita", "resume", "résumé", "cv", "履歷", "简历", "個人履歷", "个人简历"],
  summary: [
    "summary",
    "profile",
    "professional summary",
    "career objective",
    "objective",
    "about me",
    "personal profile",
    "personal statement",
    "executive summary",
    "overview",
    "個人簡介",
    "个人简介",
    "自我評價",
    "自我评价",
    "求職意向",
    "求职意向",
    "簡介",
    "简介",
    "perfil",
    "resumo",
  ],
  research: [
    "research interests",
    "research interest",
    "research",
    "research experience",
    "research statement",
    "研究興趣",
    "研究兴趣",
    "研究方向",
    "研究經歷",
    "研究经历",
  ],
  education: [
    "education",
    "education and training",
    "academic background",
    "academic qualifications",
    "qualifications",
    "degrees",
    "學歷",
    "学历",
    "教育背景",
    "教育经历",
    "教育經歷",
    "academic history",
    "formação académica",
    "formacao academica",
    "educação",
  ],
  experience: [
    "experience",
    "work experience",
    "professional experience",
    "employment",
    "employment history",
    "work history",
    "career history",
    "relevant experience",
    "professional background",
    "positions held",
    "工作經驗",
    "工作经验",
    "工作經歷",
    "工作经历",
    "專業經驗",
    "专业经验",
    "職業經歷",
    "职业经历",
    "實習經歷",
    "实习经历",
    "internships",
    "internship experience",
    "experiência profissional",
    "experiencia profissional",
  ],
  teaching: [
    "teaching",
    "teaching experience",
    "teaching & mentoring",
    "academic teaching",
    "教學經驗",
    "教学经验",
    "教學經歷",
    "任教",
  ],
  skills: [
    "skills",
    "technical skills",
    "core skills",
    "key skills",
    "professional skills",
    "competencies",
    "core competencies",
    "expertise",
    "technologies",
    "tech stack",
    "tools",
    "技能",
    "專業技能",
    "专业技能",
    "技術技能",
    "技术技能",
    "專長",
    "专长",
    "核心技能",
    "competências",
    "competencias",
  ],
  languages: [
    "languages",
    "language skills",
    "language proficiency",
    "語言",
    "语言",
    "語言能力",
    "语言能力",
    "línguas",
    "linguas",
  ],
  projects: [
    "projects",
    "selected projects",
    "key projects",
    "personal projects",
    "academic projects",
    "項目",
    "项目",
    "專案",
    "项目经历",
    "項目經歷",
  ],
  publications: [
    "publications",
    "publication",
    "selected publications",
    "papers",
    "journal articles",
    "發表",
    "发表",
    "論文",
    "论文",
    "著作",
    "publicações",
  ],
  awards: [
    "awards",
    "honors",
    "honours",
    "honors and awards",
    "honours and awards",
    "scholarships",
    "achievements",
    "獲獎",
    "获奖",
    "榮譽",
    "荣誉",
    "獎項",
    "奖项",
    "獎學金",
  ],
  certifications: [
    "certifications",
    "certificates",
    "licenses",
    "professional certifications",
    "證照",
    "证书",
    "資格",
    "资格认证",
  ],
  activities: [
    "activities",
    "extracurricular",
    "volunteer",
    "volunteering",
    "leadership",
    "campus activities",
    "課外活動",
    "课外活动",
    "志願",
    "志愿",
  ],
  conferences: [
    "conferences",
    "conference presentations",
    "talks",
    "presentations",
    "invited talks",
    "會議",
    "会议",
    "學術會議",
  ],
  references: ["references", "referees", "推薦人", "推荐人", "證明人"],
  contact: ["contact", "contact information", "聯絡", "联系方式", "contacto"],
};

/** Flatten alias → canonical section id */
export function buildSectionLookup(): Map<string, string> {
  const map = new Map<string, string>();
  for (const [canonical, aliases] of Object.entries(SECTION_ALIASES)) {
    for (const a of aliases) {
      map.set(normHeader(a), canonical);
    }
  }
  return map;
}

export const SECTION_LOOKUP = buildSectionLookup();

/** Words that must never be treated as a person name */
export const NAME_BLOCKLIST = new Set(
  [
    ...Object.values(SECTION_ALIASES).flat(),
    "phone",
    "email",
    "mobile",
    "address",
    "linkedin",
    "github",
    "website",
    "portfolio",
    "location",
    "nationality",
    "gender",
    "male",
    "female",
    "date of birth",
    "dob",
    "available",
    "expected salary",
    "objective",
    "page",
    "confidential",
    "telephone",
    "fax",
    "wechat",
    "whatsapp",
    "出生",
    "性別",
    "籍貫",
    "現居",
    "現住址",
    "联系电话",
    "聯絡電話",
    "电子邮箱",
    "電子郵箱",
  ].map((s) => normHeader(s))
);

/**
 * Detect layout family for diagnostics / light branching.
 */
export type CvLayoutFamily =
  | "academic"
  | "chronological_industry"
  | "functional_skills_first"
  | "bilingual_zh_en"
  | "compact_contact_header"
  | "generic";

export function detectLayoutFamily(text: string): CvLayoutFamily {
  const t = text.slice(0, 2500);
  const has = (re: RegExp) => re.test(t);
  if (
    has(/ph\.?\s*d|publications?|research interests?|teaching experience|dissertation|thesis/i) ||
    has(/博士|論文|研究興趣|教學經驗/)
  ) {
    return "academic";
  }
  if (has(/核心技能|专业技能|求职意向|自我评价|工作经历/) && has(/[\u4e00-\u9fff]{8,}/)) {
    return "bilingual_zh_en";
  }
  if (
    has(/^skills\b|^technical skills\b|^core competencies/im) &&
    !has(/^experience\b|^work experience\b/im)
  ) {
    // skills appear before experience in first screen
    const skillsIdx = t.search(/technical skills|core skills|skills\b/i);
    const expIdx = t.search(/work experience|professional experience|employment/i);
    if (skillsIdx >= 0 && (expIdx < 0 || skillsIdx < expIdx)) {
      return "functional_skills_first";
    }
  }
  if (has(/@/) && has(/\+?\d/) && has(/work experience|professional experience|employment/i)) {
    return "chronological_industry";
  }
  if (has(/@/) && t.split("\n").slice(0, 5).some((l) => /@|\+85|phone|email/i.test(l))) {
    return "compact_contact_header";
  }
  return "generic";
}

/** Score a candidate string as a personal name (higher = better). */
export function scoreNameCandidate(raw: string, lineIndex: number): number {
  const line = raw.trim();
  if (!line || line.length < 2 || line.length > 60) return -100;
  const n = normHeader(line);
  if (NAME_BLOCKLIST.has(n)) return -100;
  if (SECTION_LOOKUP.has(n)) return -100;
  if (/@|https?:|www\.|linkedin\.com|github\.com/i.test(line)) return -80;
  if (/\d{3,}/.test(line) && /@|\+|\d{4}/.test(line)) return -60; // contact-heavy
  if (/^(mr|mrs|ms|dr|prof|教授|先生|女士)\.?$/i.test(line)) return -50;

  let score = 10 - lineIndex * 1.5; // earlier lines preferred

  // Strip common title suffixes for pattern tests
  const core = line
    .split(/\s*[—–|•·]\s*/)[0]
    .replace(/,?\s*(ph\.?d\.?|m\.?sc\.?|b\.?sc\.?|mba|mphil|dr\.?|prof\.?).*$/i, "")
    .replace(/^(mr|mrs|ms|dr|prof)\.?\s+/i, "")
    .trim();

  if (NAME_BLOCKLIST.has(normHeader(core))) return -100;

  // Western First Last
  if (/^[A-Z][a-zA-Z'’.-]{1,20}(?:\s+[A-Z][a-zA-Z'’.-]{1,20}){1,3}$/.test(core)) {
    score += 40;
  }
  // LAST FIRST (all caps first token)
  if (/^[A-Z]{2,}(?:\s+[A-Z][a-z]+)+$/.test(core)) score += 25;
  // Last, First
  if (/^[A-Z][a-zA-Z'’.-]+,\s*[A-Z][a-zA-Z'’.-]+/.test(core)) score += 35;
  // Chinese 2–4
  if (/^[\u4e00-\u9fff]{2,4}$/.test(core)) score += 45;
  // Chinese with optional English
  if (/^[\u4e00-\u9fff]{2,4}\s*\(?[A-Z][a-z]+(?:\s+[A-Z][a-z]+)?\)?$/.test(core))
    score += 40;
  // "Name: Xxx"
  if (/^(name|姓名|姓名／Name)\s*[:：]/i.test(line)) score += 50;

  // Penalties
  if (core.split(/\s+/).length > 5) score -= 20;
  if (/university|college|limited|ltd|inc|company|department|school/i.test(line))
    score -= 40;
  if (/engineer|analyst|manager|intern|assistant|developer|student of/i.test(line) && !/—|–|-/.test(line))
    score -= 15;
  // "Software Engineer" job title as first line (functional CV) — no person tokens
  if (/^[A-Z][a-z]+(?:\s+[A-Z][a-z]+){0,4}$/.test(core)) {
    const jobTitleWords =
      /engineer|developer|manager|analyst|designer|consultant|specialist|officer|director|intern|professor|lecturer|scientist|researcher|executive|associate|coordinator/i;
    if (jobTitleWords.test(core) && core.split(/\s+/).length <= 4) score -= 35;
  }

  return score;
}

export function cleanName(raw: string): string {
  let line = raw.trim();
  const labeled = line.match(
    /^(?:name|姓名|姓名\s*\/\s*name|nome)\s*[:：]\s*(.+)$/i
  );
  if (labeled) line = labeled[1].trim();
  line = line
    .split(/\s*[—–|•·]\s*/)[0]
    // Only strip degree/title tokens at word boundaries (avoid "Rodrigues" → "Ro")
    .replace(
      /,?\s*\b(ph\.?d\.?|m\.?sc\.?|b\.?sc\.?|mba|mphil|m\.?eng\.?|b\.?eng\.?)\b.*$/i,
      ""
    )
    .replace(/^(mr|mrs|ms|dr|prof)\.?\s+/i, "")
    .trim();
  return titleCaseName(line).slice(0, 60);
}

/** JAMIE WONG / jamie wong → Jamie Wong; keep Chinese as-is */
export function titleCaseName(name: string): string {
  if (/[\u4e00-\u9fff]/.test(name)) return name;
  return name
    .split(/\s+/)
    .map((part) => {
      if (part.includes("-")) {
        return part
          .split("-")
          .map((p) => p.charAt(0).toUpperCase() + p.slice(1).toLowerCase())
          .join("-");
      }
      if (part.includes("'")) {
        return part
          .split("'")
          .map((p) => p.charAt(0).toUpperCase() + p.slice(1).toLowerCase())
          .join("'");
      }
      // O'Brien already handled; McDonald-style leave simple
      return part.charAt(0).toUpperCase() + part.slice(1).toLowerCase();
    })
    .join(" ");
}
