import type { JobPosting, YouthProfile } from "./types";
import type { CvFeatures } from "./cv-extract";

/**
 * Regulated / licensed professions where job ads imply mandatory credentials.
 * Text similarity / language overlap alone is never enough.
 *
 * Note: JS \b word boundaries do NOT work around CJK (醫生 etc.), so we use
 * explicit EN \b patterns + bare CJK substring checks.
 */

export type CredentialId =
  | "physician"
  | "dentist"
  | "nurse"
  | "pharmacist"
  | "physiotherapist"
  | "occupational_therapist"
  | "speech_therapist"
  | "psychologist"
  | "psychotherapist"
  | "allied_therapist"
  | "tcm_practitioner"
  | "veterinarian"
  | "lawyer"
  | "cpa_accountant"
  | "architect"
  | "civil_engineer_license"
  | "social_worker"
  | "teacher_license"
  | "pilot"
  | "driver_commercial";

export interface CredentialDef {
  id: CredentialId;
  labelEn: string;
  labelZh: string;
  /** English / roman patterns (may use \b) */
  jobRequiredEn: RegExp;
  /** Chinese substrings that mark the role as requiring this credential */
  jobRequiredZh: string[];
  /** English evidence on CV */
  seekerHasEn: RegExp;
  /** Chinese evidence on CV */
  seekerHasZh: string[];
  /** Job is assistant/admin around the profession — no full licence */
  jobAssistantEn?: RegExp;
  jobAssistantZh?: string[];
}

