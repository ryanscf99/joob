/**
 * AI application pack: tailored CV bullets + cover letter + company brief.
 * Uses xAI Grok when configured; heuristic fallback otherwise.
 */

import type { JobPosting, Lang, YouthProfile } from "./types";
import type { EmployerWorkforce } from "./employer-transparency";
import {
  cleanCompanyName,
  type CompanyResearchBundle,
} from "./company-research";
import { createXaiClient, isXaiConfigured, XAI_MODEL } from "./xai";

export interface ApplicationPack {
  tailoredCv: {
    headline: string;
    summary: string;
    skills: string[];
    experienceBullets: string[];
    educationBullets: string[];
    keywordsToAdd: string[];
  };
  coverLetter: string;
  companyBrief: {
    overview: string;
    recentTrends: string[];
    newsHighlights: string[];
    hiringSignals: string[];
    keyPeople: { name: string; role: string; why: string }[];
    talkingPoints: string[];
    sources: { title: string; url: string }[];
    confidence: "web_backed" | "limited_web" | "heuristic";
  };
  interviewTips: string[];
  provider: "xai" | "heuristic";
  model?: string;
  generatedAt: string;
}

function profileBlob(youth: YouthProfile | null, lang: Lang) {
  if (!youth) {
    return lang === "zh"
      ? "未提供求職者檔案。"
      : "No seeker profile provided.";
  }
  const cv = youth.cv?.features;
  return {
    name: youth.name,
    age: youth.age,
    isStudent: youth.isStudent,
    district: youth.district,
    languages: youth.languages,
    skills: youth.skills,
    preferredSectors: youth.preferredSectors,
    preferredLanes: youth.preferredLanes,
    bio: youth.bio,
    cvFile: youth.cv?.fileName,
    cvSummary: cv?.summary,
    cvSkills: cv?.skills,
    cvKeywords: cv?.keywords,
    education: cv?.educationHints,
    educationLevel: cv?.educationLevel,
    experienceYears: cv?.experienceYears,
    careerStage: cv?.careerStage,
    researchInterests: cv?.researchInterests,
  };
}

function jobBlob(job: JobPosting) {
  return {
    id: job.id,
    title: job.title,
    titleZh: job.titleZh,
    company: cleanCompanyName(job.company),
    companyZh: cleanCompanyName(job.companyZh),
    sector: job.sector,
    lane: job.lane,
    payMin: job.payMin,
    payMax: job.payMax,
    payUnit: job.payUnit,
    description: (job.description || "").slice(0, 1500),
    descriptionZh: (job.descriptionZh || "").slice(0, 1500),
    requirements: job.requirements?.slice(0, 15),
    requirementsZh: job.requirementsZh?.slice(0, 15),
    skills: job.skills,
    source: job.source,
    externalUrl: job.externalUrl,
  };
}

function researchBlob(r: CompanyResearchBundle | null) {
  if (!r) return null;
  return {
    wiki: r.wikiExtract,
    note: r.note,
    hits: r.hits.slice(0, 12).map((h) => ({
      title: h.title,
      url: h.url,
      snippet: h.snippet,
      query: h.query,
    })),
  };
}

function parseJsonObject(raw: string): Record<string, unknown> {
  let text = raw.trim();
  if (text.startsWith("```")) {
    text = text.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  }
  return JSON.parse(text) as Record<string, unknown>;
}

function asStringArray(v: unknown, max = 12): string[] {
  if (!Array.isArray(v)) return [];
  return v.map(String).filter(Boolean).slice(0, max);
}

