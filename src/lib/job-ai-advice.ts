import type { JobPosting, Lang, YouthProfile } from "./types";
import type { EmployerWorkforce } from "./employer-transparency";
import type { SectorWageBenchmark } from "./wage-benchmark";
import {
  compareJobToBenchmark,
  formatDeviationPct,
  formatMop,
} from "./wage-benchmark";
import { matchJobsWithCv } from "./cv-match";
import type { CvFeatures } from "./cv-extract";
import { createXaiClient, isXaiConfigured, XAI_MODEL } from "./xai";
import type { AiVerdict, JobAiAdvice } from "./job-ai-types";
import { assessProfessionFit } from "./profession-fit";
import { isLanguageOrSoftSkill } from "./professional-credentials";

export type { AiVerdict, JobAiAdvice } from "./job-ai-types";

export interface JobAiAdviceInput {
  job: JobPosting;
  youth?: YouthProfile | null;
  lang: Lang;
  workforce?: EmployerWorkforce | null;
  benchmarks?: Record<string, SectorWageBenchmark> | null;
}

function asStringArray(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  return v.map((x) => String(x ?? "")).filter(Boolean);
}

function cvFeaturesFromYouth(youth?: YouthProfile | null): CvFeatures | null {
  if (!youth?.cv?.features) return null;
  const f = youth.cv.features as Record<string, unknown>;
  return {
    name: typeof f.name === "string" ? f.name : undefined,
    emails: asStringArray(f.emails),
    phones: asStringArray(f.phones),
    languages: asStringArray(f.languages),
    skills: asStringArray(f.skills),
    keywords: asStringArray(f.keywords),
    preferredSectors: (Array.isArray(f.preferredSectors)
      ? f.preferredSectors
      : []) as CvFeatures["preferredSectors"],
    preferredLanes: (Array.isArray(f.preferredLanes)
      ? f.preferredLanes
      : []) as CvFeatures["preferredLanes"],
    educationLevel: (f.educationLevel as CvFeatures["educationLevel"]) || null,
    educationHints: asStringArray(f.educationHints),
    isStudent: !!f.isStudent,
    experienceYears:
      typeof f.experienceYears === "number" ? f.experienceYears : null,
    districts: asStringArray(f.districts),
    summary: typeof f.summary === "string" ? f.summary : "",
    textLength: typeof f.textLength === "number" ? f.textLength : 0,
    careerStage:
      (f.careerStage as CvFeatures["careerStage"]) || "early_career",
    estimatedAge:
      typeof f.estimatedAge === "number" ? f.estimatedAge : null,
    researchInterests:
      typeof f.researchInterests === "string" ? f.researchInterests : undefined,
  };
}

/** Normalize youth so matchers never crash on missing arrays from localStorage. */
function safeYouth(youth?: YouthProfile | null): YouthProfile | null {
  if (!youth) return null;
  return {
    ...youth,
    skills: Array.isArray(youth.skills) ? youth.skills : [],
    languages: Array.isArray(youth.languages) ? youth.languages : [],
    preferredSectors: Array.isArray(youth.preferredSectors)
      ? youth.preferredSectors
      : [],
    preferredLanes: Array.isArray(youth.preferredLanes)
      ? youth.preferredLanes
      : [],
    bio: youth.bio || "",
    district: youth.district || "",
    availability: youth.availability || "",
  };
}

/** Normalize job payload so advice never crashes on sparse DSAL rows. */
function safeJob(job: JobPosting): JobPosting {
  return {
    ...job,
    title: job.title || "",
    titleZh: job.titleZh || job.title || "",
    company: job.company || "",
    companyZh: job.companyZh || job.company || "",
    languages: Array.isArray(job.languages) ? job.languages : [],
    requirements: Array.isArray(job.requirements) ? job.requirements : [],
    requirementsZh: Array.isArray(job.requirementsZh)
      ? job.requirementsZh
      : [],
    skills: Array.isArray(job.skills) ? job.skills : [],
    description: job.description || "",
    descriptionZh: job.descriptionZh || "",
    hoursPerWeek: job.hoursPerWeek || "",
    district: job.district || "",
    districtZh: job.districtZh || "",
  };
}