export const CREDENTIAL_DEFS: CredentialDef[] = [
  {
    id: "physician",
    labelEn: "Licensed physician / doctor",
    labelZh: "註冊醫生／醫師",
    jobRequiredEn:
      /\b(medical\s*doctor|physician|surgeon|oncologist|resident\s*doctor|house\s*officer|attending\s*physician|general\s*practitioner|\bGP\b|MBBS|MBChB|M\.?D\.?)\b/i,
    jobRequiredZh: [
      "醫生",
      "医师",
      "医生",
      "大夫",
      "臨床醫生",
      "註冊醫生",
      "專科醫生",
      "西醫",
      "腫瘤科",
      "腫瘤",
      "內科",
      "外科",
      "兒科",
      "婦產",
      "骨科",
      "眼科",
      "皮膚科",
      "精神科醫生",
      "全科醫生",
      "住院醫生",
      "主治醫生",
    ],
    seekerHasEn:
      /\b(M\.?D\.?|MBBS|MBChB|licensed\s*physician|registered\s*doctor|medical\s*licen[cs]e|Doctor\s*of\s*Medicine|Faculty\s*of\s*Medicine|School\s*of\s*Medicine|medical\s*degree)\b/i,
    seekerHasZh: [
      "執業醫師",
      "註冊醫生",
      "醫師執照",
      "醫師資格",
      "醫學博士",
      "醫學院",
      "醫學學位",
      "西醫資格",
      "醫生執照",
      "行醫資格",
    ],
    jobAssistantEn:
      /medical\s*assistant|clinic\s*admin|clinic\s*receptionist|healthcare\s*assistant|front\s*desk|patient\s*coordinator/i,
    jobAssistantZh: [
      "醫療助理",
      "診所文員",
      "診所行政",
      "醫務助理",
      "醫院行政",
      "前台",
      "預約",
    ],
  },
  {
    id: "dentist",
    labelEn: "Licensed dentist",
    labelZh: "註冊牙醫",
    jobRequiredEn: /\b(dentist|dental\s*surgeon|DDS|DMD|BDS)\b/i,
    jobRequiredZh: ["牙醫", "口腔科醫生", "牙科醫生", "牙科醫師", "註冊牙醫"],
    seekerHasEn:
      /\b(DDS|DMD|BDS|licensed\s*dentist|dental\s*licen[cs]e|Faculty\s*of\s*Dentistry)\b/i,
    seekerHasZh: ["註冊牙醫", "牙醫執照", "牙醫學位", "牙醫學院"],
    jobAssistantEn: /dental\s*assistant|dental\s*hygienist|dental\s*nurse/i,
    jobAssistantZh: ["牙科助理", "牙醫助理"],
  },
  {
    id: "nurse",
    labelEn: "Registered nurse",
    labelZh: "註冊護士",
    jobRequiredEn:
      /\b(registered\s*nurse|\bRN\b|enrolled\s*nurse|\bEN\b|staff\s*nurse|nurse\s*manager)\b/i,
    jobRequiredZh: ["註冊護士", "登記護士", "護士長", "護理師", "護士"],
    seekerHasEn:
      /\b(registered\s*nurse|\bRN\b|enrolled\s*nurse|nursing\s*licen[cs]e|BSN|BN|Nursing\s*degree)\b/i,
    seekerHasZh: ["註冊護士", "護士執照", "護理學", "護理學位"],
    jobAssistantEn:
      /nursing\s*aide|care\s*assistant|healthcare\s*assistant|patient\s*care/i,
    jobAssistantZh: ["護理助理", "護助", "護理員"],
  },
  {
    id: "pharmacist",
    labelEn: "Licensed pharmacist",
    labelZh: "註冊藥劑師",
    jobRequiredEn: /\b(pharmacist|PharmD|BPharm)\b/i,
    jobRequiredZh: ["藥劑師", "執業藥師", "註冊藥劑師", "臨床藥劑師"],
    seekerHasEn:
      /\b(pharmacist|BPharm|PharmD|pharmacy\s*licen[cs]e|School\s*of\s*Pharmacy)\b/i,
    seekerHasZh: ["註冊藥劑師", "藥劑師執照", "藥學學位", "藥學院"],
    jobAssistantEn: /pharmacy\s*assistant|pharmacy\s*technician/i,
    jobAssistantZh: ["藥劑助理", "藥房助理", "配藥員"],
  },
  {
    id: "physiotherapist",
    labelEn: "Licensed physiotherapist",
    labelZh: "註冊物理治療師",
    jobRequiredEn:
      /\b(physiotherapist|physical\s*therapist|\bDPT\b|physio(?!\s*assistant))\b/i,
    jobRequiredZh: ["物理治療師", "物理治療"],
    seekerHasEn:
      /\b(physiotherapist|physical\s*therapist|BSc\s*Physiotherapy|\bDPT\b|physio\s*licen[cs]e)\b/i,
    seekerHasZh: [
      "物理治療師",
      "物理治療學位",
      "物理治療執照",
      "註冊物理治療",
    ],
    jobAssistantEn: /physio\s*assistant|rehabilitation\s*aide/i,
    jobAssistantZh: ["物理治療助理", "復康助理"],
  },
  {
    id: "occupational_therapist",
    labelEn: "Licensed occupational therapist",
    labelZh: "註冊職業治療師",
    jobRequiredEn: /\b(occupational\s*therapist|\bOT\b)\b/i,
    jobRequiredZh: ["職業治療師", "職能治療師", "職業治療"],
    seekerHasEn:
      /\b(occupational\s*therapist|OT\s*licen[cs]e)\b/i,
    seekerHasZh: ["職業治療師", "職能治療", "註冊職業治療"],
    jobAssistantEn: /occupational\s*therapy\s*assistant/i,
    jobAssistantZh: ["職業治療助理"],
  },
  {
    id: "speech_therapist",
    labelEn: "Speech therapist / SLP",
    labelZh: "言語治療師",
    jobRequiredEn:
      /\b(speech[\s-]?language\s*pathologist|speech\s*therapist|\bSLP\b)\b/i,
    jobRequiredZh: ["言語治療師", "語言治療師", "言語治療", "語言治療"],
    seekerHasEn: /\b(speech[\s-]?language|speech\s*therapist|\bSLP\b)\b/i,
    seekerHasZh: ["言語治療", "語言治療"],
  },
  {
    id: "psychologist",
    labelEn: "Licensed psychologist",
    labelZh: "註冊心理學家",
    jobRequiredEn:
      /\b(clinical\s*psychologist|registered\s*psychologist|licensed\s*psychologist)\b/i,
    jobRequiredZh: ["臨床心理學家", "註冊心理學家", "心理醫生"],
    seekerHasEn:
      /\b(clinical\s*psychologist|licensed\s*psychologist|psychologist\s*licen[cs]e)\b/i,
    seekerHasZh: ["臨床心理", "註冊心理學", "心理學博士"],
    jobAssistantEn: /psychology\s*assistant|counseling\s*assistant/i,
    jobAssistantZh: ["心理助理", "輔導助理"],
  },
  {
    id: "psychotherapist",
    labelEn: "Psychotherapist / clinical counsellor",
    labelZh: "心理治療師／臨床輔導",
    jobRequiredEn:
      /\b(psychotherapist|clinical\s*counsell?or)\b/i,
    jobRequiredZh: ["心理治療師", "臨床輔導員", "輔導心理學家"],
    seekerHasEn:
      /\b(psychotherapist|clinical\s*counsell?or|counselling\s*psychology|counseling\s*psychology)\b/i,
    seekerHasZh: ["心理治療師", "臨床輔導"],
    jobAssistantEn: /peer\s*counsell?or/i,
    jobAssistantZh: ["朋輩輔導", "活動助理"],
  },
  {
    id: "allied_therapist",
    labelEn: "Licensed / registered therapist (clinical)",
    labelZh: "註冊／臨床治療師",
    jobRequiredEn: /\btherapist\b/i,
    jobRequiredZh: ["治療師"],
    seekerHasEn:
      /\b(physiotherapist|physical\s*therapist|occupational\s*therapist|speech\s*therapist|psychotherapist|registered\s*therapist|licensed\s*therapist)\b/i,
    seekerHasZh: [
      "物理治療",
      "職業治療",
      "言語治療",
      "心理治療",
      "治療師執照",
      "註冊治療師",
    ],
    jobAssistantEn:
      /beauty\s*therapist|spa\s*therapist|massage\s*therapist|nail|aromatherap|therapist\s*assistant/i,
    jobAssistantZh: ["美容", "水療", "按摩", "治療助理"],
  },
  {
    id: "tcm_practitioner",
    labelEn: "TCM / Chinese medicine practitioner",
    labelZh: "中醫師",
    jobRequiredEn: /\b(TCM\s*doctor|Chinese\s*medicine\s*doctor)\b/i,
    jobRequiredZh: ["中醫師", "中醫醫生", "註冊中醫", "中醫"],
    seekerHasEn: /\b(TCM|Chinese\s*medicine)\b/i,
    seekerHasZh: ["中醫師", "中醫執業", "中醫學"],
    jobAssistantZh: ["中醫助理", "中藥房"],
  },
  {
    id: "veterinarian",
    labelEn: "Veterinarian",
    labelZh: "獸醫",
    jobRequiredEn: /\b(veterinarian|veterinary\s*surgeon|\bDVM\b)\b/i,
    jobRequiredZh: ["獸醫"],
    seekerHasEn: /\b(DVM|BVSc|MRCVS|veterinarian|veterinary\s*surgeon)\b/i,
    seekerHasZh: ["獸醫", "獸醫學"],
    jobAssistantEn: /vet\s*assistant|veterinary\s*nurse/i,
    jobAssistantZh: ["獸醫助理", "動物護理"],
  },
  {
    id: "lawyer",
    labelEn: "Lawyer / solicitor / barrister",
    labelZh: "律師",
    jobRequiredEn:
      /\b(lawyer|solicitor|barrister|attorney[\s-]at[\s-]law)\b/i,
    jobRequiredZh: ["律師", "大律師", "事務律師"],
    seekerHasEn:
      /\b(lawyer|solicitor|barrister|\bJD\b|\bLLB\b|\bLLM\b|qualified\s*lawyer|Faculty\s*of\s*Law|Law\s*School)\b/i,
    seekerHasZh: ["律師資格", "律師執照", "執業律師", "大律師", "法學院"],
    jobAssistantEn: /legal\s*assistant|paralegal|legal\s*clerk|legal\s*secretary/i,
    jobAssistantZh: ["律師助理", "法律文員"],
  },
  {
    id: "cpa_accountant",
    labelEn: "CPA / certified accountant",
    labelZh: "註冊會計師／執業會計師",
    jobRequiredEn:
      /\b(CPA|chartered\s*accountant|certified\s*public\s*accountant)\b/i,
    jobRequiredZh: ["註冊會計師", "執業會計師", "特許會計師"],
    seekerHasEn:
      /\b(CPA|ACCA|HKICPA|CICPA|chartered\s*accountant)\b/i,
    seekerHasZh: ["註冊會計師", "執業會計師", "會計師公會"],
    jobAssistantEn: /accounts\s*clerk|accounting\s*assistant|bookkeep/i,
    jobAssistantZh: ["簿記", "會計文員"],
  },
  {
    id: "architect",
    labelEn: "Registered architect",
    labelZh: "註冊建築師",
    jobRequiredEn: /\b(registered\s*architect|licensed\s*architect)\b/i,
    jobRequiredZh: ["註冊建築師", "建築師"],
    seekerHasEn:
      /\b(registered\s*architect|\bRIBA\b|\bHKIA\b|\bBArch\b|\bMArch\b)\b/i,
    seekerHasZh: ["註冊建築師", "建築師執照", "建築學"],
    jobAssistantEn: /architectural\s*assistant|draftsman/i,
    jobAssistantZh: ["建築助理", "繪圖員"],
  },
  {
    id: "civil_engineer_license",
    labelEn: "Licensed civil / structural engineer",
    labelZh: "註冊土木／結構工程師",
    jobRequiredEn:
      /\b(registered\s*professional\s*engineer|\bRPE\b|chartered\s*engineer)\b/i,
    jobRequiredZh: ["註冊工程師", "註冊結構工程師", "註冊土木工程師"],
    seekerHasEn:
      /\b(RPE|CEng|\bPE\b|professional\s*engineer|MICE|HKIE)\b/i,
    seekerHasZh: ["註冊工程師", "工程師學會"],
    jobAssistantEn: /engineering\s*assistant|site\s*assistant/i,
    jobAssistantZh: ["工程助理", "技術員"],
  },
  {
    id: "social_worker",
    labelEn: "Registered social worker",
    labelZh: "註冊社工",
    jobRequiredEn: /\b(registered\s*social\s*worker|\bRSW\b)\b/i,
    jobRequiredZh: ["註冊社工", "社會工作者", "社工"],
    seekerHasEn: /\b(registered\s*social\s*worker|\bRSW\b|\bBSW\b|\bMSW\b)\b/i,
    seekerHasZh: ["社會工作", "註冊社工", "社工註冊"],
    jobAssistantEn: /social\s*work\s*assistant|programme\s*assistant/i,
    jobAssistantZh: ["福利助理", "社區助理", "活動助理", "社工助理"],
  },
  {
    id: "teacher_license",
    labelEn: "Qualified / registered teacher",
    labelZh: "合資格／註冊教師",
    jobRequiredEn:
      /\b(registered\s*teacher|qualified\s*teacher|teaching\s*licen[cs]e|\bQTS\b|\bPGDE\b|\bPGCE\b)\b/i,
    jobRequiredZh: ["教師資格", "註冊教師", "持有教師資格"],
    seekerHasEn:
      /\b(PGDE|PGCE|BEd|MEd|teaching\s*licen[cs]e|registered\s*teacher|Qualified\s*Teacher\s*Status|\bQTS\b)\b/i,
    seekerHasZh: ["教師資格", "教育文憑", "師資"],
    jobAssistantEn: /teaching\s*assistant|\btutor\b/i,
    jobAssistantZh: ["助教", "教學助理", "補習導師"],
  },
  {
    id: "pilot",
    labelEn: "Licensed pilot",
    labelZh: "持牌飛行員",
    jobRequiredEn:
      /\b(airline\s*pilot|commercial\s*pilot|\bCPL\b|\bATPL\b)\b/i,
    jobRequiredZh: ["飛行員", "機師"],
    seekerHasEn: /\b(ATPL|CPL|PPL|type\s*rating)\b/i,
    seekerHasZh: ["飛行員執照", "商用飛行員"],
  },
  {
    id: "driver_commercial",
    labelEn: "Commercial / professional driver licence",
    labelZh: "職業／客貨運駕照",
    jobRequiredEn:
      /\b(truck\s*driver|bus\s*driver|taxi\s*driver|professional\s*driver|heavy\s*vehicle)\b/i,
    jobRequiredZh: [
      "貨車司機",
      "巴士司機",
      "的士司機",
      "職業司機",
      "客車司機",
    ],
    seekerHasEn: /\b(CDL|commercial\s*driver)\b/i,
    seekerHasZh: ["駕照", "駕駛執照", "職業駕駛", "大貨車", "客車駕照"],
  },
];

