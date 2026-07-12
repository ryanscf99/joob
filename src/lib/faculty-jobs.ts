import type { UniId } from "./macau-universities";
import { MACAU_TOP4 } from "./macau-universities";
import type { CvFeatures } from "./cv-extract";
import { jaccard, tokenizeForMatch } from "./cv-extract";
import type { YouthProfile } from "./types";

function hashId(s: string): string {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (Math.imul(31, h) + s.charCodeAt(i)) | 0;
  return Math.abs(h).toString(36);
}

export type FacultyRank =
  | "dean"
  | "head"
  | "full_professor"
  | "associate_professor"
  | "assistant_professor"
  | "research_professor"
  | "lecturer"
  | "instructor"
  | "other_academic";

export interface FacultyPosition {
  id: string;
  universityId: UniId;
  universityNameEn: string;
  universityNameZh: string;
  title: string;
  unit: string; // faculty / department
  category: string; // Academic Staff / Research Staff / Teaching
  refNo?: string;
  postedAt?: string;
  closeDate?: string;
  url: string;
  ranks: FacultyRank[];
  fields: string[]; // inferred discipline tags
  source: "live" | "portal" | "rss";
  summary?: string;
}

/** Only keep / rank posts published within this window (academic-year relevance). */
export const FACULTY_MAX_AGE_DAYS = 365;

/**
 * Best-effort publish date from postedAt, closeDate, or ref numbers like 20260701019 / …/07/2026.
 */
export function resolveFacultyPostDate(p: FacultyPosition): Date | null {
  const tryParse = (s?: string | null): Date | null => {
    if (!s) return null;
    const t = s.trim();
    if (!t || /^until/i.test(t)) return null;
    // YYYY-MM-DD
    const iso = t.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (iso) {
      const d = new Date(
        Number(iso[1]),
        Number(iso[2]) - 1,
        Number(iso[3])
      );
      return Number.isNaN(d.getTime()) ? null : d;
    }
    const d = new Date(t);
    return Number.isNaN(d.getTime()) ? null : d;
  };

  const fromPosted = tryParse(p.postedAt);
  if (fromPosted) return fromPosted;

  // MUST jobPostNo: 20260701019 → 2026-07-01
  if (p.refNo) {
    const must = p.refNo.match(/^(\d{4})(\d{2})(\d{2})\d*$/);
    if (must) {
      const d = new Date(
        Number(must[1]),
        Number(must[2]) - 1,
        Number(must[3])
      );
      if (!Number.isNaN(d.getTime())) return d;
    }
    // UM style: FSC/BIO/FAAP/07/2026
    const um = p.refNo.match(/\/(\d{2})\/(\d{4})\s*$/);
    if (um) {
      const d = new Date(Number(um[2]), Number(um[1]) - 1, 1);
      if (!Number.isNaN(d.getTime())) return d;
    }
    const y = p.refNo.match(/(20\d{2})/);
    if (y) {
      const d = new Date(Number(y[1]), 5, 1); // mid-year anchor
      if (!Number.isNaN(d.getTime())) return d;
    }
  }

  const fromClose = tryParse(p.closeDate);
  if (fromClose) return fromClose;

  return null;
}

export function isFacultyPostWithinYear(
  p: FacultyPosition,
  now = new Date(),
  maxAgeDays = FACULTY_MAX_AGE_DAYS
): boolean {
  // Generic portal hub pages stay visible (no single post date)
  if (p.source === "portal" && !p.postedAt && !p.refNo) return true;

  const d = resolveFacultyPostDate(p);
  if (!d) {
    // Undated live/rss posts: drop — likely stale or unverifiable
    return p.source === "portal";
  }
  const ageMs = now.getTime() - d.getTime();
  const maxMs = maxAgeDays * 24 * 60 * 60 * 1000;
  // Allow slight future dates (scheduled publish)
  if (ageMs < -14 * 24 * 60 * 60 * 1000) return true;
  return ageMs <= maxMs;
}