/** Compact fact pack sent to the LLM (and used by heuristic fallback). */
export function buildJobAdviceContext(input: JobAiAdviceInput) {
  const job = safeJob(input.job);
  const youth = safeYouth(input.youth);
  const { lang, workforce, benchmarks } = input;
  const cv = cvFeaturesFromYouth(youth);
  let cmp = null as ReturnType<typeof compareJobToBenchmark>;
  try {
    cmp =
      benchmarks && job.sector
        ? compareJobToBenchmark(
            job,
            benchmarks as Record<import("./types").Sector, SectorWageBenchmark>
          )
        : null;
  } catch {
    cmp = null;
  }

  let ruleMatchScore: number | undefined;
  if (youth) {
    try {
      const ranked = matchJobsWithCv(youth, [job], cv);
      ruleMatchScore = ranked[0]?.score;
    } catch {
      ruleMatchScore = undefined;
    }
  }

  let profession = null as ReturnType<typeof assessProfessionFit> | null;
  if (youth) {
    try {
      profession = assessProfessionFit(youth, job, cv);
    } catch {
      profession = null;
    }
  }

  return {
    lang,
    ruleMatchScore,
    professionFit: profession
      ? {
          seekerDomains: profession.seekerDomains,
          jobDomains: profession.jobDomains,
          hardMismatch: profession.hardMismatch,
          credentialBlock: profession.credentialBlock,
          compatible: profession.compatible,
          scoreDelta: profession.scoreDelta,
          requiredCredentials: profession.credentials?.required || [],
          heldCredentials: profession.credentials?.held || [],
          missingCredentials: profession.credentials?.missing || [],
          notes: profession.reasonsEn,
        }
      : null,
    job: {
      id: job.id,
      title: job.title,
      titleZh: job.titleZh,
      company: job.company,
      companyZh: job.companyZh,
      sector: job.sector,
      lane: job.lane,
      district: job.district,
      districtZh: job.districtZh,
      payMin: job.payMin,
      payMax: job.payMax,
      payUnit: job.payUnit,
      salaryRaw: job.salaryRaw,
      hoursPerWeek: job.hoursPerWeek,
      languages: job.languages,
      description: (job.description || "").slice(0, 1200),
      descriptionZh: (job.descriptionZh || "").slice(0, 1200),
      requirements: job.requirements?.slice(0, 12) || [],
      requirementsZh: job.requirementsZh?.slice(0, 12) || [],
      skills: job.skills || [],
      youthFriendly: job.youthFriendly,
      minorAllowed: job.minorAllowed,
      trainingProvided: job.trainingProvided,
      source: job.source,
      officialNo: job.officialNo,
    },
    payBenchmark: cmp
      ? {
          hasListingPay: cmp.hasListingPay,
          listingMidMonthly: cmp.listingMidMonthly,
          benchmarkMonthly: cmp.benchmarkMonthly,
          deviationPct: Math.round(cmp.deviationPct * 10) / 10,
          deviationLabel: formatDeviationPct(cmp.deviationPct),
          method: cmp.benchmark.method,
          sampleSize: cmp.benchmark.sampleSize,
          p25: cmp.benchmark.p25Monthly,
          p75: cmp.benchmark.p75Monthly,
          benchmarkDisplay: formatMop(cmp.benchmarkMonthly, "monthly"),
        }
      : null,
    workforce: workforce
      ? {
          name: workforce.name,
          nameZh: workforce.nameZh,
          totalEmployees: workforce.totalEmployees,
          localEmployees: workforce.localEmployees,
          foreignEmployees: workforce.foreignEmployees,
          localSharePct: workforce.localSharePct,
          foreignSharePct: workforce.foreignSharePct,
          confidence: workforce.confidence,
          asOf: workforce.asOf,
          source: workforce.source,
          note: workforce.note,
          entityCount: workforce.entityCount ?? 1,
          groupLabel: workforce.groupLabel,
          groupLabelZh: workforce.groupLabelZh,
          isGroupAggregate: (workforce.entityCount ?? 1) > 1,
          topMembers: (workforce.members || []).slice(0, 5).map((m) => ({
            name: m.nameZh || m.namePt,
            local: m.residents,
            foreign: m.foreignTotal,
          })),
        }
      : null,
    seeker: youth
      ? {
          name: youth.name,
          age: youth.age,
          isStudent: youth.isStudent,
          languages: youth.languages,
          skills: youth.skills,
          preferredLanes: youth.preferredLanes,
          preferredSectors: youth.preferredSectors,
          availability: youth.availability,
          district: youth.district,
          bio: (youth.bio || "").slice(0, 400),
          hasCv: !!youth.cv,
          cvFileName: youth.cv?.fileName,
          cvSummary: (youth.cv?.features?.summary || "").slice(0, 500),
          cvSkills: youth.cv?.features?.skills?.slice(0, 20) || [],
          cvKeywords: youth.cv?.features?.keywords?.slice(0, 25) || [],
          educationLevel: youth.cv?.features?.educationLevel,
          educationHints: youth.cv?.features?.educationHints?.slice(0, 8) || [],
          experienceYears: youth.cv?.features?.experienceYears,
          careerStage: youth.cv?.features?.careerStage,
          researchInterests: (
            youth.cv?.features?.researchInterests || ""
          ).slice(0, 300),
        }
      : null,
  };
}

