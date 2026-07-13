/**
 * Expected salary / negotiation guide for Macau youth job seekers.
 * Combines market benchmarks, listed pay, and seeker profile via LLM (or heuristic).
 */

import type { JobPosting, Lang, YouthProfile } from "./types";
import {
  compareJobToBenchmark,
  formatMop,
  STANDARD_MONTHLY_HOURS,
  type SectorWageBenchmark,
} from "./wage-benchmark";
import { createXaiClient, isXaiConfigured, XAI_MODEL } from "./xai";

export interface SalaryNegotiateAdvice {
  /** Unit for the proposed numbers */
  unit: "monthly" | "hourly";
  /** Conservative floor (walk-away below this is optional) */
  proposeLow: number;
  /** Main ask — what to put as “expected salary” */
  proposeTarget: number;
  /** Optimistic ceiling if they push */
  proposeHigh: number;
  /** One-line headline */
  headline: string;
  /** Short proposal sentence to say/write */
  proposalScript: string;
  /**
   * Numbered thinking process for the seeker — how we combined
   * market + listing + their profile into the numbers.
   */
  thinkingSteps: string[];
  /** Profile strengths that support the ask */
  profileStrengths: string[];
  /** Gaps / risks that argue for a softer ask */
  profileGaps: string[];
  /** Practical negotiation tips */
  tips: string[];
  /** Market context summary */
  marketNote: string;
  /** Confidence of the recommendation */
  confidence: "high" | "medium" | "low";
  provider: "xai" | "heuristic";
  model?: string;
  generatedAt: string;
}

function roundMop(n: number, unit: "monthly" | "hourly"): number {
  if (unit === "hourly") return Math.round(n);
  // monthly: nearest 100 MOP
  return Math.round(n / 100) * 100;
}

function educationBoost(level: string | null | undefined): number {
  switch (level) {
    case "phd":
      return 0.12;
    case "master":
      return 0.08;
    case "bachelor":
      return 0.04;
    case "vocational":
      return 0.02;
    case "secondary":
      return -0.03;
    default:
      return 0;
  }
}

function experienceBoost(years: number | null | undefined): number {
  if (years == null) return 0;
  if (years >= 5) return 0.1;
  if (years >= 3) return 0.06;
  if (years >= 1) return 0.03;
  if (years >= 0.5) return 0.01;
  return -0.02;
}

function skillOverlapBoost(job: JobPosting, youth: YouthProfile | null): number {
  if (!youth) return 0;
  const mine = new Set(
    [
      ...(youth.skills || []),
      ...(youth.cv?.features?.skills || []),
      ...(youth.cv?.features?.keywords || []).slice(0, 15),
    ]
      .map((s) => s.toLowerCase().trim())
      .filter((s) => s.length >= 2)
  );
  const jobSkills = (job.skills || []).map((s) => s.toLowerCase());
  if (jobSkills.length === 0) return 0;
  let hits = 0;
  for (const s of jobSkills) {
    if ([...mine].some((m) => m.includes(s) || s.includes(m))) hits++;
  }
  const ratio = hits / jobSkills.length;
  if (ratio >= 0.5) return 0.05;
  if (ratio >= 0.25) return 0.02;
  if (hits === 0 && jobSkills.length >= 2) return -0.04;
  return 0;
}