export interface CredentialAssessment {
  required: CredentialId[];
  held: CredentialId[];
  missing: CredentialId[];
  matched: CredentialId[];
  hardBlock: boolean;
  scoreDelta: number;
  reasonsEn: string[];
  reasonsZh: string[];
}

/** Soft skills / languages that must never count as professional skill overlap */
export const NON_PROFESSIONAL_SKILL_TOKENS = new Set([
  "english",
  "mandarin",
  "cantonese",
  "portuguese",
  "putonghua",
  "chinese",
  "language",
  "languages",
  "英語",
  "英語能力",
  "普通話",
  "國語",
  "廣東話",
  "粵語",
  "葡語",
  "中文",
  "teamwork",
  "communication",
  "customer-service",
  "customer_service",
  "friendly",
  "hardworking",
  "punctual",
  "團隊",
  "溝通",
  "服務態度",
]);

export function isLanguageOrSoftSkill(token: string): boolean {
  const t = token.toLowerCase().trim();
  if (NON_PROFESSIONAL_SKILL_TOKENS.has(t)) return true;
  if (/^(english|mandarin|cantonese|portuguese|chinese)/i.test(t)) return true;
  if (/語$|話$|文$/.test(t) && t.length <= 4) return true;
  return false;
}

function jobText(job: JobPosting): string {
  return [
    job.title,
    job.titleZh,
    job.description,
    job.descriptionZh,
    ...(job.requirements || []),
    ...(job.requirementsZh || []),
    ...(job.skills || []),
    job.companyType || "",
  ].join("\n");
}