function systemPrompt(lang: Lang): string {
  const langLine =
    lang === "zh"
      ? "Respond entirely in Traditional Chinese (繁體中文)."
      : "Respond entirely in clear English.";

  return `You are jOOB career coach for Macau youth job seekers (teens to young adults).
Your job: summarise ONE vacancy using ONLY the structured facts provided, then advise whether it is a good fit for THIS seeker's profile/CV.

${langLine}

Rules:
- Be honest and practical. Do not invent employer contacts, salaries, or legal claims.
- PROFESSION FIRST: match the seeker's profession, education field, and skills to the job's occupation.
  Example: a Statistics / Data PhD is NOT a fit for Tea Master, barista, waiter, or similar craft F&B roles — score low (≤30) and verdict not_recommended or weak_fit unless the seeker explicitly targets hospitality.
- REGULATED CREDENTIALS: doctors, nurses, physiotherapists, psychologists, lawyers, CPAs, etc. require specific licences/registrations.
  When professionFit.credentialBlock is true or missingCredentials is non-empty, fitScore MUST be ≤ 20 and verdict not_recommended — keyword similarity is NOT enough.
  When required credentials are matched on the CV, state that clearly as a pro.
- When professionFit.hardMismatch is true, fitScore must be ≤ 30 and verdict must be not_recommended or weak_fit.
- Prefer jobs where seekerDomains overlap jobDomains and skillsAligned is non-empty.
- Use workforce (local vs non-resident) and pay-benchmark deviation when present — secondary to profession fit.
- If no seeker profile is provided, give a general summary and say personalisation needs a profile/CV.
- Macau context: information asymmetry, local vs non-resident labour mix, youth-friendly entry roles matter.
- fitScore is 0–100 integer. Start from ruleMatchScore when provided; never score high on profession-mismatched roles.
- verdict: strong_fit | possible | weak_fit | not_recommended
- Keep lists short (3–5 bullets max each).
- summary must be 1–2 short sentences about FIT ONLY (do not repeat full pay figures, workforce tables, or company headcounts — those go in payTake / workforceTake).
- payTake: concise pay vs benchmark only.
- workforceTake: if group entityCount > 1, say it is a group total across N legal entities.
- Output ONLY valid JSON matching the schema — no markdown fences.`;
}

function userPrompt(ctx: ReturnType<typeof buildJobAdviceContext>): string {
  return `Analyse this Macau job for the seeker.

FACTS (JSON):
${JSON.stringify(ctx, null, 2)}

Return JSON with this exact shape:
{
  "headline": "string (one line verdict title)",
  "summary": "string (2–4 sentences covering role, pay, employer workforce if any, fit)",
  "fitScore": 0,
  "verdict": "strong_fit|possible|weak_fit|not_recommended",
  "pros": ["..."],
  "cons": ["..."],
  "payTake": "string",
  "workforceTake": "string",
  "skillsAligned": ["..."],
  "skillsGap": ["..."],
  "actionTips": ["..."]
}`;
}

function parseAdviceJson(raw: string): Omit<
  JobAiAdvice,
  "provider" | "generatedAt" | "model" | "ruleMatchScore"
> {
  let text = raw.trim();
  // strip accidental fences
  if (text.startsWith("```")) {
    text = text.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  }
  const data = JSON.parse(text) as Record<string, unknown>;
  const verdict = String(data.verdict || "possible") as AiVerdict;
  const allowed: AiVerdict[] = [
    "strong_fit",
    "possible",
    "weak_fit",
    "not_recommended",
  ];
  const arr = (v: unknown) =>
    Array.isArray(v) ? v.map(String).filter(Boolean).slice(0, 6) : [];

  return {
    headline: String(data.headline || "Job advice"),
    summary: String(data.summary || ""),
    fitScore: Math.max(
      0,
      Math.min(100, Math.round(Number(data.fitScore) || 0))
    ),
    verdict: allowed.includes(verdict) ? verdict : "possible",
    pros: arr(data.pros),
    cons: arr(data.cons),
    payTake: String(data.payTake || ""),
    workforceTake: String(data.workforceTake || ""),
    skillsAligned: arr(data.skillsAligned),
    skillsGap: arr(data.skillsGap),
    actionTips: arr(data.actionTips),
  };
}