export function buildHeuristicSalaryAdvice(input: {
  job: JobPosting;
  youth: YouthProfile | null;
  lang: Lang;
  benchmarks: Record<string, SectorWageBenchmark>;
}): SalaryNegotiateAdvice {
  const { job, youth, lang, benchmarks } = input;
  const zh = lang === "zh";
  const unit = job.payUnit === "hourly" ? "hourly" : "monthly";
  const cmp = compareJobToBenchmark(
    job,
    benchmarks as Record<import("./types").Sector, SectorWageBenchmark>
  );
  const marketMonthly = cmp?.benchmark.medianMonthly ?? 14000;
  const market =
    unit === "hourly"
      ? marketMonthly / STANDARD_MONTHLY_HOURS
      : marketMonthly;
  const listingMid = cmp?.hasListingPay
    ? unit === "hourly"
      ? cmp.listingMidMonthly / STANDARD_MONTHLY_HOURS
      : cmp.listingMidMonthly
    : null;
  const listingLow = cmp?.hasListingPay
    ? unit === "hourly"
      ? cmp.listingMinMonthly / STANDARD_MONTHLY_HOURS
      : cmp.listingMinMonthly
    : null;
  const listingHigh = cmp?.hasListingPay
    ? unit === "hourly"
      ? cmp.listingMaxMonthly / STANDARD_MONTHLY_HOURS
      : cmp.listingMaxMonthly
    : null;

  const edu = educationBoost(youth?.cv?.features?.educationLevel);
  const exp = experienceBoost(youth?.cv?.features?.experienceYears ?? null);
  const skill = skillOverlapBoost(job, youth);
  const studentDrag =
    youth?.isStudent && (job.lane === "full-time" || job.lane === "internship")
      ? -0.03
      : 0;
  const youthBoost = job.youthFriendly ? 0.01 : 0;

  const adj = edu + exp + skill + studentDrag + youthBoost;
  // Start from market, blend toward listing band when present
  let target = market * (1 + adj);
  if (listingMid != null) {
    // Don't ignore the ad: 55% listing mid + 45% adjusted market
    target = listingMid * 0.55 + market * (1 + adj) * 0.45;
    // Stay near the posted band when one exists
    if (listingLow != null && listingHigh != null) {
      const bandLow = listingLow * 0.95;
      const bandHigh = listingHigh * 1.08;
      target = Math.min(bandHigh, Math.max(bandLow * 0.98, target));
    }
  }

  let low = target * 0.92;
  let high = target * 1.08;
  if (listingLow != null) low = Math.max(low, listingLow * 0.9);
  if (listingHigh != null) high = Math.min(high, listingHigh * 1.12);

  const proposeTarget = roundMop(target, unit);
  const proposeLow = roundMop(low, unit);
  const proposeHigh = roundMop(Math.max(high, target * 1.05), unit);

  const strengths: string[] = [];
  const gaps: string[] = [];
  if (edu >= 0.04)
    strengths.push(
      zh
        ? `學歷優勢（${youth?.cv?.features?.educationLevel}）支持略高於市場中位的要價`
        : `Education level (${youth?.cv?.features?.educationLevel}) supports asking slightly above market median`
    );
  if (exp >= 0.03)
    strengths.push(
      zh
        ? `相關經驗約 ${youth?.cv?.features?.experienceYears} 年，可作為談判籌碼`
        : `~${youth?.cv?.features?.experienceYears} years’ experience is a negotiation chip`
    );
  if (skill > 0)
    strengths.push(
      zh
        ? "技能與職缺標籤有重疊，值得在要價時點名"
        : "Skill overlap with the posting — name those skills when stating your ask"
    );
  if (skill < 0)
    gaps.push(
      zh
        ? "技能標籤重疊偏低——要價宜靠近職缺中點，並強調學習速度"
        : "Low skill-tag overlap — stay near listing midpoint and stress learning speed"
    );
  if (edu < 0)
    gaps.push(
      zh
        ? "學歷相對市場一般要求偏基礎——保守要價較穩妥"
        : "Education is more entry-level for this market — a conservative ask is safer"
    );
  if (!youth)
    gaps.push(
      zh
        ? "尚未建立個人檔案——建議先完善履歷再微調要價"
        : "No profile yet — refine the ask after you complete your CV/profile"
    );
  if (listingMid != null && cmp && cmp.deviationPct < -15)
    gaps.push(
      zh
        ? "職缺標價明顯低於行業中位——期望薪可溫和高於標價，但需準備理由"
        : "Listed pay is well below sector median — you may ask mildly above the ad, with reasons ready"
    );

  const thinkingSteps = zh
    ? [
        `市場基準：以本行業薪酬中位約 ${formatMop(marketMonthly, "monthly")}（${cmp?.benchmark.method === "dsal_sample" ? `勞工局樣本 n=${cmp.benchmark.sampleSize}` : "統計式參考"}）作為起點。`,
        listingMid != null
          ? `職缺標示：中點約 ${formatMop(Math.round(listingMid * (unit === "hourly" ? STANDARD_MONTHLY_HOURS : 1)), unit === "hourly" ? "hourly" : "monthly")}（區間 ${listingLow != null ? Math.round(listingLow) : "—"}–${listingHigh != null ? Math.round(listingHigh) : "—"}），談判不宜離廣告太遠。`
          : "職缺未標清晰薪酬——更依賴行業基準與你的資歷。",
        youth
          ? `你的資歷調整：學歷 ${youth.cv?.features?.educationLevel || "未填"}（${edu >= 0 ? "+" : ""}${Math.round(edu * 100)}%）、經驗 ${youth.cv?.features?.experienceYears ?? "未填"} 年（${exp >= 0 ? "+" : ""}${Math.round(exp * 100)}%）、技能重疊（${skill >= 0 ? "+" : ""}${Math.round(skill * 100)}%）。`
          : "未載入檔案——僅用市場與職缺標價，建議建立檔案後再算一次。",
        `綜合後建議期望薪（主報價）${proposeTarget.toLocaleString()} ${unit === "hourly" ? "MOP/時" : "MOP/月"}，可談區間 ${proposeLow.toLocaleString()}–${proposeHigh.toLocaleString()}。`,
        "填表時可寫區間或單一目標；面試時先聽對方預算，再提出你的目標與依據。",
      ]
    : [
        `Market anchor: sector median ≈ ${formatMop(marketMonthly, "monthly")} (${cmp?.benchmark.method === "dsal_sample" ? `DSAL sample n=${cmp.benchmark.sampleSize}` : "statistical reference"}).`,
        listingMid != null
          ? `Listing midpoint ≈ ${Math.round(listingMid).toLocaleString()} ${unit === "hourly" ? "MOP/hr" : "MOP/mo"} (band ${listingLow != null ? Math.round(listingLow) : "—"}–${listingHigh != null ? Math.round(listingHigh) : "—"}). Stay near the ad when negotiating.`
          : "No clear listed pay — lean more on market median and your credentials.",
        youth
          ? `Your profile adjustments: education ${youth.cv?.features?.educationLevel || "n/a"} (${edu >= 0 ? "+" : ""}${Math.round(edu * 100)}%), experience ${youth.cv?.features?.experienceYears ?? "n/a"}y (${exp >= 0 ? "+" : ""}${Math.round(exp * 100)}%), skill overlap (${skill >= 0 ? "+" : ""}${Math.round(skill * 100)}%).`
          : "No profile loaded — market + listing only; re-run after you save a profile/CV.",
        `Combined expected salary (main ask): ${proposeTarget.toLocaleString()} ${unit === "hourly" ? "MOP/hr" : "MOP/mo"}, discussable range ${proposeLow.toLocaleString()}–${proposeHigh.toLocaleString()}.`,
        "On forms you can write a range or one target; in interview, hear their budget first, then state your target with reasons.",
      ];

  const unitLabel = unit === "hourly" ? (zh ? "時薪" : "hourly") : zh ? "月薪" : "monthly";
  const headline = zh
    ? `建議期望${unitLabel}：MOP ${proposeTarget.toLocaleString()}`
    : `Suggested expected ${unitLabel}: MOP ${proposeTarget.toLocaleString()}`;

  const proposalScript = zh
    ? `根據行業中位與本人學歷／經驗／技能匹配，期望${unitLabel}約 MOP ${proposeTarget.toLocaleString()}（可談區間 ${proposeLow.toLocaleString()}–${proposeHigh.toLocaleString()}）。`
    : `Based on sector median and my education, experience, and skill fit, my expected ${unitLabel} is about MOP ${proposeTarget.toLocaleString()} (flexible ${proposeLow.toLocaleString()}–${proposeHigh.toLocaleString()}).`;

  const marketNote = zh
    ? `行業中位約 ${formatMop(marketMonthly)}；${listingMid != null ? `職缺中點約 MOP ${Math.round(listingMid * (unit === "hourly" ? STANDARD_MONTHLY_HOURS : 1)).toLocaleString()}/月等值。` : "職缺未標薪酬。"}`
    : `Sector median ≈ ${formatMop(marketMonthly)}; ${listingMid != null ? `listing mid ≈ MOP ${Math.round(listingMid * (unit === "hourly" ? STANDARD_MONTHLY_HOURS : 1)).toLocaleString()}/mo equivalent.` : "no listed pay."}`;

  let confidence: SalaryNegotiateAdvice["confidence"] = "medium";
  if (!youth && listingMid == null) confidence = "low";
  else if (youth?.cv?.features && cmp?.benchmark.method === "dsal_sample")
    confidence = "high";
  else if (!youth || listingMid == null) confidence = "medium";

  return {
    unit,
    proposeLow,
    proposeTarget,
    proposeHigh,
    headline,
    proposalScript,
    thinkingSteps,
    profileStrengths: strengths.slice(0, 5),
    profileGaps: gaps.slice(0, 5),
    tips: zh
      ? [
          "先報「目標＋區間」，避免只報一個過高數字",
          "把培訓、津貼、交通、年假算進總回報",
          "若對方低於你的底線，問可否 3–6 個月後調薪",
        ]
      : [
          "State a target plus a range — not a single high number only",
          "Count training, allowances, transport, leave as total package",
          "If they land below your floor, ask for a 3–6 month review",
        ],
    marketNote,
    confidence,
    provider: "heuristic",
    generatedAt: new Date().toISOString(),
  };
}

