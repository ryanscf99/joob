/**
 * DSAL Table A3 — official list of enterprises/entities with non-resident workers.
 *
 * Each row includes:
 *  - resident employees (Social Security Fund)
 *  - non-resident workers total / specialized / non-specialized (Public Security Police)
 *
 * Source PDF (quarterly): DSAL “Enterprises/Entities with non-resident workers”
 * e.g. https://www.dsal.gov.mo/download/pdf_en/statistic/nrworker/A3/A3_2025_12_TR.pdf
 *
 * Firm-level NRW for every authorised employer is public in this table — not only industry totals.
 */

import fs from "fs";
import path from "path";
import type { Sector } from "./types";
import type { EmployerWorkforce } from "./employer-transparency";

export const DSAL_A3_PDF_URL =
  "https://www.dsal.gov.mo/download/pdf_en/statistic/nrworker/A3/A3_2025_12_TR.pdf";

export const DSAL_NRW_STATS_PAGE =
  "https://www.dsal.gov.mo/en/text/download_statistics/folder/root.html";

export interface DsalNrwEntity {
  id: string;
  namePt: string;
  nameZh: string;
  industry: string;
  industryCode: string;
  residents: number;
  foreignTotal: number;
  specialized: number;
  nonSpecialized: number;
  totalEmployees: number;
  localSharePct: number | null;
  foreignSharePct: number | null;
  integratedTourismLeisure?: boolean;
}

export interface DsalNrwDataset {
  source: string;
  sourceUrl: string;
  referenceDate: string;
  asOfLabel?: string;
  fetchedNote: string;
  entityCount: number;
  entities: DsalNrwEntity[];
  cachedAt?: string;
}

const DATA_PATH = path.join(process.cwd(), "data", "dsal-nrw-a3.json");
/** Compact A3 (~2MB) — preferred cold load vs full ~4.4MB */
const COMPACT_PATH = path.join(
  process.cwd(),
  "data",
  "dsal-nrw-a3-compact.json"
);
const CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export interface DsalNrwSummary {
  entityCount: number;
  totalResidents: number;
  totalForeign: number;
  totalSpecialized: number;
  totalNonSpecialized: number;
  totalEmployees: number;
  foreignSharePct: number | null;
  byIndustry: {
    industry: string;
    entities: number;
    residents: number;
    foreign: number;
  }[];
  topForeign: DsalNrwEntity[];
  topGroups: DsalNrwGroupRow[];
  brandGroupCount: number;
  referenceDate: string;
  sourceUrl: string;
}

const g = globalThis as unknown as {
  __myeibDsalNrw?: DsalNrwDataset | null;
  __myeibDsalNrwIndex?: NrwIndex | null;
  __myeibDsalNrwSummary?: DsalNrwSummary | null;
  __myeibDsalNrwGroupCache?: Map<string, EmployerWorkforce | null>;
  /** Bump when match rules change so hot-reload drops stale wrong hits */
  __myeibNrwMatchAlgo?: number;
};

/** Brand-match algorithm version — invalidate in-process caches on change */
const NRW_MATCH_ALGO = 6;
if (g.__myeibNrwMatchAlgo !== NRW_MATCH_ALGO) {
  g.__myeibNrwMatchAlgo = NRW_MATCH_ALGO;
  g.__myeibDsalNrwGroupCache = new Map();
  // Drop stale index shapes (e.g. missing brandMembers after hot reload)
  g.__myeibDsalNrwIndex = null;
  g.__myeibDsalNrwSummary = null;
}

interface NrwIndex {
  byNorm: Map<string, DsalNrwEntity[]>;
  entities: DsalNrwEntity[];
  /** Precomputed brand → member entities (built once) */
  brandMembers: Map<string, DsalNrwEntity[]>;
}

/** Short keys used by data/dsal-nrw-a3-compact.json */
interface CompactEntity {
  z?: string;
  p?: string;
  r?: number;
  f?: number;
  t?: number;
  lp?: number | null;
  fp?: number | null;
  i?: string;
  in?: string;
  x?: number;
}

interface CompactDataset {
  referenceDate?: string;
  sourceUrl?: string;
  entityCount?: number;
  entities: CompactEntity[];
}

/** Legal entity suffixes — not brand identity */
const LEGAL_SUFFIX_RE =
  /股份有限公司|一人有限公司|有限公司|有限|公司|limitada|lda\.?|limited|company|sucursal|branch|s\.a\.?/gi;

/**
 * Industry / activity phrases shared by many unrelated firms.
 * Matching only on these causes false positives
 * (e.g. EHR人力資源管理 → 金達利人力資源管理).
 */
const GENERIC_BIZ_RE =
  /人力資源管理|人力資源顧問|人力資源服務|人力資源|物業管理|資訊科技|信息科技|商業服務|管理顧問|顧問服務|工程顧問|進出口|國際貿易|貿易|顧問|管理|服務|發展|投資基金|投資|控股|國際|集團|hotel|hotels|restaurant|restaurants?|resources?|human|administration|administra[cç][aã]o|recurso|humano|compan(?:hia|y)|servi[cç]os?|consultadoria|consulting|management|services?|investment[oe]?s?|investimento|fund|fundo|international|internacional|holding|holdings/gi;

