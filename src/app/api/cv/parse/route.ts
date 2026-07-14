import { NextRequest, NextResponse } from "next/server";
import { extractCvFeaturesWithDebug } from "@/lib/cv-extract";
import { checkRateLimit, noStoreJson, requireApiUser } from "@/lib/api-security";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_BYTES = 8 * 1024 * 1024; // 8 MB

async function extractTextFromPdf(buffer: Buffer): Promise<string> {
  // pdf-parse v2 class API
  const { PDFParse } = await import("pdf-parse");
  const parser = new PDFParse({ data: buffer });
  try {
    const result = await parser.getText();
    return result?.text || "";
  } finally {
    await parser.destroy().catch(() => undefined);
  }
}

async function extractTextFromDocx(buffer: Buffer): Promise<string> {
  const mammoth = await import("mammoth");
  const result = await mammoth.extractRawText({ buffer });
  return result.value || "";
}

/**
 * POST /api/cv/parse
 * multipart form field "file": .pdf | .docx
 * Returns extracted text preview + structured features for smart matching.
 */
export async function POST(req: NextRequest) {
  try {
    const limited = checkRateLimit(req, "cv-parse", 6, 60_000);
    if (limited) return limited;
    const auth = await requireApiUser();
    if (auth.response) return auth.response;
    const form = await req.formData();
    if (form.get("consent") !== "accepted") {
      return noStoreJson(
        { ok: false, error: "Explicit consent is required before CV processing." },
        { status: 400 }
      );
    }
    const file = form.get("file");
    if (!file || !(file instanceof File)) {
      return NextResponse.json(
        { ok: false, error: "Missing file field (PDF or DOCX)." },
        { status: 400 }
      );
    }

    if (file.size > MAX_BYTES) {
      return NextResponse.json(
        { ok: false, error: "File too large (max 8 MB)." },
        { status: 400 }
      );
    }

    const name = file.name || "cv";
    const lower = name.toLowerCase();
    const type = file.type || "";
    const isPdf =
      lower.endsWith(".pdf") || type === "application/pdf";
    const isDocx =
      lower.endsWith(".docx") ||
      type ===
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

    if (!isPdf && !isDocx) {
      return NextResponse.json(
        {
          ok: false,
          error: "Unsupported format. Please upload a .pdf or .docx file.",
        },
        { status: 400 }
      );
    }

    const ab = await file.arrayBuffer();
    const buffer = Buffer.from(ab);

    let text = "";
    if (isPdf) {
      text = await extractTextFromPdf(buffer);
    } else {
      text = await extractTextFromDocx(buffer);
    }

    text = text.replace(/\u0000/g, " ").trim();
    if (text.length < 30) {
      return NextResponse.json(
        {
          ok: false,
          error:
            "Could not extract enough text. If this is a scanned PDF, try a text-based PDF or DOCX.",
        },
        { status: 422 }
      );
    }

    const { features, debug } = extractCvFeaturesWithDebug(text);
    const preview = text.slice(0, 1200);

    return noStoreJson({
      ok: true,
      fileName: name,
      mime: type,
      textLength: text.length,
      textPreview: preview,
      features,
      debug: {
        layoutFamily: debug.layoutFamily,
        sectionsFound: debug.sectionsFound,
        confidence: debug.confidence,
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Parse failed";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