function normalizePack(
  data: Record<string, unknown>,
  research: CompanyResearchBundle | null,
  provider: "xai" | "heuristic",
  model?: string
): ApplicationPack {
  const cv = (data.tailoredCv || data.cv || {}) as Record<string, unknown>;
  const brief = (data.companyBrief || data.company || {}) as Record<
    string,
    unknown
  >;
  const peopleRaw = Array.isArray(brief.keyPeople) ? brief.keyPeople : [];
  const sourcesRaw = Array.isArray(brief.sources) ? brief.sources : [];

  const sources =
    sourcesRaw.length > 0
      ? sourcesRaw
          .map((s) => {
            const o = s as Record<string, unknown>;
            return {
              title: String(o.title || o.name || "Source"),
              url: String(o.url || o.link || ""),
            };
          })
          .filter((s) => s.url)
          .slice(0, 8)
      : (research?.hits || []).slice(0, 6).map((h) => ({
          title: h.title,
          url: h.url,
        }));

  const hitCount = research?.hits?.length || 0;

  return {
    tailoredCv: {
      headline: String(cv.headline || "Targeted CV profile"),
      summary: String(cv.summary || ""),
      skills: asStringArray(cv.skills, 16),
      experienceBullets: asStringArray(cv.experienceBullets || cv.bullets, 10),
      educationBullets: asStringArray(cv.educationBullets, 6),
      keywordsToAdd: asStringArray(cv.keywordsToAdd, 12),
    },
    coverLetter: String(data.coverLetter || data.letter || ""),
    companyBrief: {
      overview: String(brief.overview || ""),
      recentTrends: asStringArray(brief.recentTrends || brief.trends, 8),
      newsHighlights: asStringArray(brief.newsHighlights || brief.news, 8),
      hiringSignals: asStringArray(brief.hiringSignals || brief.hiring, 8),
      keyPeople: peopleRaw
        .map((p) => {
          const o = p as Record<string, unknown>;
          return {
            name: String(o.name || ""),
            role: String(o.role || o.title || ""),
            why: String(o.why || o.note || ""),
          };
        })
        .filter((p) => p.name)
        .slice(0, 8),
      talkingPoints: asStringArray(brief.talkingPoints, 8),
      sources,
      confidence:
        hitCount >= 4
          ? "web_backed"
          : hitCount >= 1
            ? "limited_web"
            : "heuristic",
    },
    interviewTips: asStringArray(data.interviewTips, 8),
    provider,
    model,
    generatedAt: new Date().toISOString(),
  };
}

