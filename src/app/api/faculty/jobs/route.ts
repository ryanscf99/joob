import { NextRequest, NextResponse } from "next/server";
import {
  aggregateFacultyPositions,
  matchFacultyPositions,
} from "@/lib/faculty-jobs";
import type { CvFeatures } from "@/lib/cv-extract";
import type { YouthProfile } from "@/lib/types";
import type { UniId } from "@/lib/macau-universities";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

let cache: {
  at: number;
  payload: Awaited<ReturnType<typeof aggregateFacultyPositions>>;
} | null = null;

const TTL = 5 * 60 * 1000;

/**
 * GET /api/faculty/jobs
 * Aggregate faculty openings from Macau top-4 universities.
 * Query: university=um|must|mpu|cityu, q=, rank=, force=1, match=1
 */
export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const force = searchParams.get("force") === "1";
  const q = (searchParams.get("q") || "").toLowerCase().trim();
  const university = searchParams.get("university") as UniId | null;
  const rank = searchParams.get("rank") || "";
  const field = searchParams.get("field") || "";

  try {
    if (!force && cache && Date.now() - cache.at < TTL) {
      // use cache
    } else {
      const payload = await aggregateFacultyPositions();
      cache = { at: Date.now(), payload };
    }

    let positions = cache!.payload.positions;

    if (university) {
      positions = positions.filter((p) => p.universityId === university);
    }
    if (q) {
      positions = positions.filter((p) =>
        `${p.title} ${p.unit} ${p.refNo || ""} ${p.fields.join(" ")}`
          .toLowerCase()
          .includes(q)
      );
    }
    if (rank) {
      positions = positions.filter((p) => p.ranks.includes(rank as never));
    }
    if (field) {
      positions = positions.filter((p) => p.fields.includes(field));
    }

    return NextResponse.json({
      ok: true,
      fetchedAt: cache!.payload.fetchedAt,
      cached: !force && Date.now() - cache!.at < TTL,
      sources: cache!.payload.sources,
      total: positions.length,
      totalUnfiltered: cache!.payload.rawTotal,
      droppedStale: cache!.payload.droppedStale,
      positions,
      note:
        "Only posts within the last 12 months are listed/ranked (older academic-year ads are treated as closed). UM Career@UM + MUST e-recruitment API + CityU/MPU portals. Always apply on the university site.",
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed";
    return NextResponse.json({ ok: false, error: message, positions: [] }, { status: 502 });
  }
}

/**
 * POST /api/faculty/jobs
 * Body: { youth?, cvFeatures?, filters? } → ranked faculty matches
 */
export async function POST(req: NextRequest) {
  try {
    if (!cache || Date.now() - cache.at > TTL) {
      cache = { at: Date.now(), payload: await aggregateFacultyPositions() };
    }
    const body = (await req.json().catch(() => ({}))) as {
      youth?: YouthProfile | null;
      cvFeatures?: CvFeatures | null;
      university?: UniId | null;
      q?: string;
    };

    // positions already year-filtered in aggregateFacultyPositions
    let positions = cache.payload.positions;
    if (body.university) {
      positions = positions.filter((p) => p.universityId === body.university);
    }
    if (body.q) {
      const q = body.q.toLowerCase();
      positions = positions.filter((p) =>
        `${p.title} ${p.unit} ${p.fields.join(" ")}`.toLowerCase().includes(q)
      );
    }

    const ranked = matchFacultyPositions(
      positions,
      body.youth || null,
      body.cvFeatures || null
    );

    return NextResponse.json({
      ok: true,
      fetchedAt: cache.payload.fetchedAt,
      sources: cache.payload.sources,
      total: ranked.length,
      droppedStale: cache.payload.droppedStale,
      matches: ranked,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed";
    return NextResponse.json({ ok: false, error: message }, { status: 502 });
  }
}