function seekerText(youth: YouthProfile, cv?: CvFeatures | null): string {
  return [
    youth.bio || "",
    youth.skills.join(" "),
    youth.name || "",
    cv?.summary || "",
    cv?.researchInterests || "",
    (cv?.skills || []).join(" "),
    (cv?.keywords || []).join(" "),
    (cv?.educationHints || []).join(" "),
    cv?.educationLevel || "",
    cv?.careerStage || "",
  ].join("\n");
}

function containsAny(text: string, needles: string[]): boolean {
  if (!needles.length) return false;
  return needles.some((n) => n && text.includes(n));
}

function isAssistantRole(def: CredentialDef, text: string): boolean {
  if (def.jobAssistantEn?.test(text)) return true;
  if (def.jobAssistantZh && containsAny(text, def.jobAssistantZh)) return true;
  return false;
}

function jobRequires(def: CredentialDef, text: string): boolean {
  if (def.jobRequiredEn.test(text)) return true;
  if (containsAny(text, def.jobRequiredZh)) return true;
  return false;
}

function seekerHolds(def: CredentialDef, text: string): boolean {
  if (def.seekerHasEn.test(text)) return true;
  if (containsAny(text, def.seekerHasZh)) return true;
  return false;
}

const SPECIFIC_THERAPY: CredentialId[] = [
  "physiotherapist",
  "occupational_therapist",
  "speech_therapist",
  "psychotherapist",
  "psychologist",
];