export function buildHeuristicApplicationPack(input: {
  job: JobPosting;
  youth: YouthProfile | null;
  lang: Lang;
  research: CompanyResearchBundle | null;
  workforce?: EmployerWorkforce | null;
}): ApplicationPack {
  const { job, youth, lang, research, workforce } = input;
  const zh = lang === "zh";
  const title = zh ? job.titleZh || job.title : job.title;
  const company = cleanCompanyName(
    zh ? job.companyZh || job.company : job.company || job.companyZh
  );
  const skills = [
    ...new Set([
      ...(youth?.skills || []),
      ...(youth?.cv?.features?.skills || []),
      ...(job.skills || []).slice(0, 6),
    ]),
  ].slice(0, 12);

  const jobSkills = (job.skills || []).map((s) => s.toLowerCase());
  const mySkills = new Set(
    [...(youth?.skills || []), ...(youth?.cv?.features?.skills || [])].map(
      (s) => s.toLowerCase()
    )
  );
  const matched = jobSkills.filter((s) =>
    [...mySkills].some((m) => m.includes(s) || s.includes(m))
  );
  const missing = jobSkills.filter((s) => !matched.includes(s)).slice(0, 6);

  const coverLetter = zh
    ? `尊敬的招聘負責人：

本人希望應徵貴公司「${title}」一職。我目前${youth?.isStudent ? "仍在學" : "已準備投入職場"}，具備${(youth?.skills || []).slice(0, 4).join("、") || "相關技能"}等背景。

針對職位要求，我可強調：${matched.slice(0, 4).join("、") || "學習能力與責任感"}。我亦了解澳門本地就業環境，並願意配合培訓與團隊協作。

如需履歷詳情或面試時間，請隨時與我聯絡。

此致
${youth?.name || "求職者"}`
    : `Dear Hiring Team,

I am writing to apply for the “${title}” role at ${company}. I am a ${youth?.isStudent ? "student" : "young professional"} in Macau with strengths in ${(youth?.skills || []).slice(0, 4).join(", ") || "teamwork and learning quickly"}.

For this posting, I would highlight: ${matched.slice(0, 4).join(", ") || "reliability, language skills, and motivation to grow"}. I am keen to contribute as a local hire and can start according to your schedule.

Thank you for your consideration.

Sincerely,
${youth?.name || "Applicant"}`;

  const hits = research?.hits || [];

  // Public-facing company brief built primarily from web hits
  const overviewParts: string[] = [];
  if (research?.wikiExtract) {
    overviewParts.push(research.wikiExtract.slice(0, 500));
  }
  if (hits[0]) {
    overviewParts.push(
      zh
        ? `公開搜尋可見：${hits[0].title}${hits[0].snippet ? ` — ${hits[0].snippet.slice(0, 160)}` : ""}`
        : `Public web: ${hits[0].title}${hits[0].snippet ? ` — ${hits[0].snippet.slice(0, 160)}` : ""}`
    );
  }
  if (overviewParts.length === 0) {
    overviewParts.push(
      zh
        ? `「${company}」在公開網搜結果有限。行業標籤：${job.sector}。請查公司官網／商業登記／LinkedIn。`
        : `Limited public web results for “${company}”. Sector tag: ${job.sector}. Check the company site, commercial registry, and LinkedIn.`
    );
  }

  const recentTrends: string[] = [];
  if (research?.wikiExtract) {
    recentTrends.push(research.wikiExtract.slice(0, 280));
  }
  for (const h of hits.slice(0, 6)) {
    const line = h.snippet
      ? `${h.title}: ${h.snippet.slice(0, 160)}`
      : h.title;
    if (line.length > 12) recentTrends.push(line);
  }
  if (workforce?.foreignSharePct != null) {
    recentTrends.push(
      zh
        ? `（本地公開勞動資料）外地僱員約 ${workforce.foreignSharePct}% · ${workforce.confidence}`
        : `(Local public labour data) non-resident share ~${workforce.foreignSharePct}% · ${workforce.confidence}`
    );
  }

  const newsHighlights = hits
    .filter((h) =>
      /news|新聞|報|times|post|ggr|reuters|bloomberg|scmp|macaubusiness|platform|press|announc/i.test(
        `${h.url} ${h.title}`
      )
    )
    .slice(0, 6)
    .map((h) => h.title);
  // If no "news-like" URLs, still show top public titles
  if (newsHighlights.length === 0) {
    for (const h of hits.slice(0, 5)) {
      if (!newsHighlights.includes(h.title)) newsHighlights.push(h.title);
    }
  }

  const hiringSignals = hits
    .filter((h) =>
      /career|job|hire|recruit|hr|人才|招聘|vacanc|join us|就業/i.test(
        `${h.url} ${h.title} ${h.snippet}`
      )
    )
    .slice(0, 5)
    .map((h) => `${h.title}${h.snippet ? ` — ${h.snippet.slice(0, 100)}` : ""}`);

  hiringSignals.push(
    job.source === "dsal"
      ? zh
        ? "此職缺刊登於勞工局官方平台"
        : "This vacancy is listed on the official DSAL board"
      : job.source === "jobscall"
        ? zh
          ? "此職缺刊登於 Jobscall 商業招聘平台"
          : "This vacancy is listed on Jobscall (commercial board)"
        : job.source === "hellojobs"
          ? zh
            ? "此職缺刊登於 Hello-Jobs 商業招聘平台"
            : "This vacancy is listed on Hello-Jobs (commercial board)"
          : zh
            ? "此職缺來自 jOOB 平台"
            : "This vacancy is listed on jOOB"
  );

  // Extract possible people lines from snippets (very conservative)
  const keyPeople: { name: string; role: string; why: string }[] = [];
  const peopleRe =
    /\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+){1,3})\s*[,–—-]\s*((?:CEO|CFO|COO|Chairman|Director|Managing Director|Chief\s+\w+|President|Founder)[^.,;]{0,40})/g;
  for (const h of hits) {
    const blob = `${h.title}. ${h.snippet}`;
    let pm: RegExpExecArray | null;
    const re = new RegExp(peopleRe.source, "g");
    while ((pm = re.exec(blob)) && keyPeople.length < 5) {
      const name = pm[1].trim();
      const role = pm[2].trim();
      if (keyPeople.some((k) => k.name === name)) continue;
      keyPeople.push({
        name,
        role,
        why: zh
          ? `出現於公開結果：${h.title}`
          : `Mentioned in public result: ${h.title}`,
      });
    }
  }

  return normalizePack(
    {
      tailoredCv: {
        headline: zh
          ? `${youth?.name || "求職者"}｜針對 ${title}`
          : `${youth?.name || "Applicant"} | targeting ${title}`,
        summary:
          youth?.cv?.features?.summary ||
          youth?.bio ||
          (zh
            ? `青年求職者，目標職位：${title}（${company}）。`
            : `Youth applicant targeting ${title} at ${company}.`),
        skills,
        experienceBullets: [
          zh
            ? `對齊職缺技能：${matched.slice(0, 5).join("、") || "待補強"}`
            : `Align to role skills: ${matched.slice(0, 5).join(", ") || "build these"}`,
          youth?.cv?.features?.experienceYears != null
            ? zh
              ? `相關經驗約 ${youth.cv.features.experienceYears} 年`
              : `About ${youth.cv.features.experienceYears} years of relevant experience`
            : zh
              ? "以實習／暑期工／專案經驗補強履歷"
              : "Strengthen CV with internship / project / summer work bullets",
          zh
            ? `語言：${(youth?.languages || []).join("、") || "粵／普／英"}`
            : `Languages: ${(youth?.languages || []).join(", ") || "Cantonese / Mandarin / English"}`,
        ],
        educationBullets: (youth?.cv?.features?.educationHints || []).slice(
          0,
          4
        ),
        keywordsToAdd: missing.length
          ? missing
          : (job.requirements || []).slice(0, 5).map(String),
      },
      coverLetter,
      companyBrief: {
        overview: overviewParts.join("\n\n"),
        recentTrends: recentTrends.slice(0, 8),
        newsHighlights: newsHighlights.slice(0, 8),
        hiringSignals: hiringSignals.slice(0, 8),
        keyPeople,
        talkingPoints: [
          zh
            ? "用具體例子說明你符合 2–3 項職位要求"
            : "Use 2–3 concrete examples mapped to the job requirements",
          zh
            ? "引用 1 則你核實過的公司公開資訊（官網／新聞）展現誠意"
            : "Cite one verified public fact about the company (site/news) to show preparation",
          zh
            ? "如薪酬低於市場，準備詢問培訓／晉升路徑"
            : "If pay is below market, ask about training and progression",
        ],
        sources: hits.slice(0, 10).map((h) => ({
          title: h.title,
          url: h.url,
        })),
        // force confidence for normalize via hits length
      },
      interviewTips: [
        zh
          ? "準備 60 秒自我介紹，對齊職位標題關鍵字"
          : "Prepare a 60-second intro aligned to the job title keywords",
        zh
          ? "帶備學生證／證件與履歷紙本"
          : "Bring ID / student card and a paper CV",
      ],
    },
    // Pass research so sources/confidence use real web hits
    research ?? {
      company,
      queries: [],
      hits: [],
      wikiExtract: null,
      fetchedAt: new Date().toISOString(),
      note: "",
    },
    "heuristic"
  );
}

