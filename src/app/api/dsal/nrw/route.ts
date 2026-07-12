import { NextRequest, NextResponse } from "next/server";
import {
  DSAL_A3_PDF_URL,
  getDsalNrwDataset,
  refreshDsalNrwFromPdf,
  summarizeDsalNrw,
  dsalNrwCacheAgeMs,
  resolveDsalWorkforceGroup,
} from "@/lib/dsal-nrw";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

const g = globalThis as unknown as {
  __myeibNrwSummaryJson?: { at: number; body: unknown };
};

const SUMMARY_TTL_MS = 10 * 60 * 1000;

function jsonCached(body: unknown, cacheHit: boolean) {
  return NextResponse.json(body, {
    headers: {
      "Cache-Control": "public, max-age=60, s-maxage=300, stale-while-revalidate=600",
      "X-MYEIB-NRW-Cache": cacheHit ? "HIT" : "MISS",
    },
  });
}

/**
 * GET /api/dsal/nrw
 *  - (default) summary + top groups
 *  - ?q=company  → single group lookup
 *  - ?names=a|b|c → batch lookup
 *  - force=1 → re-download PDF (slow)
 *
 * POST /api/dsal/nrw  { names: string[] }  → faster batch (JSON body)
 */
async function ensureDataset(force: boolean) {
  if (force) {
    await refreshDsalNrwFromPdf();
  }
  let data = getDsalNrwDataset();
  if (!data) {
    data = await refreshDsalNrwFromPdf();
  }
  return data;
}

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const force = searchParams.get("force") === "1";
  const q = searchParams.get("q") || "";
  const namesParam = searchParams.get("names") || "";

  try {
    const data = await ensureDataset(force);

    if (q.trim()) {
      const match = resolveDsalWorkforceGroup(q.trim());
      return jsonCached(
        {
          ok: true,
          mode: "lookup",
          query: q.trim(),
          match,
          referenceDate: data.referenceDate,
          sourceUrl: data.sourceUrl,
        },
        false
      );
    }

    if (namesParam.trim()) {
      const names = namesParam
        .split("|")
        .map((s) => s.trim())
        .filter(Boolean)
        .slice(0, 120);
      const matches: Record<string, NonNullable<ReturnType<typeof resolveDsalWorkforceGroup>>> =
        {};
      for (const name of names) {
        const w = resolveDsalWorkforceGroup(name);
        if (w) matches[name] = w;
      }
      return jsonCached(
        {
          ok: true,
          mode: "batch",
          requested: names.length,
          matched: Object.keys(matches).length,
          matches,
          referenceDate: data.referenceDate,
          sourceUrl: data.sourceUrl,
        },
        false
      );
    }

    // Summary — heavily cached in memory
    if (
      !force &&
      g.__myeibNrwSummaryJson &&
      Date.now() - g.__myeibNrwSummaryJson.at < SUMMARY_TTL_MS
    ) {
      return jsonCached(g.__myeibNrwSummaryJson.body, true);
    }

    const summary = summarizeDsalNrw(data);
    const body = {
      ok: true,
      mode: "summary",
      source: data.source,
      sourceUrl: data.sourceUrl || DSAL_A3_PDF_URL,
      referenceDate: data.referenceDate,
      asOfLabel: data.asOfLabel,
      note: data.fetchedNote,
      cacheAgeMs: dsalNrwCacheAgeMs(),
      entityCount: summary.entityCount,
      summary,
      topForeign: summary.topForeign.map((e) => ({
        nameZh: e.nameZh,
        namePt: e.namePt,
        residents: e.residents,
        foreignTotal: e.foreignTotal,
        totalEmployees: e.totalEmployees,
        localSharePct: e.localSharePct,
        foreignSharePct: e.foreignSharePct,
        industry: e.industry,
        integratedTourismLeisure: e.integratedTourismLeisure,
      })),
      topGroups: summary.topGroups,
      brandGroupCount: summary.brandGroupCount,
    };
    g.__myeibNrwSummaryJson = { at: Date.now(), body };
    return jsonCached(body, false);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as { names?: string[]; force?: boolean };
    const data = await ensureDataset(!!body.force);
    const names = (body.names || [])
      .map((s) => String(s).trim())
      .filter(Boolean)
      .slice(0, 150);

    const matches: Record<
      string,
      NonNullable<ReturnType<typeof resolveDsalWorkforceGroup>>
    > = {};
    for (const name of names) {
      const w = resolveDsalWorkforceGroup(name);
      if (w) matches[name] = w;
    }

    return jsonCached(
      {
        ok: true,
        mode: "batch",
        requested: names.length,
        matched: Object.keys(matches).length,
        matches,
        referenceDate: data.referenceDate,
        sourceUrl: data.sourceUrl,
      },
      false
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