/** Heuristic summary when XAI_API_KEY is missing (demo still works). */
export function buildHeuristicAdvice(
  input: JobAiAdviceInput
): JobAiAdvice {
  const job = safeJob(input.job);
  const youth = safeYouth(input.youth);
  const lang = input.lang;
  const ctx = buildJobAdviceContext({ ...input, job, youth });
  const zh = lang === "zh";
  const title = zh ? job.titleZh : job.title;
  const company = zh ? job.companyZh : job.company;
  let score = ctx.ruleMatchScore ?? (youth ? 45 : 50);
  const prof = youth
    ? assessProfessionFit(youth, job, cvFeaturesFromYouth(youth))
    : null;
  if (prof?.credentialBlock) {
    score = Math.min(score, 18);
  } else if (prof?.hardMismatch) {
    score = Math.min(score, 24);
  } else if (prof && prof.scoreDelta < -15) {
    score = Math.min(score, 40);
  }

  const pay = ctx.payBenchmark;
  const wf = ctx.workforce;

  let payTake = zh
    ? "未提供可比較薪酬，或尚無有效行業基準。"
    : "No comparable pay signal, or sector benchmark unavailable.";
  if (pay?.hasListingPay) {
    payTake = zh
      ? `職缺中點約 MOP ${pay.listingMidMonthly.toLocaleString()}/月，相對行業基準 ${pay.deviationLabel}（基準 ${pay.benchmarkDisplay}）。`
      : `Listing midpoint ≈ MOP ${pay.listingMidMonthly.toLocaleString()}/mo, ${pay.deviationLabel} vs sector median (${pay.benchmarkDisplay}).`;
  }

  let workforceTake = zh
    ? "未配對到企業人手（本地／外地僱員）官方數據。"
    : "No matched firm-level local/non-resident workforce data.";
  if (wf) {
    const isReported = wf.confidence === "reported";
    const isBenchmark = wf.confidence === "sector_benchmark";
    const nEnt = isReported && wf.entityCount && wf.entityCount > 1
      ? wf.entityCount
      : 0;
    const displayCo = zh
      ? company || wf.nameZh || wf.name
      : company || wf.name;
    const scopeLine = isBenchmark
      ? zh
        ? "行業基準（A3 無此公司實體匹配）"
        : "Sector benchmark (no firm-level A3 match)"
      : nEnt
        ? zh
          ? `已合併 ${nEnt} 個勞工局 A3 法人實體`
          : `Summed across ${nEnt} DSAL A3 legal entities`
        : isReported
          ? zh
            ? "單一 A3 法人實體"
            : "Single A3 legal entity"
          : zh
            ? "估算／名錄數據"
            : "Estimated / registry data";
    workforceTake = zh
      ? [
          `僱主：${displayCo}`,
          `總僱員 ${wf.totalEmployees?.toLocaleString() ?? "—"} · 本地 ${wf.localEmployees?.toLocaleString() ?? "—"}（${wf.localSharePct ?? "—"}%）· 外地 ${wf.foreignEmployees?.toLocaleString() ?? "—"}（${wf.foreignSharePct ?? "—"}%）`,
          scopeLine,
          `資料：${wf.confidence} · ${wf.asOf}`,
        ].join("\n")
      : [
          `Employer: ${displayCo}`,
          `Total ${wf.totalEmployees?.toLocaleString() ?? "—"} · local ${wf.localEmployees?.toLocaleString() ?? "—"} (${wf.localSharePct ?? "—"}%) · non-resident ${wf.foreignEmployees?.toLocaleString() ?? "—"} (${wf.foreignSharePct ?? "—"}%)`,
          scopeLine,
          `Source: ${wf.confidence} · ${wf.asOf}`,
        ].join("\n");
  }

  // Short fit narrative only — UI shows role/pay/workforce in separate cards
  const summary = zh
    ? youth
      ? prof?.credentialBlock || prof?.hardMismatch
        ? `以你目前檔案／履歷，此職位適合度偏低（約 ${score} 分）。請先核對專業資格與技能是否真正符合職位要求。`
        : `綜合你的檔案與履歷，此「${title}」職位適合度約 ${score} 分。請一併參考下方薪酬與僱主人手結構再決定是否申請。`
      : `「${title}」於 ${company} 的職位速覽。建立檔案或上傳履歷後可獲得個人化適合度評估。`
    : youth
      ? prof?.credentialBlock || prof?.hardMismatch
        ? `Based on your profile/CV, this role is a weak fit (score ≈ ${score}). Check professional qualifications and skills against the job requirements first.`
        : `Based on your profile and CV, fit for “${title}” is about ${score}/100. Review pay and employer workforce sections below before applying.`
      : `Snapshot of “${title}” at ${company}. Build a profile or upload a CV for personalised fit scoring.`;

  const seekerSkills = new Set(
    [
      ...(youth?.skills || []),
      ...(Array.isArray(youth?.cv?.features?.skills)
        ? youth!.cv!.features!.skills
        : []),
    ]
      .map((s) => String(s).toLowerCase())
      .filter((s) => s && !isLanguageOrSoftSkill(s))
  );
  const jobSkills = (job.skills || [])
    .map((s) => String(s).toLowerCase())
    .filter((s) => s && !isLanguageOrSoftSkill(s));
  const skillsAligned = jobSkills.filter((s) => seekerSkills.has(s)).slice(0, 5);
  const skillsGap = jobSkills.filter((s) => !seekerSkills.has(s)).slice(0, 5);

  let verdict: AiVerdict = "possible";
  if (prof?.credentialBlock || prof?.hardMismatch) verdict = "not_recommended";
  else if (score >= 72) verdict = "strong_fit";
  else if (score >= 50) verdict = "possible";
  else if (score >= 35) verdict = "weak_fit";
  else verdict = "not_recommended";

  if (!youth) verdict = "possible";

  const pros: string[] = [];
  const cons: string[] = [];
  // Only claim domain align when domains actually intersect and no credential block
  const domainHits =
    prof?.seekerDomains.filter(
      (d) => d !== "unknown" && prof.jobDomains.includes(d)
    ) || [];
  if (
    prof &&
    !prof.hardMismatch &&
    !prof.credentialBlock &&
    domainHits.length > 0
  ) {
    pros.push(
      zh
        ? `職業領域吻合：${domainHits.join("、")}`
        : `Profession domain match: ${domainHits.join(", ")}`
    );
  }
  if (job.youthFriendly && !prof?.hardMismatch)
    pros.push(zh ? "標示為青年友善" : "Marked youth-friendly");
  if (job.trainingProvided)
    pros.push(zh ? "提供培訓" : "Training provided");
  if (job.source === "dsal" && !prof?.hardMismatch)
    pros.push(zh ? "勞工局官方空缺" : "Official DSAL vacancy");
  if (pay?.hasListingPay && pay.deviationPct >= 0 && !prof?.hardMismatch)
    pros.push(zh ? "薪酬不低於行業基準中點" : "Pay not below sector median midpoint");
  if (prof?.credentialBlock || prof?.hardMismatch)
    cons.push(
      zh
        ? prof.reasonsZh[0] ||
            (prof.credentialBlock
              ? "缺少職位所需專業執業資格"
              : "職業／專業與職位嚴重錯配")
        : prof.reasonsEn[0] ||
            (prof.credentialBlock
              ? "Missing required professional licence / registration"
              : "Profession / field badly mismatched to this role")
    );
  if (pay?.hasListingPay && pay.deviationPct < -15)
    cons.push(zh ? "薪酬明顯低於行業基準" : "Pay well below sector benchmark");
  if (wf && (wf.foreignSharePct ?? 0) > 40)
    cons.push(
      zh
        ? "外地僱員佔比較高——留意本地晉升機會"
        : "High non-resident share — check local progression paths"
    );
  if (skillsGap.length)
    cons.push(
      zh
        ? `技能差距：${skillsGap.slice(0, 3).join("、")}`
        : `Skills gap: ${skillsGap.slice(0, 3).join(", ")}`
    );
  if (!youth)
    cons.push(
      zh
        ? "尚未建立個人檔案／履歷，無法精準個人化"
        : "No profile/CV yet — advice is not personalised"
    );

  return {
    headline: zh
      ? youth
        ? `適合度約 ${score} — ${verdictLabel(verdict, "zh")}`
        : `職位速覽（尚未個人化）`
      : youth
        ? `Fit ≈ ${score} — ${verdictLabel(verdict, "en")}`
        : `Job snapshot (not personalised)`,
    summary,
    fitScore: score,
    verdict,
    pros: pros.slice(0, 5),
    cons: cons.slice(0, 5),
    payTake,
    workforceTake,
    skillsAligned,
    skillsGap,
    actionTips: zh
      ? [
          "對照空缺要求更新履歷關鍵字",
          "若薪酬偏低，申請時詢問津貼／培訓路徑",
          wf
            ? "查閱僱主本地 vs 外地僱員比例後再決定"
            : "向僱主詢問團隊本地僱員比例",
        ]
      : [
          "Tune your CV keywords to the requirements",
          "If pay is low, ask about allowances and training path",
          wf
            ? "Factor local vs non-resident workforce mix into your decision"
            : "Ask the employer about local hiring share",
        ],
    ruleMatchScore: ctx.ruleMatchScore,
    provider: "heuristic",
    generatedAt: new Date().toISOString(),
  };
}