export async function generateApplicationPack(input: {
  job: JobPosting;
  youth: YouthProfile | null;
  lang: Lang;
  research: CompanyResearchBundle | null;
  workforce?: EmployerWorkforce | null;
}): Promise<ApplicationPack> {
  const heuristic = () => buildHeuristicApplicationPack(input);

  if (!isXaiConfigured()) return heuristic();
  const client = createXaiClient();
  if (!client) return heuristic();

  const zh = input.lang === "zh";
  const system = zh
    ? `你是 jOOB 澳門青年求職教練。根據職缺、求職者檔案／履歷，以及公開網搜片段，產出可直接使用的申請材料。
規則：
- 只使用提供的事實；網搜片段可能過時或錯誤，不確定就標明「待核實」。
- 不要捏造薪資、聯絡人或高管姓名；沒有來源就不要編造 key people。
- coverLetter 完整可用；CV 以條列強化對職缺的匹配。
- 回覆僅 JSON，不要 markdown。`
    : `You are jOOB's Macau youth career coach. Using the job, seeker profile/CV, and public web snippets, produce ready-to-use application materials.
Rules:
- Use only provided facts. Web snippets may be stale/wrong — mark uncertainties as "verify".
- Do NOT invent salaries, contacts, or executive names; leave keyPeople empty if not sourced.
- coverLetter must be complete and usable; CV should be bullet-oriented for this JD.
- Output JSON only, no markdown fences.`;

  const user = `Language: ${input.lang}

SEEKER:
${JSON.stringify(profileBlob(input.youth, input.lang), null, 2)}

JOB:
${JSON.stringify(jobBlob(input.job), null, 2)}

WORKFORCE (local app data):
${JSON.stringify(
  input.workforce
    ? {
        name: input.workforce.name,
        nameZh: input.workforce.nameZh,
        foreignSharePct: input.workforce.foreignSharePct,
        localSharePct: input.workforce.localSharePct,
        totalEmployees: input.workforce.totalEmployees,
        confidence: input.workforce.confidence,
        asOf: input.workforce.asOf,
      }
    : null,
  null,
  2
)}

WEB_RESEARCH:
${JSON.stringify(researchBlob(input.research), null, 2)}

Return JSON:
{
  "tailoredCv": {
    "headline": "string",
    "summary": "string (3-5 sentences)",
    "skills": ["..."],
    "experienceBullets": ["..."],
    "educationBullets": ["..."],
    "keywordsToAdd": ["..."]
  },
  "coverLetter": "full letter string",
  "companyBrief": {
    "overview": "string",
    "recentTrends": ["..."],
    "newsHighlights": ["..."],
    "hiringSignals": ["..."],
    "keyPeople": [{"name":"","role":"","why":""}],
    "talkingPoints": ["..."],
    "sources": [{"title":"","url":""}]
  },
  "interviewTips": ["..."]
}`;

  try {
    const completion = await client.chat.completions.create({
      model: XAI_MODEL,
      temperature: 0.35,
      max_tokens: 3200,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
    });
    const content = completion.choices[0]?.message?.content;
    if (!content) throw new Error("Empty model response");
    const parsed = parseJsonObject(content);
    return normalizePack(
      parsed,
      input.research,
      "xai",
      completion.model || XAI_MODEL
    );
  } catch {
    const fallback = heuristic();
    return {
      ...fallback,
      coverLetter:
        fallback.coverLetter +
        (zh
          ? "\n\n（離線模板：AI 暫時不可用）"
          : "\n\n(Offline template: AI temporarily unavailable)"),
    };
  }
}
