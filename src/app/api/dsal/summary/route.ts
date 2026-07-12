import { NextResponse } from "next/server";
import { dsalFetchJson } from "@/lib/dsal";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const catalog = await dsalFetchJson<{
      summary?: { keyCn: string; keyEn?: string; value: number }[];
      categories?: {
        id: string;
        nameCn: string;
        metaDatas?: { value: number }[];
      }[];
    }>("/v1/joboffers/localvancancy/catalog");

    const categories = (catalog.categories || []).map((c) => ({
      id: c.id,
      nameCn: c.nameCn,
      vacancies: c.metaDatas?.[0]?.value ?? 0,
    }));

    return NextResponse.json({
      ok: true,
      summary: catalog.summary || [],
      categories,
      fetchedAt: new Date().toISOString(),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ ok: false, error: message }, { status: 502 });
  }
}