export function filterFacultyWithinYear(
  positions: FacultyPosition[],
  now = new Date()
): { kept: FacultyPosition[]; dropped: number } {
  const kept = positions.filter((p) => isFacultyPostWithinYear(p, now));
  return { kept, dropped: positions.length - kept.length };
}

export interface FacultyMatchResult {
  position: FacultyPosition;
  score: number;
  reasons: string[];
  reasonsZh: string[];
}

function stripTags(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&#8211;/g, "–")
    .replace(/&#8217;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, " ")
    .trim();
}

export function inferRanks(title: string): FacultyRank[] {
  const t = title.toLowerCase();
  const ranks: FacultyRank[] = [];
  if (/\bdean\b|院長|院长/.test(t)) ranks.push("dean");
  if (/\bhead of\b|系主任|department head/.test(t)) ranks.push("head");
  if (/full\s*\/?\s*associate\s*\/?\s*assistant\s*professor|full\/associate\/assistant/.test(t)) {
    ranks.push("full_professor", "associate_professor", "assistant_professor");
  } else {
    if (/full\s*professor|教授(?!助理|副)/.test(t) && !/associate|assistant/.test(t))
      ranks.push("full_professor");
    if (/associate\s*\/?\s*assistant\s*professor/.test(t)) {
      ranks.push("associate_professor", "assistant_professor");
    } else {
      if (/associate\s*professor|副教授/.test(t)) ranks.push("associate_professor");
      if (/assistant\s*professor|助理教授/.test(t)) ranks.push("assistant_professor");
    }
    if (/research\s*assistant\s*professor|research\s*professor/.test(t))
      ranks.push("research_professor");
  }
  if (/\blecturer\b|講師|讲师/.test(t)) ranks.push("lecturer");
  if (/\binstructor\b|導師|导师/.test(t)) ranks.push("instructor");
  if (ranks.length === 0) ranks.push("other_academic");
  return [...new Set(ranks)];
}

export function inferFields(title: string, unit: string): string[] {
  const blob = `${title} ${unit}`.toLowerCase();
  const tags: [RegExp, string][] = [
    [/data\s*science|artificial\s*intelligence|\bai\b|machine\s*learning|computational/i, "data-science-ai"],
    [/computer|software|information\s*technology|informatics/i, "computer-science"],
    [/statistics|mathematics|math/i, "math-stats"],
    [/physics|materials|applied\s*physics/i, "physics-materials"],
    [/biology|biomed|life\s*science|neuroscience/i, "life-sciences"],
    [/medicine|clinical|nursing|health/i, "medicine-health"],
    [/business|management|finance|accounting|economics|marketing/i, "business-econ"],
    [/tourism|hospitality|resort|integrated\s*resort/i, "tourism-hospitality"],
    [/education|psychology|counseling|pedagogy/i, "education"],
    [/law|legal/i, "law"],
    [/communication|media|journalism/i, "communication"],
    [/philosophy|history|literature|language|chinese|english|translation|humanities/i, "humanities"],
    [/social\s*science|sociology|political|public\s*admin/i, "social-sciences"],
    [/design|arts|architecture/i, "design-arts"],
    [/engineering|civil|electrical|mechanical/i, "engineering"],
    [/pharmacy|chinese\s*medicine|tcm/i, "pharmacy-tcm"],
  ];
  const out: string[] = [];
  for (const [re, tag] of tags) {
    if (re.test(blob)) out.push(tag);
  }
  return out.length ? out : ["general-academic"];
}

function uniMeta(id: UniId) {
  const u = MACAU_TOP4.find((x) => x.id === id)!;
  return u;
}

/** Parse University of Macau Career@UM HTML table */
export function parseUmCareerHtml(html: string): FacultyPosition[] {
  const uni = uniMeta("um");
  const jobs: FacultyPosition[] = [];
  const seen = new Set<string>();
  const rowRe = /<tr[^>]*id="table_\d+_row_\d+"[^>]*>([\s\S]*?)<\/tr>/gi;
  let row: RegExpExecArray | null;
  while ((row = rowRe.exec(html))) {
    const block = row[1];
    const tds = [...block.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)].map((m) => m[1]);
    if (tds.length < 5) continue;
    const unit = stripTags(tds[1]);
    const linkMatch = tds[2].match(/href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/i);
    const title = linkMatch
      ? stripTags(linkMatch[2])
      : stripTags(tds[2]);
    const url = linkMatch ? linkMatch[1] : uni.careersUrl;
    const category = stripTags(tds[3]);
    const refNo = stripTags(tds[4]);
    const postedAt = tds[5] ? stripTags(tds[5]) : undefined;
    const closeDate = tds[6] ? stripTags(tds[6]) : undefined;

    const isAcademic =
      /academic|research|professor|dean|head|lecturer|instructor|faculty/i.test(
        `${category} ${title}`
      );
    if (!isAcademic) continue;
    // Skip pure admin clerical if needed — keep deans/heads
    const id = `um-${refNo || url}`.replace(/[^a-zA-Z0-9_-]/g, "_");
    if (seen.has(id)) continue;
    seen.add(id);
    jobs.push({
      id,
      universityId: "um",
      universityNameEn: uni.nameEn,
      universityNameZh: uni.nameZh,
      title,
      unit,
      category,
      refNo,
      postedAt,
      closeDate,
      url,
      ranks: inferRanks(title),
      fields: inferFields(title, unit),
      source: "live",
    });
  }
  return jobs;
}