/** Credentials a job listing requires (excluding assistant-only postings). */
export function detectJobRequiredCredentials(job: JobPosting): CredentialId[] {
  const text = jobText(job);
  const found: CredentialId[] = [];

  for (const def of CREDENTIAL_DEFS) {
    if (!jobRequires(def, text)) continue;
    if (isAssistantRole(def, text)) continue;
    found.push(def.id);
  }

  const set = new Set(found);

  // Specific therapy licence supersedes generic "therapist"
  if (
    set.has("allied_therapist") &&
    SPECIFIC_THERAPY.some((id) => set.has(id))
  ) {
    set.delete("allied_therapist");
  }

  // Beauty/spa is not clinical therapy
  if (/beauty|spa|massage|美容|水療|按摩|nail|aromatherap/i.test(text)) {
    set.delete("allied_therapist");
    set.delete("physiotherapist");
  }

  // "中醫" alone on non-TCM assistant posts already handled; avoid physician
  // if clearly TCM-only and physician not explicitly western
  if (
    set.has("tcm_practitioner") &&
    set.has("physician") &&
    !/西醫|physician|MBBS|medical\s*doctor/i.test(text) &&
    /中醫/.test(text) &&
    !/西醫|腫瘤|內科|外科/.test(text)
  ) {
    // Keep both if mixed hospital, else TCM only when only 中醫
    if (!/醫生|医师|医生/.test(text.replace(/中醫/g, ""))) {
      set.delete("physician");
    }
  }

  return [...set];
}

