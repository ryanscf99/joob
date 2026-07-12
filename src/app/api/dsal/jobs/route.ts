import { NextRequest, NextResponse } from "next/server";
import {
  DSAL_YOUTH_CATEGORY_GROUPS,
  dsalFetchJson,
  mapDsalJobToPosting,
  mapPool,
  type DsalCatalogCategory,
  type DsalRawJob,
} from "@/lib/dsal";
import {
  DSAL_CACHE_TTL_MS,
  getDsalCache,
  setDsalCache,
  withDsalInflight,
  type DsalJobsPayload,
} from "@/lib/dsal-cache";
import type { JobPosting } from "@/lib/types";

export const dynamic = "force-dynamic";

interface PageResult {
  content?: DsalRawJob[];
  totalElements?: number;
}

async function fetchCatalog() {
  return dsalFetchJson<{
    summary?: { keyCn: string; value: number }[];
    categories?: DsalCatalogCategory[];
  }>("/v1/joboffers/localvancancy/catalog");
}

async function fetchByCategory(
  groupId: string,
  categoryId: string,
  size: number
): Promise<DsalRawJob[]> {
  try {
    const page = await dsalFetchJson<PageResult>(
      "/v1/joboffers/localvancancy",
      {
        categoryGroupId: groupId,
        categoryId,
        page: 0,
        size,
      }
    );
    return page.content || [];
  } catch {
    return [];
  }
}

async function fetchByKeyword(
  keyword: string,
  size: number
): Promise<DsalRawJob[]> {
  try {
    const page = await dsalFetchJson<PageResult>("/v1/joboffers/search", {
      keyword,
      page: 0,
      size,
    });
    return page.content || [];
  } catch {
    return [];
  }
}

function dedupe(raws: DsalRawJob[]): DsalRawJob[] {
  const seen = new Set<string>();
  const out: DsalRawJob[] = [];
  for (const item of raws) {
    if (!item?.jobOfferId || seen.has(item.jobOfferId)) continue;
    if (item.isValid === 0) continue;
    seen.add(item.jobOfferId);
    out.push(item);
  }
  return out;
}

/**
 * Efficient youth fetch:
 * 1) catalog (1 call) + a few large keyword searches in parallel
 * 2) only the TOP subcategory per youth group (not 4 each) — all in parallel
 * Previously: ~30+ sequential HTTP calls. Now: ~1 + ~4 + ~7 ≈ 12 concurrent.
 */
async function fetchYouthJobs(limit: number): Promise<{
  raws: DsalRawJob[];
  totalVacancies: number | null;
  professionCount: number | null;
}> {
  // Broad keywords; larger page size reduces number of round-trips
  const keywords =
    limit > 60
      ? [" ", "助理", "服務員", "文員"]
      : [" ", "助理", "服務員"];

  const pageSize = Math.min(50, Math.max(25, Math.ceil(limit / keywords.length)));

  // Wave 1: catalog + keyword searches together
  const [catalog, ...keywordBatches] = await Promise.all([
    fetchCatalog(),
    ...keywords.map((kw) => fetchByKeyword(kw, pageSize)),
  ]);

  const summary = catalog.summary || [];
  const totalVacancies =
    summary.find((s) => /空缺|vacanc/i.test(s.keyCn))?.value ??
    summary[1]?.value ??
    null;
  const professionCount =
    summary.find((s) => /工種|profession/i.test(s.keyCn))?.value ??
    summary[0]?.value ??
    null;

  let raws = dedupe(keywordBatches.flat());

  // Wave 2: only if we still need more — top subcat per youth group, parallel
  if (raws.length < limit) {
    const categories = catalog.categories || [];
    const targets: { groupId: string; categoryId: string }[] = [];

    for (const groupId of DSAL_YOUTH_CATEGORY_GROUPS) {
      const cat = categories.find((c) => c.id === groupId);
      if (!cat?.subCategories?.length) continue;
      // Pick the subcategory with the most vacancies (best coverage per call)
      const sorted = [...cat.subCategories].sort(
        (a, b) => (b.metaDatas?.[0]?.value ?? 0) - (a.metaDatas?.[0]?.value ?? 0)
      );
      targets.push({ groupId, categoryId: sorted[0].id });
    }

    const perCat = Math.min(12, Math.max(6, Math.ceil((limit - raws.length) / Math.max(1, targets.length))));
    const catBatches = await mapPool(targets, 6, (t) =>
      fetchByCategory(t.groupId, t.categoryId, perCat)
    );
    raws = dedupe([...raws, ...catBatches.flat()]);
  }

  return {
    raws: raws.slice(0, limit),
    totalVacancies,
    professionCount,
  };
}