/** Parse WordPress RSS (UM feed / CityU teaching feed) */
export function parseFacultyRss(
  xml: string,
  universityId: UniId,
  defaultCategory = "Academic"
): FacultyPosition[] {
  const uni = uniMeta(universityId);
  const jobs: FacultyPosition[] = [];
  const items = xml.match(/<item>([\s\S]*?)<\/item>/gi) || [];
  for (const item of items) {
    const title = stripTags(
      (item.match(/<title><!\[CDATA\[(.*?)\]\]><\/title>/i) ||
        item.match(/<title>(.*?)<\/title>/i) ||
        [])[1] || ""
    );
    const url = stripTags(
      (item.match(/<link>(.*?)<\/link>/i) || [])[1] || uni.careersUrl
    );
    const desc = stripTags(
      (item.match(/<description><!\[CDATA\[([\s\S]*?)\]\]><\/description>/i) ||
        item.match(/<description>([\s\S]*?)<\/description>/i) ||
        [])[1] || ""
    );
    const cats = [
      ...(item.matchAll(/<category><!\[CDATA\[(.*?)\]\]><\/category>/gi) || []),
    ].map((m) => m[1]);
    const pub = (item.match(/<pubDate>(.*?)<\/pubDate>/i) || [])[1];
    const category =
      cats.find((c) => /academic|research|teaching|staff/i.test(c)) ||
      cats[0] ||
      defaultCategory;

    // Filter non-academic noise for UM RSS if mixed
    if (
      universityId === "um" &&
      !/academic|research|professor|dean|head|lecturer|instructor|faculty|teaching/i.test(
        `${title} ${category}`
      )
    ) {
      continue;
    }

    const id = `${universityId}-rss-${hashId(url)}`;
    jobs.push({
      id,
      universityId,
      universityNameEn: uni.nameEn,
      universityNameZh: uni.nameZh,
      title: title || "Faculty opening",
      unit: category,
      category,
      postedAt: pub ? new Date(pub).toISOString().slice(0, 10) : undefined,
      url,
      ranks: inferRanks(title),
      fields: inferFields(title, category + " " + desc),
      source: "rss",
      summary: desc.slice(0, 280),
    });
  }
  return jobs;
}