/** Credentials evidenced for the seeker. */
export function detectSeekerCredentials(
  youth: YouthProfile,
  cv?: CvFeatures | null
): CredentialId[] {
  const text = seekerText(youth, cv);
  const found: CredentialId[] = [];
  for (const def of CREDENTIAL_DEFS) {
    if (seekerHolds(def, text)) found.push(def.id);
  }
  return [...new Set(found)];
}

function seekerSatisfiesTherapy(held: CredentialId[]): boolean {
  return (
    held.includes("allied_therapist") ||
    SPECIFIC_THERAPY.some((id) => held.includes(id)) ||
    held.includes("physiotherapist")
  );
}

function label(id: CredentialId, lang: "en" | "zh"): string {
  const def = CREDENTIAL_DEFS.find((d) => d.id === id);
  if (!def) return id;
  return lang === "zh" ? def.labelZh : def.labelEn;
}

/**
 * Compare job credential requirements vs seeker evidence.
 * Missing regulated credentials → hard block (score collapse).
 */
export function assessCredentialFit(
  youth: YouthProfile,
  job: JobPosting,
  cv?: CvFeatures | null
): CredentialAssessment {
  const required = detectJobRequiredCredentials(job);
  const held = detectSeekerCredentials(youth, cv);
  const missing = required.filter((r) => {
    if (r === "allied_therapist") return !seekerSatisfiesTherapy(held);
    return !held.includes(r);
  });
  const matched = required.filter((r) => {
    if (r === "allied_therapist") return seekerSatisfiesTherapy(held);
    return held.includes(r);
  });

  const reasonsEn: string[] = [];
  const reasonsZh: string[] = [];
  let scoreDelta = 0;
  let hardBlock = false;

  if (required.length === 0) {
    return {
      required,
      held,
      missing,
      matched,
      hardBlock: false,
      scoreDelta: 0,
      reasonsEn: [],
      reasonsZh: [],
    };
  }

  if (matched.length > 0) {
    scoreDelta += 12 + matched.length * 8;
    const namesEn = matched.map((id) => label(id, "en")).join(", ");
    const namesZh = matched.map((id) => label(id, "zh")).join("、");
    reasonsEn.push(`Professional credential match: ${namesEn}`);
    reasonsZh.push(`專業資格吻合：${namesZh}`);
  }

  if (missing.length > 0) {
    hardBlock = true;
    scoreDelta -= 60;
    const namesEn = missing.map((id) => label(id, "en")).join(", ");
    const namesZh = missing.map((id) => label(id, "zh")).join("、");
    reasonsEn.push(
      `Role requires professional qualification not found on your CV: ${namesEn}. Language skills or sector interest are not a substitute.`
    );
    reasonsZh.push(
      `此職位需要專業執業資格，履歷未見相關證明：${namesZh}。語言能力或行業興趣不能替代專業資格。`
    );
  }

  if (hardBlock && (!cv || cv.textLength < 40)) {
    reasonsEn.push(
      "If you hold the licence/registration, add it explicitly on your CV and re-upload"
    );
    reasonsZh.push("如持有牌照／註冊，請在履歷中明確寫出並重新上傳");
  }

  scoreDelta = Math.max(-70, Math.min(30, scoreDelta));

  return {
    required,
    held,
    missing,
    matched,
    hardBlock,
    scoreDelta,
    reasonsEn,
    reasonsZh,
  };
}

export function credentialLabels(
  ids: CredentialId[],
  lang: "en" | "zh"
): string[] {
  return ids.map((id) => label(id, lang));
}
