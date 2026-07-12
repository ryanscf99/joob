/**
 * Re-download DSAL Table A3 PDF and rebuild data/dsal-nrw-a3.json
 * Usage: npm run refresh:dsal-nrw
 */
import { createRequire } from "module";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const require = createRequire(import.meta.url);
const { PDFParse } = require("pdf-parse");

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");
const PDF_URL =
  process.env.DSAL_A3_URL ||
  "https://www.dsal.gov.mo/download/pdf_en/statistic/nrworker/A3/A3_2025_12_TR.pdf";

const CODE_IND = {
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

function parseA3Text(text) {
  const lines = text.split(/\r?\n/);
  const ROW = /^(\d+)\t(\d+)\t(\d+)\t(\d+)(?:\t(.*))?$/;
  const IND = /^([A-Z])\tInudstry\s+\tTotal no\. of ent\.:\s*(\d+)\t(.+)$/;

  const isNoise = (l) => {
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

  const cleanName = (s) =>
    (s || "")
      .replace(/\s+/g, " ")
      .replace(/\bNon-?\s*specialized\b.*$/i, "")
      .replace(/\bSpecialized\b.*$/i, "")
      .replace(/\bInudstry\b.*$/i, "")
      .replace(/\bIndustry\b.*$/i, "")
      .trim()
      .replace(/^[\s\-*]+|[\s\-*]+$/g, "");

  const entities = [];
  let industry = "";
  let industryCode = "";
  let pending = null;
  let nameBuf = [];
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
    entities.push({
      id: `dsal-a3-${entities.length + 1}`,
      namePt: pt,
      nameZh: zh,
      industry: CODE_IND[industryCode] || industry,
      industryCode,
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

async function main() {
  console.log("Downloading", PDF_URL);
  const res = await fetch(PDF_URL, {
    headers: {
      "User-Agent": "MYEIB-MacauYouthEmploymentBridge/1.0",
      Accept: "application/pdf",
    },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  console.log("PDF bytes", buf.length);

  const parser = new PDFParse({ data: buf });
  const extracted = await parser.getText();
  const text = extracted.text || "";
  console.log("Extracted chars", text.length);

  const entities = parseA3Text(text);
  console.log("Parsed entities", entities.length);

  const m = text.match(
    /End of (January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{4})/i
  );
  const months = {
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
  const referenceDate = m
    ? `${m[2]}-${months[m[1].toLowerCase()]}-01`
    : new Date().toISOString().slice(0, 10);

  const dataset = {
    source:
      "DSAL Table A3 — List of enterprises/entities with non-resident workers",
    sourceUrl: PDF_URL,
    referenceDate,
    asOfLabel: m ? `End of ${m[1]} ${m[2]}` : undefined,
    fetchedNote:
      "Residents: Social Security Fund. Non-resident workers: Public Security Police Force. Published by DSAL.",
    entityCount: entities.length,
    entities,
    cachedAt: new Date().toISOString(),
  };

  const outDir = path.join(root, "data");
  fs.mkdirSync(outDir, { recursive: true });
  const outPath = path.join(outDir, "dsal-nrw-a3.json");
  fs.writeFileSync(outPath, JSON.stringify(dataset));
  console.log("Wrote", outPath, "MB", (fs.statSync(outPath).size / 1e6).toFixed(2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