/** Portal stub entries when live lists are thin / login-walled */
export function portalStubPositions(): FacultyPosition[] {
  const stubs: Omit<FacultyPosition, "id">[] = [
    {
      universityId: "must",
      universityNameEn: uniMeta("must").nameEn,
      universityNameZh: uniMeta("must").nameZh,
      title: "Academic and Research Positions (open portal)",
      unit: "University-wide",
      category: "Academic and Research",
      url: uniMeta("must").careersUrl,
      ranks: [
        "full_professor",
        "associate_professor",
        "assistant_professor",
        "lecturer",
      ],
      fields: ["general-academic"],
      source: "portal",
      summary:
        "Browse MUST’s official academic & research vacancies (Professor / Associate / Assistant / Lecturer) on the talent portal.",
    },
    {
      universityId: "must",
      universityNameEn: uniMeta("must").nameEn,
      universityNameZh: uniMeta("must").nameZh,
      title: "Vice Dean of Faculty of Medicine",
      unit: "Faculty of Medicine",
      category: "Management / Academic",
      url: "https://hro.must.edu.mo/page/vice-dean-fmd.html?locale=en_US",
      ranks: ["dean"],
      fields: ["medicine-health"],
      source: "live",
      summary: "Leadership role posted on MUST HRO talent pages.",
    },
    {
      universityId: "mpu",
      universityNameEn: uniMeta("mpu").nameEn,
      universityNameZh: uniMeta("mpu").nameZh,
      title: "Teaching & research openings (MPU career page)",
      unit: "University-wide",
      category: "Faculty recruitment",
      url: uniMeta("mpu").careersUrl,
      ranks: [
        "full_professor",
        "associate_professor",
        "assistant_professor",
        "lecturer",
      ],
      fields: ["general-academic"],
      source: "portal",
      summary:
        "Check Macao Polytechnic University’s official career page for current teaching/research posts.",
    },
    {
      universityId: "cityu",
      universityNameEn: uniMeta("cityu").nameEn,
      universityNameZh: uniMeta("cityu").nameZh,
      title: "Teaching positions (CityU HRO)",
      unit: "Human Resources Office",
      category: "Teaching",
      url: uniMeta("cityu").careersUrl,
      ranks: ["lecturer", "instructor", "assistant_professor", "other_academic"],
      fields: ["general-academic", "education"],
      source: "portal",
      summary:
        "CityU teaching staff openings listed under HRO job application (including part-time teaching).",
    },
  ];
  return stubs.map((s, i) => ({
    ...s,
    id: `portal-${s.universityId}-${i}`,
  }));
}

export async function fetchText(url: string, timeoutMs = 12000): Promise<string> {
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      headers: {
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "User-Agent":
          "MYEIB-FacultyFinder/1.0 (Macau youth employment research; +local universities)",
      },
      signal: controller.signal,
      cache: "no-store",
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.text();
  } finally {
    clearTimeout(t);
  }
}

/**
 * Aggregate faculty positions from top-4 Macau universities.
 * UM: full live table. CityU: teaching RSS. MUST/MPU: live pages + portal stubs.
 */