async function fetchAllJobs(limit: number) {
  // Fewer keywords, larger pages, fully parallel
  const keywords = [" ", "助理", "服務員", "文員", "技術員"];
  const pageSize = Math.min(50, Math.ceil(limit / 2));
  const [catalog, ...batches] = await Promise.all([
    fetchCatalog(),
    ...keywords.map((kw) => fetchByKeyword(kw, pageSize)),
  ]);
  const summary = catalog.summary || [];
  return {
    raws: dedupe(batches.flat()).slice(0, limit),
    totalVacancies:
      summary.find((s) => /空缺|vacanc/i.test(s.keyCn))?.value ??
      summary[1]?.value ??
      null,
    professionCount:
      summary.find((s) => /工種|profession/i.test(s.keyCn))?.value ??
      summary[0]?.value ??
      null,
  };
}

async function buildPayload(
  mode: string,
  q: string,
  limit: number
): Promise<DsalJobsPayload> {
  let raws: DsalRawJob[] = [];
  let totalVacancies: number | null = null;
  let professionCount: number | null = null;

  if (mode === "search" && q.trim()) {
    const [catalog, searchHits] = await Promise.all([
      fetchCatalog().catch(() => null),
      fetchByKeyword(q.trim(), limit),
    ]);
    raws = dedupe(searchHits).slice(0, limit);
    const summary = catalog?.summary || [];
    totalVacancies =
      summary.find((s) => /空缺|vacanc/i.test(s.keyCn))?.value ?? null;
    professionCount =
      summary.find((s) => /工種|profession/i.test(s.keyCn))?.value ?? null;
  } else if (mode === "all") {
    ({ raws, totalVacancies, professionCount } = await fetchAllJobs(limit));
  } else {
    ({ raws, totalVacancies, professionCount } = await fetchYouthJobs(limit));
  }

  const jobs: JobPosting[] = raws.map(mapDsalJobToPosting);

  return {
    ok: true,
    source: "DSAL Labour Affairs Bureau",
    sourceUrl: "https://www.dsal.gov.mo/jobseeking/app/",
    note:
      "Live local vacancies from the official DSAL online job-matching service. Not from data.gov.mo (which publishes aggregates, not individual job ads).",
    fetchedAt: new Date().toISOString(),
    cached: false,
    stats: {
      officialTotalVacancies: totalVacancies,
      officialProfessionCount: professionCount,
      returned: jobs.length,
    },
    jobs,
  };
}

/**
 * GET /api/dsal/jobs
 * Query:
 *  - mode=youth|all|search
 *  - q=keyword
 *  - limit= (default 80, max 120)
 *  - force=1  bypass server cache
 */
export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const mode = searchParams.get("mode") || "youth";
  const q = searchParams.get("q") || "";
  const force = searchParams.get("force") === "1";
  const limit = Math.min(
    120,
    Math.max(10, Number(searchParams.get("limit") || 80))
  );

  const cacheKey = `${mode}|${q.trim()}|${limit}`;

  try {
    if (!force) {
      const hit = getDsalCache(cacheKey);
      if (hit) {
        return NextResponse.json(hit, {
          headers: {
            "Cache-Control": `public, max-age=60, s-maxage=${Math.floor(DSAL_CACHE_TTL_MS / 1000)}, stale-while-revalidate=120`,
            "X-MYEIB-Cache": "HIT",
          },
        });
      }
    }

    const payload = await withDsalInflight(cacheKey, () =>
      buildPayload(mode, q, limit)
    );
    setDsalCache(cacheKey, payload);

    return NextResponse.json(
      { ...payload, cached: false },
      {
        headers: {
          "Cache-Control": `public, max-age=60, s-maxage=${Math.floor(DSAL_CACHE_TTL_MS / 1000)}, stale-while-revalidate=120`,
          "X-MYEIB-Cache": force ? "BYPASS" : "MISS",
        },
      }
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    // Stale cache fallback if network fails mid-refresh
    const stale = getDsalCache(cacheKey);
    if (stale) {
      return NextResponse.json(
        { ...stale, note: `Serving cached data after error: ${message}` },
        { headers: { "X-MYEIB-Cache": "STALE" } }
      );
    }
    return NextResponse.json(
      {
        ok: false,
        error: message,
        jobs: [],
        note: "Could not reach DSAL. Using in-app listings only.",
      },
      { status: 502 }
    );
  }
}