function verdictLabel(v: AiVerdict, lang: "en" | "zh") {
  const en: Record<AiVerdict, string> = {
    strong_fit: "Strong fit",
    possible: "Possible fit",
    weak_fit: "Weak fit",
    not_recommended: "Not recommended",
  };
  const zhMap: Record<AiVerdict, string> = {
    strong_fit: "高度適合",
    possible: "可以考慮",
    weak_fit: "適合度偏低",
    not_recommended: "暫不建議",
  };
  return lang === "zh" ? zhMap[v] : en[v];
}

/**
 * Generate job advice via xAI Grok when configured; otherwise heuristic.
 */
export async function generateJobAiAdvice(
  input: JobAiAdviceInput
): Promise<JobAiAdvice> {
  const safeInput: JobAiAdviceInput = {
    ...input,
    job: safeJob(input.job),
    youth: safeYouth(input.youth),
  };

  let ctx: ReturnType<typeof buildJobAdviceContext>;
  try {
    ctx = buildJobAdviceContext(safeInput);
  } catch (err) {
    // Last-resort: still return a usable card rather than 500
    const msg = err instanceof Error ? err.message : "context error";
    return {
      headline:
        safeInput.lang === "zh" ? "職位速覽（簡化）" : "Job snapshot (simplified)",
      summary:
        safeInput.lang === "zh"
          ? `無法完整計算適合度（${msg}）。請確認已建立檔案／履歷後重試。`
          : `Could not fully score fit (${msg}). Ensure profile/CV is saved and retry.`,
      fitScore: 40,
      verdict: "possible",
      pros: [],
      cons: [
        safeInput.lang === "zh"
          ? "部分配對資料缺失"
          : "Some match data was missing",
      ],
      payTake: "",
      workforceTake: "",
      skillsAligned: [],
      skillsGap: [],
      actionTips: [
        safeInput.lang === "zh"
          ? "重新整理頁面後再試"
          : "Refresh the page and try again",
      ],
      provider: "heuristic",
      generatedAt: new Date().toISOString(),
    };
  }

  if (!isXaiConfigured()) {
    return buildHeuristicAdvice(safeInput);
  }

  const client = createXaiClient();
  if (!client) return buildHeuristicAdvice(safeInput);

  try {
    const completion = await client.chat.completions.create({
      model: XAI_MODEL,
      temperature: 0.35,
      max_tokens: 1200,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: systemPrompt(safeInput.lang) },
        { role: "user", content: userPrompt(ctx) },
      ],
    });

    const content = completion?.choices?.[0]?.message?.content;
    if (!content) throw new Error("Empty model response");

    const parsed = parseAdviceJson(content);
    return {
      ...parsed,
      ruleMatchScore: ctx.ruleMatchScore,
      model: completion.model || XAI_MODEL,
      provider: "xai",
      generatedAt: new Date().toISOString(),
    };
  } catch (err) {
    // Soft fallback so UI never dies if the API is down / key invalid
    const fallback = buildHeuristicAdvice(safeInput);
    const msg = err instanceof Error ? err.message : "LLM error";
    return {
      ...fallback,
      headline:
        safeInput.lang === "zh"
          ? `（離線摘要）${fallback.headline}`
          : `(Offline summary) ${fallback.headline}`,
      summary: `${fallback.summary}\n\n[${safeInput.lang === "zh" ? "AI 暫時不可用" : "AI temporarily unavailable"}: ${msg}]`,
      provider: "heuristic",
      model: undefined,
    };
  }
}

export { verdictLabel };