export async function aggregateFacultyPositions(): Promise<{
  positions: FacultyPosition[];
  sources: { universityId: UniId; ok: boolean; count: number; error?: string }[];
  fetchedAt: string;
  /** Posts removed for being older than FACULTY_MAX_AGE_DAYS */
  droppedStale: number;
  rawTotal: number;
}> {
  const sources: {
    universityId: UniId;
    ok: boolean;
    count: number;
    error?: string;
  }[] = [];
  const all: FacultyPosition[] = [];
  const seenUrl = new Set<string>();

  const push = (list: FacultyPosition[]) => {
    for (const p of list) {
      const key = p.url + "|" + p.title;
      if (seenUrl.has(key)) continue;
      seenUrl.add(key);
      all.push(p);
    }
  };

  // UM HTML (primary)
  try {
    const html = await fetchText("https://career.admo.um.edu.mo/");
    const list = parseUmCareerHtml(html);
    push(list);
    sources.push({ universityId: "um", ok: true, count: list.length });
  } catch (e) {
    // RSS fallback
    try {
      const xml = await fetchText("https://career.admo.um.edu.mo/feed/");
      const list = parseFacultyRss(xml, "um", "Academic Staff");
      push(list);
      sources.push({
        universityId: "um",
        ok: true,
        count: list.length,
        error: "HTML failed; used RSS",
      });
    } catch (e2) {
      sources.push({
        universityId: "um",
        ok: false,
        count: 0,
        error: e instanceof Error ? e.message : "UM fetch failed",
      });
    }
  }

  // CityU teaching RSS
  try {
    const xml = await fetchText(
      "https://hro.cityu.edu.mo/en/category/job-application/teaching-en/feed/"
    );
    const list = parseFacultyRss(xml, "cityu", "Teaching");
    push(list);
    sources.push({ universityId: "cityu", ok: true, count: list.length });
  } catch (e) {
    sources.push({
      universityId: "cityu",
      ok: false,
      count: 0,
      error: e instanceof Error ? e.message : "CityU feed failed",
    });
  }

  // MUST — signed public e-recruitment API (careers.must.edu.mo SPA backend)
  try {
    const { fetchMustFacultyPositions } = await import("./must-api");
    const { positions: mustJobs, total, detailsFetched } =
      await fetchMustFacultyPositions({
        withDetails: true,
        detailLimit: 40,
        concurrency: 5,
      });
    push(mustJobs);
    sources.push({
      universityId: "must",
      ok: true,
      count: mustJobs.length,
      error:
        detailsFetched > 0
          ? `API live · ${total} TP posts · ${detailsFetched} JDs`
          : `API live · ${total} TP posts`,
    });
  } catch (e) {
    // Fallback: HRO HTML links + portal stubs
    try {
      const html = await fetchText(
        "https://hro.must.edu.mo/page/careers.html?locale=en_US"
      );
      const must: FacultyPosition[] = [];
      const uni = uniMeta("must");
      const re =
        /href="(https:\/\/hro\.must\.edu\.mo\/page\/[^"]+)"[^>]*>\s*([^<]{8,100})/gi;
      let m: RegExpExecArray | null;
      const seen = new Set<string>();
      while ((m = re.exec(html))) {
        const url = m[1].replace(/&amp;/g, "&");
        const title = stripTags(m[2]);
        if (
          /talent recruitment|benefits|local information|life information|links/i.test(
            title
          )
        )
          continue;
        if (
          !/dean|professor|faculty|academic|research|lecturer|instructor|director/i.test(
            title
          )
        )
          continue;
        if (seen.has(url)) continue;
        seen.add(url);
        must.push({
          id: `must-html-${hashId(url)}`,
          universityId: "must",
          universityNameEn: uni.nameEn,
          universityNameZh: uni.nameZh,
          title,
          unit: "MUST",
          category: "Academic / Leadership",
          url,
          ranks: inferRanks(title),
          fields: inferFields(title, title),
          source: "live",
        });
      }
      must.push(
        ...portalStubPositions().filter((p) => p.universityId === "must")
      );
      push(must);
      sources.push({
        universityId: "must",
        ok: true,
        count: must.length,
        error: `API failed (${e instanceof Error ? e.message : "error"}); used HRO fallback`,
      });
    } catch (e2) {
      const stubs = portalStubPositions().filter(
        (p) => p.universityId === "must"
      );
      push(stubs);
      sources.push({
        universityId: "must",
        ok: false,
        count: stubs.length,
        error: e instanceof Error ? e.message : "MUST fetch failed",
      });
    }
  }

  // MPU portal stub (SPA / limited public HTML)
  {
    const stubs = portalStubPositions().filter((p) => p.universityId === "mpu");
    push(stubs);
    sources.push({ universityId: "mpu", ok: true, count: stubs.length });
  }

  // If CityU only portal and no RSS items, stubs already partly covered
  if (!all.some((p) => p.universityId === "cityu")) {
    push(portalStubPositions().filter((p) => p.universityId === "cityu"));
  }

  // Drop posts older than 1 year (likely closed after academic-year cycle)
  const rawTotal = all.length;
  const { kept, dropped } = filterFacultyWithinYear(all);

  // Sort: newer + live academic professors first
  kept.sort((a, b) => {
    const da = resolveFacultyPostDate(a)?.getTime() ?? 0;
    const db = resolveFacultyPostDate(b)?.getTime() ?? 0;
    if (db !== da) return db - da;
    const rank = (p: FacultyPosition) => {
      let s = 0;
      if (p.source === "live") s += 10;
      if (p.source === "rss") s += 8;
      if (p.ranks.includes("assistant_professor")) s += 3;
      if (p.fields.includes("data-science-ai")) s += 2;
      return s;
    };
    return rank(b) - rank(a);
  });

  return {
    positions: kept,
    sources,
    fetchedAt: new Date().toISOString(),
    droppedStale: dropped,
    rawTotal,
  };
}