function parseJson(raw: string): Record<string, unknown> {
  let text = raw.trim();
  if (text.startsWith("```")) {
    text = text.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  }
  return JSON.parse(text) as Record<string, unknown>;
}

function asStrings(v: unknown, max = 8): string[] {
  if (!Array.isArray(v)) return [];
  return v.map(String).filter(Boolean).slice(0, max);
}

export async function generateSalaryNegotiateAdvice(input: {
  job: JobPosting;
  youth: YouthProfile | null;
  lang: Lang;
  benchmarks: Record<string, SectorWageBenchmark>;
}): Promise<SalaryNegotiateAdvice> {
  const base = buildHeuristicSalaryAdvice(input);
  if (!isXaiConfigured()) return base;
  const client = createXaiClient();
  if (!client) return base;

  const zh = input.lang === "zh";
  const cmp = compareJobToBenchmark(
    input.job,
    input.benchmarks as Record<import("./types").Sector, SectorWageBenchmark>
  );

  const system = zh
    ? `你是 jOOB 澳門青年求職薪酬顧問。根據職缺、行業基準與求職者檔案，給出合理的「期望薪」建議，並用清楚步驟解釋思考過程。
規則：
- 數字必須合理，貼近澳門 MOP 市場；月薪以百位取整，時薪取整。
- 必須結合：行業中位、職缺標價（如有）、學歷、經驗年數、技能重疊、是否在學。
- thinkingSteps 用 4–6 步、完整句子，像教求職者如何想，不要空洞口號。
- 不要假裝保證錄取或保證薪資。
- 只輸出 JSON。`
    : `You are jOOB's Macau youth salary coach. Using the job, sector benchmark, and seeker profile, recommend a reasonable expected salary and explain the thinking process in clear steps.
Rules:
- Numbers must be realistic for Macau MOP; round monthly to nearest 100, hourly to whole MOP.
- Must combine: sector median, listed pay (if any), education, years of experience, skill overlap, student status.
- thinkingSteps: 4–6 full sentences teaching the seeker how the number was derived — not empty slogans.
- Do not promise offers or guaranteed pay.
- JSON only.`;

  const user = `Language: ${input.lang}

JOB:
${JSON.stringify(
  {
    title: input.job.title,
    titleZh: input.job.titleZh,
    company: input.job.company,
    sector: input.job.sector,
    lane: input.job.lane,
    payMin: input.job.payMin,
    payMax: input.job.payMax,
    payUnit: input.job.payUnit,
    skills: input.job.skills,
    requirements: input.job.requirements?.slice(0, 8),
    youthFriendly: input.job.youthFriendly,
    source: input.job.source,
  },
  null,
  2
)}

MARKET_BENCHMARK:
${JSON.stringify(
  cmp
    ? {
        medianMonthly: cmp.benchmark.medianMonthly,
        p25: cmp.benchmark.p25Monthly,
        p75: cmp.benchmark.p75Monthly,
        method: cmp.benchmark.method,
        sampleSize: cmp.benchmark.sampleSize,
        listingMidMonthly: cmp.hasListingPay ? cmp.listingMidMonthly : null,
        listingMinMonthly: cmp.hasListingPay ? cmp.listingMinMonthly : null,
        listingMaxMonthly: cmp.hasListingPay ? cmp.listingMaxMonthly : null,
        deviationPct: cmp.hasListingPay ? cmp.deviationPct : null,
      }
    : null,
  null,
  2
)}

SEEKER:
${JSON.stringify(
  input.youth
    ? {
        name: input.youth.name,
        age: input.youth.age,
        isStudent: input.youth.isStudent,
        skills: input.youth.skills,
        languages: input.youth.languages,
        bio: (input.youth.bio || "").slice(0, 300),
        educationLevel: input.youth.cv?.features?.educationLevel,
        educationHints: input.youth.cv?.features?.educationHints?.slice(0, 5),
        experienceYears: input.youth.cv?.features?.experienceYears,
        careerStage: input.youth.cv?.features?.careerStage,
        cvSkills: input.youth.cv?.features?.skills?.slice(0, 15),
        cvSummary: (input.youth.cv?.features?.summary || "").slice(0, 400),
      }
    : null,
  null,
  2
)}

HEURISTIC_SEED (you may refine, stay near these magnitudes):
${JSON.stringify(
  {
    unit: base.unit,
    proposeLow: base.proposeLow,
    proposeTarget: base.proposeTarget,
    proposeHigh: base.proposeHigh,
  },
  null,
  2
)}

Return JSON:
{
  "unit": "monthly" | "hourly",
  "proposeLow": number,
  "proposeTarget": number,
  "proposeHigh": number,
  "headline": "string",
  "proposalScript": "string — what the seeker can say/write as expected salary",
  "thinkingSteps": ["step1...", "step2..."],
  "profileStrengths": ["..."],
  "profileGaps": ["..."],
  "tips": ["..."],
  "marketNote": "string",
  "confidence": "high" | "medium" | "low"
}`;

  try {
    const completion = await client.chat.completions.create({
      model: XAI_MODEL,
      temperature: 0.3,
      max_tokens: 1600,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
    });
    const content = completion.choices[0]?.message?.content;
    if (!content) throw new Error("empty");
    const data = parseJson(content);
    const unit =
      data.unit === "hourly" || data.unit === "monthly"
        ? data.unit
        : base.unit;
    const proposeTarget = roundMop(
      Number(data.proposeTarget) || base.proposeTarget,
      unit
    );
    const proposeLow = roundMop(
      Number(data.proposeLow) || base.proposeLow,
      unit
    );
    const proposeHigh = roundMop(
      Number(data.proposeHigh) || base.proposeHigh,
      unit
    );
    const conf = data.confidence;
    return {
      unit,
      proposeLow: Math.min(proposeLow, proposeTarget),
      proposeTarget,
      proposeHigh: Math.max(proposeHigh, proposeTarget),
      headline: String(data.headline || base.headline),
      proposalScript: String(data.proposalScript || base.proposalScript),
      thinkingSteps:
        asStrings(data.thinkingSteps, 8).length >= 3
          ? asStrings(data.thinkingSteps, 8)
          : base.thinkingSteps,
      profileStrengths: asStrings(data.profileStrengths, 6),
      profileGaps: asStrings(data.profileGaps, 6),
      tips: asStrings(data.tips, 6).length
        ? asStrings(data.tips, 6)
        : base.tips,
      marketNote: String(data.marketNote || base.marketNote),
      confidence:
        conf === "high" || conf === "medium" || conf === "low"
          ? conf
          : base.confidence,
      provider: "xai",
      model: completion.model || XAI_MODEL,
      generatedAt: new Date().toISOString(),
    };
  } catch {
    return base;
  }
}