const LATIN_MATCH_STOP = new Set([
  "and",
  "the",
  "of",
  "for",
  "macau",
  "macao",
  "hotel",
  "hotels",
  "group",
  "services",
  "service",
  "company",
  "limited",
  "limitada",
  "lda",
  "international",
  "internacional",
  "holdings",
  "holding",
  "human",
  "resources",
  "resource",
  "management",
  "admin",
  "administration",
  "consulting",
  "comercio",
  "comercial",
  // Generic finance / investment words — must not link A&P Fund ↔ Fisherman's Wharf Investimento
  "investment",
  "investments",
  "investimento",
  "investimentos",
  "fund",
  "funds",
  "fundo",
  "fundos",
  "capital",
  "finance",
  "financial",
  "asset",
  "assets",
  "global",
  "world",
  "asia",
  "china",
  "pacific",
  "companhia",
  "sociedade",
  "grupo",
]);

function normalizeName(s: string): string {
  return (s || "")
    .toLowerCase()
    .replace(/&amp;/gi, " and ")
    .replace(/&/g, " and ")
    .replace(/[（）()]/g, " ")
    .replace(LEGAL_SUFFIX_RE, " ")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Strip legal + generic industry wording → distinctive brand core */
function brandCore(s: string): string {
  return normalizeName(s)
    .replace(GENERIC_BIZ_RE, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Whole-token Latin match — prevents "investment" matching inside "investimento".
 */
function latinTokenInText(token: string, hay: string): boolean {
  if (!token || !hay) return false;
  const re = new RegExp(
    `(?:^|[^a-z0-9])${escapeRegExp(token)}(?:[^a-z0-9]|$)`,
    "i"
  );
  return re.test(hay);
}

/** Latin / alphanumeric brand tokens (e.g. EHR, CTM, MGM, AP) */
function latinBrandTokens(s: string): string[] {
  const raw = (s || "")
    .toLowerCase()
    .replace(/&amp;/gi, " and ")
    .replace(/&/g, " and ");
  // Keep letter+digit tokens; also glue A&P style via "and" split later
  const tokens = raw.match(/[a-z][a-z0-9]{1,}/g) || [];
  return tokens.filter((t) => !LATIN_MATCH_STOP.has(t) && t.length >= 2);
}

/** Remaining Chinese brand runs after stripping generics */
function zhBrandTokens(core: string): string[] {
  return (core.match(/[\u4e00-\u9fff]{2,}/g) || []).filter(
    (t) => t.length >= 2 && !STOP.has(t)
  );
}

function expandCompact(c: CompactDataset): DsalNrwDataset {
  const entities: DsalNrwEntity[] = c.entities.map((e, i) => {
    const residents = e.r || 0;
    const foreignTotal = e.f || 0;
    const total =
      e.t != null ? e.t : residents + foreignTotal;
    return {
      id: `a3c-${i}`,
      nameZh: e.z || "",
      namePt: e.p || "",
      industry: e.in || "",
      industryCode: e.i || "",
      residents,
      foreignTotal,
      specialized: 0,
      nonSpecialized: foreignTotal,
      totalEmployees: total,
      localSharePct: e.lp ?? null,
      foreignSharePct: e.fp ?? null,
      integratedTourismLeisure: e.x === 1,
    };
  });
  return {
    source: "DSAL Table A3 (compact snapshot)",
    sourceUrl: c.sourceUrl || DSAL_A3_PDF_URL,
    referenceDate: c.referenceDate || "",
    asOfLabel: c.referenceDate,
    fetchedNote:
      "Loaded from compact A3 JSON for faster server start; firm-level residents + NRW.",
    entityCount: entities.length,
    entities,
  };
}

function loadFromDisk(): DsalNrwDataset | null {
  // Prefer compact file — ~half the parse cost on cold /api/dsal/nrw
  try {
    if (fs.existsSync(COMPACT_PATH)) {
      const raw = fs.readFileSync(COMPACT_PATH, "utf8");
      const data = JSON.parse(raw) as CompactDataset;
      if (data?.entities?.length && data.entities[0] && "z" in data.entities[0]) {
        return expandCompact(data);
      }
    }
  } catch {
    /* fall through */
  }
  try {
    if (!fs.existsSync(DATA_PATH)) return null;
    const raw = fs.readFileSync(DATA_PATH, "utf8");
    const data = JSON.parse(raw) as DsalNrwDataset;
    if (!data?.entities?.length) return null;
    return data;
  } catch {
    return null;
  }
}

function buildIndex(entities: DsalNrwEntity[]): NrwIndex {
  const byNorm = new Map<string, DsalNrwEntity[]>();
  const add = (key: string, e: DsalNrwEntity) => {
    if (!key || key.length < 2) return;
    const list = byNorm.get(key) || [];
    list.push(e);
    byNorm.set(key, list);
  };
  for (const e of entities) {
    add(normalizeName(e.nameZh), e);
    add(normalizeName(e.namePt), e);
    if (e.nameZh) add(e.nameZh.toLowerCase(), e);
    if (e.namePt) add(e.namePt.toLowerCase(), e);
  }

  // One-pass brand membership — O(entities × brands) once, not per request
  const brandMembers = new Map<string, DsalNrwEntity[]>();
  for (const brand of BRAND_ALIASES) {
    const members: DsalNrwEntity[] = [];
    for (const e of entities) {
      if (
        brand.prefer.test(e.nameZh || "") ||
        brand.prefer.test(e.namePt || "")
      ) {
        members.push(e);
      }
    }
    if (members.length) brandMembers.set(brand.id, members);
  }

  return { byNorm, entities, brandMembers };
}

function groupCache() {
  if (!g.__myeibDsalNrwGroupCache) g.__myeibDsalNrwGroupCache = new Map();
  return g.__myeibDsalNrwGroupCache;
}

/** Load official A3 snapshot (server-side). Parsed once per process. */
export function getDsalNrwDataset(): DsalNrwDataset | null {
  if (g.__myeibDsalNrw) return g.__myeibDsalNrw;
  const data = loadFromDisk();
  g.__myeibDsalNrw = data;
  if (data) {
    g.__myeibDsalNrwIndex = buildIndex(data.entities);
    g.__myeibDsalNrwSummary = null; // rebuild on demand
    groupCache().clear();
  }
  return data;
}

function getIndex(): NrwIndex | null {
  const existing = g.__myeibDsalNrwIndex;
  // Guard against hot-reload / partial cache objects missing Map fields
  if (
    existing &&
    existing.byNorm instanceof Map &&
    existing.brandMembers instanceof Map &&
    Array.isArray(existing.entities)
  ) {
    return existing;
  }
  const data = getDsalNrwDataset();
  if (!data) return null;
  g.__myeibDsalNrwIndex = buildIndex(data.entities);
  return g.__myeibDsalNrwIndex;
}

const STOP = new Set([
  "and",
  "the",
  "of",
  "for",
  "macau",
  "macao",
  "hotel",
  "group",
  "services",
  "service",
  "澳門",
  "酒店",
  "集團",
  "有限",
  "公司",
]);

/** Brand aliases: listing text → distinctive Chinese/EN stems in A3 names */
const BRAND_ALIASES: {
  id: string;
  labelEn: string;
  labelZh: string;
  re: RegExp;
  prefer: RegExp;
}[] = [
  {
    id: "sands",
    labelEn: "Sands China / Venetian group",
    labelZh: "金沙中國／威尼斯人集團",
    re: /sands|sandschina|金沙|威尼斯人|venetian|parisian|londoner/i,
    prefer: /威尼斯人|金沙|SANDS|VENETIAN|PARISIAN|LONDONER/i,
  },
  {
    id: "galaxy",
    labelEn: "Galaxy Entertainment group",
    labelZh: "銀河娛樂集團",
    re: /galaxy|銀娛|銀河娛樂|geg|broadway/i,
    prefer: /銀河|GALAXY|銀娛/i,
  },
  {
    id: "melco",
    labelEn: "Melco Resorts group",
    labelZh: "新濠博亞集團",
    re: /melco|新濠|city of dreams|studio city|altira/i,
    prefer: /新濠|MELCO|STUDIO\s*CITY|CITY\s*OF\s*DREAMS/i,
  },
  {
    id: "wynn",
    labelEn: "Wynn Macau / Palace group",
    labelZh: "永利澳門／皇宮集團",
    re: /wynn|永利/i,
    prefer: /永利|WYNN/i,
  },
  {
    id: "mgm",
    labelEn: "MGM China group",
    labelZh: "美高梅中國集團",
    re: /mgm|美高梅/i,
    prefer: /美高梅|MGM/i,
  },
  {
    id: "sjm",
    labelEn: "SJM / Lisboa / Grand Lisboa group",
    labelZh: "澳娛／葡京／上葡京集團",
    re: /sjm|澳娛綜合|澳娛|lisboeta|上葡京|grande lisboa|葡京/i,
    prefer: /澳娛|上葡京|LISBOA|SJM|葡京/i,
  },
  {
    id: "mcdonalds",
    labelEn: "McDonald's Macau",
    labelZh: "澳門麥當勞",
    re: /mcdonald|麥當勞|golden burger|金濠漢堡/i,
    prefer: /金濠漢堡|麥當勞|MCDONALD|GOLDEN\s*BURGER/i,
  },
  {
    id: "starbucks",
    labelEn: "Starbucks Macau",
    labelZh: "星巴克澳門",
    re: /starbucks|星巴克/i,
    prefer: /星巴克|STARBUCKS/i,
  },
  {
    id: "yaohan",
    labelEn: "New Yaohan",
    labelZh: "新八佰伴",
    re: /new yaohan|新八佰伴|八佰伴/i,
    prefer: /八佰伴|YAOHAN/i,
  },
  {
    id: "ctm",
    labelEn: "CTM",
    labelZh: "澳門電訊",
    re: /\bctm\b|澳門電訊/i,
    prefer: /澳門電訊|CTM/i,
  },
  {
    id: "guardforce",
    labelEn: "Guardforce",
    labelZh: "衛安",
    re: /guardforce|衛安/i,
    prefer: /衛安|GUARDFORCE/i,
  },
  {
    id: "boc",
    labelEn: "Bank of China Macau",
    labelZh: "中國銀行澳門",
    re: /中國銀行|\bboc\b/i,
    prefer: /中國銀行/i,
  },
  {
    id: "ocbc",
    labelEn: "OCBC Bank Macau",
    labelZh: "華僑銀行澳門",
    re: /ocbc|華僑銀行/i,
    prefer: /華僑銀行|OCBC/i,
  },
  {
    id: "ikea",
    labelEn: "IKEA Macau",
    labelZh: "宜家澳門",
    re: /ikea|宜家/i,
    prefer: /宜家|IKEA/i,
  },
  {
    id: "must-hospital",
    labelEn: "MUST / University Hospital group",
    labelZh: "科大醫院／大學醫院",
    re: /科大醫院|must\s*hospital|科大.*醫院|大學醫院/i,
    prefer: /科大醫院|大學醫院|科技大學.*醫院|HOSPITAL\s*UNIVERSIT[AÁ]RIO/i,
  },
];

function pickTopByNrw(candidates: DsalNrwEntity[]): DsalNrwEntity | null {
  if (!candidates.length) return null;
  let top = candidates[0];
  for (let i = 1; i < candidates.length; i++) {
    const e = candidates[i];
    if (
      e.foreignTotal > top.foreignTotal ||
      (e.foreignTotal === top.foreignTotal &&
        e.totalEmployees > top.totalEmployees)
    ) {
      top = e;
    }
  }
  return top;
}

/**
 * Match a free-text company name to one A3 entity (fast path: brand packs).
 *
 * Requires a *distinctive brand* hit — not shared industry wording alone.
 * e.g. "EHR人力資源管理有限公司" must NOT match "金達利人力資源管理有限公司"
 * just because both contain 人力資源管理.
 */
export function lookupDsalNrwEntity(
  companyName: string
): DsalNrwEntity | null {
  const idx = getIndex();
  if (!idx) return null;
  const raw = (companyName || "").trim();
  if (!raw) return null;
  const n = normalizeName(raw);
  const rawLower = raw.toLowerCase();
  const qCore = brandCore(raw);
  const qLatin = latinBrandTokens(raw);
  const qZh = zhBrandTokens(qCore);

  // 1) Brand pack — O(brands) + precomputed members
  for (const brand of BRAND_ALIASES) {
    if (!brand.re.test(raw)) continue;
    const candidates = idx.brandMembers?.get?.(brand.id);
    if (candidates?.length) return pickTopByNrw(candidates);
  }

  // 2) Exact normalized map — O(1)
  for (const key of [n, rawLower, qCore].filter(Boolean)) {
    const hits = idx.byNorm?.get?.(key);
    if (hits?.length) {
      return [...hits].sort((a, b) => b.totalEmployees - a.totalEmployees)[0];
    }
  }

  // Nothing distinctive left after stripping legal + industry fluff
  // (e.g. pure "人力資源管理有限公司" with no brand, or Latin-only with no A3 hit)
  const hasDistinctive =
    qLatin.length > 0 ||
    qZh.some((t) => t.length >= 2) ||
    (qCore.length >= 3 && /[a-z0-9\u4e00-\u9fff]/.test(qCore));
  if (!hasDistinctive) return null;

  // 3) Scored scan — only on distinctive brand tokens
  let best: DsalNrwEntity | null = null;
  let bestScore = 0;
  const consider = (e: DsalNrwEntity, score: number) => {
    const adj = score + Math.min(e.totalEmployees, 50_000) / 100_000;
    if (adj > bestScore) {
      bestScore = adj;
      best = e;
    }
  };

  // Prefer longer Chinese brand tokens first
  const zhParts = [...qZh].sort((a, b) => b.length - a.length).slice(0, 4);

  for (const e of idx.entities) {
    const zh = e.nameZh || "";
    const pt = e.namePt || "";
    const hay = `${zh} ${pt}`.toLowerCase();
    const eCore = brandCore(`${zh} ${pt}`);
    const eZhCore = zhBrandTokens(eCore).join("");

    // Latin brand tokens must match as *whole words* on the A3 row
    // (fixes: "investment" falsely matching Portuguese "investimento")
    if (qLatin.length > 0) {
      const latinHits = qLatin.filter(
        (t) => latinTokenInText(t, hay) || latinTokenInText(t, eCore)
      );
      if (latinHits.length === 0) {
        // No Latin overlap — only continue if Chinese brand cores align strongly
        if (zhParts.length === 0) continue;
        const strongZh = zhParts.find(
          (p) => p.length >= 3 && (zh.includes(p) || eZhCore.includes(p))
        );
        if (!strongZh) continue;
      } else {
        const primary = [...qLatin].sort((a, b) => b.length - a.length)[0];
        const primaryOk =
          primary &&
          (latinTokenInText(primary, hay) || latinTokenInText(primary, eCore));
        // Require the longest brand token (e.g. proper name), not only generic leftovers
        if (!primaryOk) {
          const support = zhParts.find(
            (p) => p.length >= 3 && zh.includes(p)
          );
          if (!support) continue;
        }
        // If query has 2+ distinctive Latin tokens, need ≥2 hits (or full set if only 2)
        if (qLatin.length >= 2 && latinHits.length < Math.min(2, qLatin.length)) {
          continue;
        }
        // Prefer entities that share a high fraction of query Latin tokens
        const coverage = latinHits.length / qLatin.length;
        if (coverage < 0.5 && !zhParts.some((p) => p.length >= 3 && zh.includes(p))) {
          continue;
        }
        // Light size tie-break only among true brand hits (not the old N+1 headcount blowout)
        const sizeTie =
          coverage >= 0.99
            ? Math.min(e.totalEmployees, 20_000) / 50_000
            : Math.min(e.totalEmployees, 200) / 5_000;
        consider(
          e,
          1200 +
            latinHits.reduce((s, t) => s + t.length * 30, 0) +
            coverage * 200 +
            sizeTie +
            // Prefer non-shop main entities when query is not a shop name
            (/（.*店）|\(.*店\)|分店|專門店/.test(zh) ? -250 : 0)
        );
        // Do not early-exit on medium scores — keep scanning for better brand fit
        continue;
      }
    }

    // Chinese brand-core inclusion (not full legal/industry string)
    for (const part of zhParts) {
      // Short 2-char tokens need exact brand-core equality, not loose contains
      if (part.length < 3) {
        if (eZhCore === part || brandCore(zh) === part) {
          consider(e, 700 + part.length * 40);
        }
        continue;
      }
      if (!zh.includes(part) && !eCore.includes(part)) continue;

      // Reject if the only reason it matches is still mostly generic residue
      // (candidate brand core must share the distinctive part)
      if (!eCore.includes(part) && !zh.includes(part)) continue;

      const isShop =
        /（.*店）|\(.*店\)|分店|專門店/.test(zh) && part.length < 4;
      // Query brand core fully equals entity brand core
      const coreEq =
        qCore.length >= 2 &&
        (qCore === eCore || qCore === brandCore(zh) || qCore === brandCore(pt));
      consider(
        e,
        (coreEq ? 2000 : 800) +
          part.length * 50 +
          e.totalEmployees / 2000 +
          (isShop ? -400 : 0) +
          (e.integratedTourismLeisure ? 40 : 0)
      );
      break;
    }

    // Full brand-core equality / mutual containment (Latin or mixed)
    if (qCore.length >= 3) {
      if (eCore === qCore || brandCore(zh) === qCore || brandCore(pt) === qCore) {
        consider(e, 2500);
      } else if (
        eCore.length >= 3 &&
        (eCore.includes(qCore) || qCore.includes(eCore))
      ) {
        // Containment only when both cores are non-trivial and ratio is close
        const ratio =
          Math.min(eCore.length, qCore.length) /
          Math.max(eCore.length, qCore.length);
        if (ratio >= 0.55) consider(e, 900 + ratio * 200);
      }
    }

    if (bestScore >= 2000) break;
  }

  // High bar: industry-only overlaps must not pass
  return bestScore >= 700 ? best : null;
}

/** Map A3 industry code/name → MYEIB sector. */
export function industryToSector(industry: string, code?: string): Sector {
  const b = `${code || ""} ${industry}`.toLowerCase();
  if (/hotel|restaurant|h\b|飲食|酒店/.test(b)) return "hospitality";
  if (/recreational|gaming|cultural|o\b|博彩|文娛/.test(b)) return "mice";
  if (/wholesale|retail|g\b|零售|批發/.test(b)) return "retail";
  if (/financial|j\b|金融|銀行/.test(b)) return "finance";
  if (/education|m\b|教育/.test(b)) return "education";
  if (/health|n\b|衛生|福利/.test(b)) return "big-health";
  if (/transport|communication|i\b|運輸|通訊/.test(b)) return "tech";
  if (/manufactur|d\b|製造/.test(b)) return "other";
  if (/construction|f\b|建築|electric|e\b/.test(b)) return "other";
  if (/real estate|business|k\b|地產/.test(b)) return "other";
  return "other";
}

export function entityToWorkforce(e: DsalNrwEntity): EmployerWorkforce {
  return {
    id: e.id,
    name: e.namePt || e.nameZh || e.id,
    nameZh: e.nameZh || e.namePt || e.id,
    aliases: [e.namePt, e.nameZh].filter(Boolean),
    sector: industryToSector(e.industry, e.industryCode),
    totalEmployees: e.totalEmployees,
    localEmployees: e.residents,
    foreignEmployees: e.foreignTotal,
    localSharePct: e.localSharePct,
    foreignSharePct: e.foreignSharePct,
    asOf: "2025-12 (DSAL A3)",
    confidence: "reported",
    source:
      "DSAL Table A3 — enterprises/entities with non-resident workers (residents: FSS; NRW: CPSP)",
    sourceZh:
      "勞工局表A3《聘用外地僱員企業/實體名單》（本地僱員：社會保障基金；外地僱員：治安警察局）",
    note: e.integratedTourismLeisure
      ? "Marked as integrated tourism & leisure related entity in DSAL list (*)."
      : "Official firm-level headcount from the public DSAL entity list.",
    noteZh: e.integratedTourismLeisure
      ? "勞工局名單標註為綜合旅遊休閒相關實體（*）。"
      : "勞工局公開企業/實體名單中的官方人手數據。",
    entityCount: 1,
  };
}

function collectGroupEntities(
  companyName: string
): {
  members: DsalNrwEntity[];
  brand?: (typeof BRAND_ALIASES)[0];
  seed: DsalNrwEntity | null;
} {
  const idx = getIndex();
  if (!idx) return { members: [], seed: null };

  const raw = companyName || "";

  // Brand pack from precomputed members — O(brands)
  for (const brand of BRAND_ALIASES) {
    if (!brand.re.test(raw)) continue;
    const members = idx.brandMembers?.get?.(brand.id);
    if (members?.length) {
      return {
        members,
        brand,
        seed: pickTopByNrw(members),
      };
    }
  }

  const seed = lookupDsalNrwEntity(companyName);
  if (!seed) return { members: [], seed: null };

  // If seed belongs to a brand pack, use full pack
  for (const brand of BRAND_ALIASES) {
    if (
      brand.prefer.test(seed.nameZh || "") ||
      brand.prefer.test(seed.namePt || "")
    ) {
      const members = idx.brandMembers?.get?.(brand.id);
      if (members?.length) return { members, brand, seed };
    }
  }

  // Singleton — no expensive full-table sibling scan (was O(n) per company)
  return { members: [seed], seed };
}

/**
 * Resolve workforce for a listing company by aggregating related DSAL A3
 * legal entities in the same corporate group (e.g. all Venetian / Sands rows).
 * Memoized per process for repeated company keys.
 */
export function resolveDsalWorkforceGroup(
  companyName: string
): EmployerWorkforce | null {
  const key = (companyName || "").trim().toLowerCase();
  if (!key) return null;
  const cache = groupCache();
  if (cache.has(key)) return cache.get(key) ?? null;

  const { members, brand, seed } = collectGroupEntities(companyName);
  if (!members.length) {
    const alone = seed ? entityToWorkforce(seed) : null;
    cache.set(key, alone);
    return alone;
  }

  let residents = 0;
  let foreign = 0;
  let specialized = 0;
  let nonSpecialized = 0;
  for (const e of members) {
    residents += e.residents || 0;
    foreign += e.foreignTotal || 0;
    specialized += e.specialized || 0;
    nonSpecialized += e.nonSpecialized || 0;
  }
  const total = residents + foreign;
  const localSharePct = total
    ? Math.round((residents / total) * 1000) / 10
    : null;
  const foreignSharePct = total
    ? Math.round((foreign / total) * 1000) / 10
    : null;

  const topMembers = [...members]
    .sort((a, b) => b.foreignTotal - a.foreignTotal)
    .slice(0, 8)
    .map((e) => ({
      nameZh: e.nameZh || e.namePt,
      namePt: e.namePt || e.nameZh,
      residents: e.residents,
      foreignTotal: e.foreignTotal,
      totalEmployees: e.totalEmployees,
    }));

  const primary = seed || members[0];
  const groupEn = brand?.labelEn || primary.namePt || primary.nameZh;
  const groupZh = brand?.labelZh || primary.nameZh || primary.namePt;

  const result: EmployerWorkforce = {
    id: brand ? `dsal-group-${brand.id}` : `dsal-group-${primary.id}`,
    name: groupEn,
    nameZh: groupZh,
    aliases: members.flatMap((m) => [m.nameZh, m.namePt]).filter(Boolean),
    sector: industryToSector(primary.industry, primary.industryCode),
    totalEmployees: total,
    localEmployees: residents,
    foreignEmployees: foreign,
    localSharePct,
    foreignSharePct,
    asOf: "2025-12 (DSAL A3, group aggregate)",
    confidence: "reported",
    source:
      "DSAL Table A3 — summed across related legal entities (residents: FSS; NRW: CPSP)",
    sourceZh:
      "勞工局表A3 — 將同一集團相關法人實體加總（本地：社保基金；外地：治安警察局）",
    note:
      members.length > 1
        ? `Aggregated ${members.length} DSAL A3 entities in this group (local ${residents.toLocaleString()} + non-resident ${foreign.toLocaleString()}). Single-entity rows can understate group NRW.`
        : "Single matched DSAL A3 legal entity.",
    noteZh:
      members.length > 1
        ? `已合併本集團 ${members.length} 個勞工局 A3 法人實體（本地 ${residents.toLocaleString()} + 外地 ${foreign.toLocaleString()}）。單一實體列可能低估集團外僱規模。`
        : "僅匹配到單一 A3 法人實體。",
    isAggregate: members.length > 1,
    entityCount: members.length,
    groupLabel: groupEn,
    groupLabelZh: groupZh,
    members: topMembers,
  };
  cache.set(key, result);
  return result;
}

export interface DsalNrwGroupRow {
  id: string;
  nameEn: string;
  nameZh: string;
  entityCount: number;
  residents: number;
  foreignTotal: number;
  totalEmployees: number;
  localSharePct: number | null;
  foreignSharePct: number | null;
  /** Dominant industry among members */
  industry: string;
  isBrandGroup: boolean;
  topMembers: {
    nameZh: string;
    namePt: string;
    residents: number;
    foreignTotal: number;
  }[];
}

/**
 * Roll every A3 legal entity into corporate groups (Sands, Galaxy, …)
 * for dashboard ranking — avoids understating NRW by listing SPVs separately.
 */
export function buildCorporateGroupRanking(
  entities: DsalNrwEntity[],
  limit = 30
): DsalNrwGroupRow[] {
  type Acc = {
    id: string;
    nameEn: string;
    nameZh: string;
    isBrandGroup: boolean;
    members: DsalNrwEntity[];
  };

  const brandBuckets = new Map<string, Acc>();
  const assigned = new Set<string>();

  // 1) Brand packs from precomputed index (fast)
  const idx = getIndex();
  for (const brand of BRAND_ALIASES) {
    const members =
      idx?.brandMembers.get(brand.id) ||
      entities.filter(
        (e) =>
          brand.prefer.test(e.nameZh || "") || brand.prefer.test(e.namePt || "")
      );
    if (!members.length) continue;
    brandBuckets.set(brand.id, {
      id: brand.id,
      nameEn: brand.labelEn,
      nameZh: brand.labelZh,
      isBrandGroup: true,
      members,
    });
    for (const m of members) assigned.add(m.id);
  }

  // 2) Remaining entities stay as singleton "groups" (true independents)
  const singles: Acc[] = [];
  for (const e of entities) {
    if (assigned.has(e.id)) continue;
    // Skip tiny shop-in-mall noise for ranking clutter if NRW is 0
    singles.push({
      id: e.id,
      nameEn: e.namePt || e.nameZh || e.id,
      nameZh: e.nameZh || e.namePt || e.id,
      isBrandGroup: false,
      members: [e],
    });
  }

  const toRow = (acc: Acc): DsalNrwGroupRow => {
    let residents = 0;
    let foreign = 0;
    const industryCount = new Map<string, number>();
    for (const e of acc.members) {
      residents += e.residents || 0;
      foreign += e.foreignTotal || 0;
      const ind = e.industry || e.industryCode || "Unknown";
      industryCount.set(ind, (industryCount.get(ind) || 0) + 1);
    }
    const total = residents + foreign;
    const industry =
      [...industryCount.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ||
      "Unknown";
    const topMembers = [...acc.members]
      .sort((a, b) => b.foreignTotal - a.foreignTotal)
      .slice(0, 6)
      .map((e) => ({
        nameZh: e.nameZh || e.namePt,
        namePt: e.namePt || e.nameZh,
        residents: e.residents,
        foreignTotal: e.foreignTotal,
      }));

    return {
      id: acc.id,
      nameEn: acc.nameEn,
      nameZh: acc.nameZh,
      entityCount: acc.members.length,
      residents,
      foreignTotal: foreign,
      totalEmployees: total,
      localSharePct: total
        ? Math.round((residents / total) * 1000) / 10
        : null,
      foreignSharePct: total
        ? Math.round((foreign / total) * 1000) / 10
        : null,
      industry,
      isBrandGroup: acc.isBrandGroup,
      topMembers,
    };
  };

  const brandRows = [...brandBuckets.values()].map(toRow);
  // For top ranking include brand groups + only high-NRW singles
  const singleRows = singles
    .map(toRow)
    .filter((r) => r.foreignTotal >= 50); // keep table focused

  return [...brandRows, ...singleRows]
    .sort((a, b) => b.foreignTotal - a.foreignTotal)
    .slice(0, limit);
}

/** Aggregate stats for dashboard / API (memoized per process). */
export function summarizeDsalNrw(data: DsalNrwDataset): DsalNrwSummary {
  if (g.__myeibDsalNrwSummary && g.__myeibDsalNrw === data) {
    return g.__myeibDsalNrwSummary;
  }

  let residents = 0;
  let foreign = 0;
  let specialized = 0;
  let nonSpecialized = 0;
  const byIndustry = new Map<
    string,
    { entities: number; residents: number; foreign: number }
  >();

  for (const e of data.entities) {
    residents += e.residents;
    foreign += e.foreignTotal;
    specialized += e.specialized;
    nonSpecialized += e.nonSpecialized;
    const key = e.industry || e.industryCode || "Unknown";
    const row = byIndustry.get(key) || {
      entities: 0,
      residents: 0,
      foreign: 0,
    };
    row.entities += 1;
    row.residents += e.residents;
    row.foreign += e.foreignTotal;
    byIndustry.set(key, row);
  }

  const topForeign = [...data.entities]
    .sort((a, b) => b.foreignTotal - a.foreignTotal)
    .slice(0, 25);

  const topGroups = buildCorporateGroupRanking(data.entities, 30);
  const brandGroupCount = topGroups.filter((g) => g.isBrandGroup).length;

  const summary: DsalNrwSummary = {
    entityCount: data.entities.length,
    totalResidents: residents,
    totalForeign: foreign,
    totalSpecialized: specialized,
    totalNonSpecialized: nonSpecialized,
    totalEmployees: residents + foreign,
    foreignSharePct:
      residents + foreign > 0
        ? Math.round((foreign / (residents + foreign)) * 1000) / 10
        : null,
    byIndustry: [...byIndustry.entries()]
      .map(([industry, v]) => ({ industry, ...v }))
      .sort((a, b) => b.foreign - a.foreign),
    topForeign,
    /** Corporate-group aggregates for labour dashboard */
    topGroups,
    brandGroupCount,
    referenceDate: data.referenceDate,
    sourceUrl: data.sourceUrl,
  };
  g.__myeibDsalNrwSummary = summary;
  return summary;
}

/**
 * Re-download A3 PDF and rebuild dataset (server-only, expensive).
 * Uses pdf-parse; writes data/dsal-nrw-a3.json.
 */
export async function refreshDsalNrwFromPdf(opts?: {
  pdfUrl?: string;
}): Promise<DsalNrwDataset> {
  const pdfUrl = opts?.pdfUrl || DSAL_A3_PDF_URL;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 120_000);
  try {
    const res = await fetch(pdfUrl, {
      headers: {
        "User-Agent": "MYEIB-MacauYouthEmploymentBridge/1.0 (research pilot)",
        Accept: "application/pdf",
      },
      signal: controller.signal,
      cache: "no-store",
    });
    if (!res.ok) throw new Error(`DSAL A3 PDF HTTP ${res.status}`);
    const buf = Buffer.from(await res.arrayBuffer());

    // pdf-parse v2
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { PDFParse } = require("pdf-parse") as {
      PDFParse: new (opts: { data: Buffer }) => {
        getText: () => Promise<{ text: string; total?: number }>;
      };
    };
    const parser = new PDFParse({ data: buf });
    const extracted = await parser.getText();
    const text = extracted.text || "";
    const entities = parseA3Text(text);

    const dataset: DsalNrwDataset = {
      source:
        "DSAL Table A3 — List of enterprises/entities with non-resident workers",
      sourceUrl: pdfUrl,
      referenceDate: guessReferenceDate(text) || new Date().toISOString().slice(0, 10),
      asOfLabel: guessAsOfLabel(text),
      fetchedNote:
        "Residents: Social Security Fund. Non-resident workers: Public Security Police Force. Published by DSAL.",
      entityCount: entities.length,
      entities,
      cachedAt: new Date().toISOString(),
    };

    fs.mkdirSync(path.dirname(DATA_PATH), { recursive: true });
    fs.writeFileSync(DATA_PATH, JSON.stringify(dataset), "utf8");
    g.__myeibDsalNrw = dataset;
    g.__myeibDsalNrwIndex = buildIndex(entities);
    return dataset;
  } finally {
    clearTimeout(timer);
  }
}

function guessReferenceDate(text: string): string | null {
  const m = text.match(
    /End of (January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{4})/i
  );
  if (!m) return null;
  const months: Record<string, string> = {
    january: "01",
    february: "02",
    march: "03",
    april: "04",
    may: "05",
    june: "06",
    july: "07",
    august: "08",
    september: "09",
    october: "10",
    november: "11",
    december: "12",
  };
  const mm = months[m[1].toLowerCase()];
  return mm ? `${m[2]}-${mm}-01` : null;
}

function guessAsOfLabel(text: string): string | undefined {
  const m = text.match(
    /End of (January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{4})/i
  );
  return m ? `End of ${m[1]} ${m[2]}` : undefined;
}

/** Pure parser for DSAL A3 extracted PDF text. */
export function parseA3Text(text: string): DsalNrwEntity[] {
  const lines = text.split(/\r?\n/);
  const ROW = /^(\d+)\t(\d+)\t(\d+)\t(\d+)(?:\t(.*))?$/;
  const IND =
    /^([A-Z])\tInudstry\s+\tTotal no\. of ent\.:\s*(\d+)\t(.+)$/;

  const CODE_IND: Record<string, string> = {
    A: "Agriculture, farming of animals, hunting and forestry",
    D: "Manufacturing",
    E: "Electricity, gas and water supply",
    F: "Construction",
    G: "Wholesale and retail trade",
    H: "Hotels, restaurants and similar activities",
    I: "Transport, storage and communication",
    J: "Financial intermediation",
    K: "Real estate and business activities",
    L: "Public administration & social security",
    M: "Education",
    N: "Health and social welfare",
    O: "Recreational, cultural, gaming & other services",
  };

  const isNoise = (l: string) => {
    const s = l.trim();
    if (!s) return true;
    if (
      /^(Table A3|Source:|Reference date:|Page |Portuguese name|Chinese name|Resi-|dents|TotalSpecialized|Non-specialized|Non-resident workers|Specialized|-- |Total)/i.test(
        s
      )
    )
      return true;
    if (/Social Security Fund|Public Security Police/i.test(s)) return true;
    if (/^[A-Z]Industry\b/i.test(s)) return true;
    if (/^Non-?\s*specialized/i.test(s)) return true;
    return false;
  };

  const cleanName = (s: string) =>
    (s || "")
      .replace(/\s+/g, " ")
      .replace(/\bNon-?\s*specialized\b.*$/i, "")
      .replace(/\bSpecialized\b.*$/i, "")
      .replace(/\bInudstry\b.*$/i, "")
      .replace(/\bIndustry\b.*$/i, "")
      .trim()
      .replace(/^[\s\-*]+|[\s\-*]+$/g, "");

  const entities: DsalNrwEntity[] = [];
  let industry = "";
  let industryCode = "";
  let pending: {
    residents: number;
    foreignTotal: number;
    specialized: number;
    nonSpecialized: number;
    namePt: string;
    nameZh: string;
  } | null = null;
  let nameBuf: string[] = [];
  let leisureFlag = false;

  const flush = () => {
    if (!pending) return;
    let pt = pending.namePt;
    let zh = pending.nameZh;
    const joined = nameBuf.join(" ").trim();
    if (joined) {
      const m = joined.match(/([\u4e00-\u9fff].*)/);
      if (m) {
        zh = `${zh} ${m[1]}`.trim();
        pt = `${pt} ${joined.slice(0, m.index)}`.trim();
      } else if (joined.includes("\t")) {
        const [a, b] = joined.split("\t", 2);
        pt = `${pt} ${a}`.trim();
        zh = `${zh} ${b}`.trim();
      } else if (/[\u4e00-\u9fff]/.test(joined)) {
        zh = `${zh} ${joined}`.trim();
      } else {
        pt = `${pt} ${joined}`.trim();
      }
    }
    pt = cleanName(pt);
    zh = cleanName(zh);
    const total = pending.residents + pending.foreignTotal;
    const code = industryCode;
    const indName = CODE_IND[code] || industry;
    entities.push({
      id: `dsal-a3-${entities.length + 1}`,
      namePt: pt,
      nameZh: zh,
      industry: indName,
      industryCode: code,
      residents: pending.residents,
      foreignTotal: pending.foreignTotal,
      specialized: pending.specialized,
      nonSpecialized: pending.nonSpecialized,
      totalEmployees: total,
      localSharePct: total
        ? Math.round((pending.residents / total) * 1000) / 10
        : null,
      foreignSharePct: total
        ? Math.round((pending.foreignTotal / total) * 1000) / 10
        : null,
      integratedTourismLeisure: leisureFlag,
    });
    pending = null;
    nameBuf = [];
    leisureFlag = false;
  };

  for (const l of lines) {
    const ind = l.match(IND);
    if (ind) {
      flush();
      industryCode = ind[1];
      industry = ind[3].trim();
      continue;
    }
    if (isNoise(l)) continue;
    const rm = l.match(ROW);
    if (rm) {
      flush();
      const rest = rm[5];
      pending = {
        residents: Number(rm[1]),
        foreignTotal: Number(rm[2]),
        specialized: Number(rm[3]),
        nonSpecialized: Number(rm[4]),
        namePt: "",
        nameZh: "",
      };
      nameBuf = [];
      leisureFlag = false;
      if (rest) {
        if (rest.includes("*")) leisureFlag = true;
        if (rest.includes("\t")) {
          const [a, b] = rest.split("\t", 2);
          pending.namePt = a;
          pending.nameZh = b;
          flush();
        } else {
          nameBuf.push(rest);
        }
      }
      continue;
    }
    if (pending) {
      if (l.includes("*")) leisureFlag = true;
      nameBuf.push(l.trim());
    }
  }
  flush();
  return entities;
}

export function dsalNrwCacheAgeMs(): number | null {
  try {
    if (!fs.existsSync(DATA_PATH)) return null;
    return Date.now() - fs.statSync(DATA_PATH).mtimeMs;
  } catch {
    return null;
  }
}

export function shouldRefreshDsalNrw(): boolean {
  const age = dsalNrwCacheAgeMs();
  return age == null || age > CACHE_TTL_MS;
}