/** Rank faculty posts for a youth/CV profile (academic-oriented). */
export function matchFacultyPositions(
  positions: FacultyPosition[],
  youth?: YouthProfile | null,
  cv?: CvFeatures | null
): FacultyMatchResult[] {
  const skillBlob = [
    ...(youth?.skills || []),
    ...(cv?.skills || []),
    ...(cv?.keywords || []),
    cv?.summary || "",
    cv?.researchInterests || "",
    youth?.bio || "",
    ...(youth?.preferredSectors || []),
  ]
    .join(" ")
    .toLowerCase();

  const cvTokens = tokenizeForMatch(skillBlob);

  return positions
    .map((position) => {
      let score = 25;
      const reasons: string[] = [];
      const reasonsZh: string[] = [];

      const posBlob = `${position.title} ${position.unit} ${position.fields.join(" ")} ${position.summary || ""}`;
      const posTokens = tokenizeForMatch(posBlob);
      const sim = jaccard(cvTokens, posTokens);
      const boost = Math.round(sim * 40);
      if (boost >= 3) {
        score += boost;
        reasons.push(`CV↔posting text similarity ${(sim * 100).toFixed(0)}%`);
        reasonsZh.push(`履歷與職位文本相似度 ${(sim * 100).toFixed(0)}%`);
      }

      // Field alignment from skills
      const fieldHits: string[] = [];
      if (
        position.fields.includes("data-science-ai") &&
        /python|machine-learning|data-science|statistics|ai|deep learning|人工智能|數據/i.test(
          skillBlob
        )
      )
        fieldHits.push("data-science-ai");
      if (
        position.fields.includes("math-stats") &&
        /statistics|math|統計|數學/i.test(skillBlob)
      )
        fieldHits.push("math-stats");
      if (
        position.fields.includes("computer-science") &&
        /python|java|software|computer|programming|軟件/i.test(skillBlob)
      )
        fieldHits.push("computer-science");
      if (
        position.fields.includes("business-econ") &&
        /finance|business|economics|accounting|金融|商科/i.test(skillBlob)
      )
        fieldHits.push("business-econ");
      if (
        position.fields.includes("education") &&
        /teaching|education|pedagogy|教學|教育/i.test(skillBlob)
      )
        fieldHits.push("education");
      if (
        position.fields.includes("medicine-health") &&
        /health|medicine|biomed|medical|醫療|健康/i.test(skillBlob)
      )
        fieldHits.push("medicine-health");
      if (
        position.fields.includes("tourism-hospitality") &&
        /tourism|hospitality|hotel|旅遊|酒店/i.test(skillBlob)
      )
        fieldHits.push("tourism-hospitality");

      if (fieldHits.length) {
        score += Math.min(25, fieldHits.length * 10);
        reasons.push(`Field fit: ${fieldHits.join(", ")}`);
        reasonsZh.push(`學科相關：${fieldHits.join("、")}`);
      }

      // Education bar
      const edu = cv?.educationLevel || null;
      if (edu === "phd") {
        score += 18;
        reasons.push("PhD profile matches typical faculty requirement");
        reasonsZh.push("博士學歷符合一般教職要求");
      } else if (edu === "master") {
        score += 8;
        reasons.push("Master-level profile (some lecturer/instructor tracks)");
        reasonsZh.push("碩士學歷（部分講師／導師軌道）");
      } else if (edu === "bachelor" || edu === "secondary") {
        score -= 10;
        reasons.push("Most faculty posts prefer doctorate-level credentials");
        reasonsZh.push("多數教職偏好博士學歷");
      }

      // Rank preference: assistant professor for early career PhD
      if (
        edu === "phd" &&
        (position.ranks.includes("assistant_professor") ||
          position.ranks.includes("research_professor"))
      ) {
        score += 10;
        reasons.push("Rank suitable for early-career academic (Asst./Research Prof.)");
        reasonsZh.push("職級適合學術早期職涯（助理／研究教授）");
      }
      if (position.ranks.includes("dean") || position.ranks.includes("head")) {
        if (edu === "phd" && (cv?.experienceYears ?? 0) >= 5) {
          score += 5;
          reasons.push("Senior leadership post — strong CV may still be relevant");
          reasonsZh.push("高層領導職位 — 資深履歷或仍相關");
        } else {
          score -= 8;
          reasons.push("Leadership post usually requires senior academic track record");
          reasonsZh.push("領導職位通常要求資深學術資歷");
        }
      }

      // Teaching experience
      if (
        /teaching|tutor|lectur|助教|教學/i.test(skillBlob) &&
        /professor|instructor|lecturer|teaching/i.test(position.title)
      ) {
        score += 6;
        reasons.push("Teaching experience aligns with faculty role");
        reasonsZh.push("教學經驗與教職相關");
      }

      // Research signal
      if (
        /research|publication|thesis|論文|研究/i.test(skillBlob) &&
        position.source !== "portal"
      ) {
        score += 5;
      }

      // Live listing bonus
      if (position.source === "live" || position.source === "rss") {
        score += 4;
        reasons.push("Live university career listing");
        reasonsZh.push("大學官方即時招聘資訊");
      } else {
        reasons.push("Portal entry — open official site for current vacancies");
        reasonsZh.push("入口頁 — 請至官方網站查看最新空缺");
      }

      score = Math.max(0, Math.min(100, Math.round(score)));
      if (reasons.length === 0) {
        reasons.push("Macau top-4 university faculty listing");
        reasonsZh.push("澳門四大高校教職資訊");
      }

      return {
        position,
        score,
        reasons: reasons.slice(0, 5),
        reasonsZh: reasonsZh.slice(0, 5),
      };
    })
    .sort((a, b) => b.score - a.score);
}

export function rankLabel(rank: FacultyRank, zh = false): string {
  const en: Record<FacultyRank, string> = {
    dean: "Dean",
    head: "Head of Dept.",
    full_professor: "Full Professor",
    associate_professor: "Associate Professor",
    assistant_professor: "Assistant Professor",
    research_professor: "Research Professor",
    lecturer: "Lecturer",
    instructor: "Instructor",
    other_academic: "Academic",
  };
  const z: Record<FacultyRank, string> = {
    dean: "院長",
    head: "系主任",
    full_professor: "教授",
    associate_professor: "副教授",
    assistant_professor: "助理教授",
    research_professor: "研究教授",
    lecturer: "講師",
    instructor: "導師／導師級",
    other_academic: "教學／研究",
  };
  return zh ? z[rank] : en[rank];
}
