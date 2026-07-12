/**
 * Regression suite for multi-template CV extraction.
 * Run: node scripts/cv-regression.mjs
 */
import { createRequire } from "module";
import { pathToFileURL } from "url";
import { register } from "node:module";
import { pathToFileURL as p2u } from "node:url";

// Use tsx if available via dynamic import of compiled logic through tsx
import { spawnSync } from "child_process";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");

const result = spawnSync(
  "npx",
  [
    "--yes",
    "tsx",
    "-e",
    `
import { CV_SAMPLES } from "./src/lib/cv-samples.ts";
import { extractCvFeatures } from "./src/lib/cv-extract.ts";
import { profileFromCv } from "./src/lib/cv-match.ts";
import { readFileSync } from "fs";

let failed = 0;
const rows = [];

function check(id, cond, msg) {
  if (!cond) {
    failed++;
    rows.push({ id, ok: false, msg });
    console.log("FAIL", id, msg);
  } else {
    rows.push({ id, ok: true, msg });
  }
}

for (const sample of CV_SAMPLES) {
  const f = extractCvFeatures(sample.text);
  const p = profileFromCv(f);
  const e = sample.expect;
  if (e.nameIncludes) {
    check(sample.id, (f.name || "").includes(e.nameIncludes), \`name got "\${f.name}" want include \${e.nameIncludes}\`);
  }
  if (e.educationLevel) {
    check(sample.id, f.educationLevel === e.educationLevel, \`edu \${f.educationLevel} != \${e.educationLevel}\`);
  }
  for (const s of e.mustSkills || []) {
    check(sample.id, f.skills.includes(s), \`missing skill \${s}; have \${f.skills.join(",")}\`);
  }
  for (const l of e.mustLanguages || []) {
    check(sample.id, f.languages.includes(l), \`missing lang \${l}; have \${f.languages.join(",")}\`);
  }
  for (const s of e.mustSectors || []) {
    check(sample.id, f.preferredSectors.includes(s), \`missing sector \${s}; have \${f.preferredSectors.join(",")}\`);
  }
  for (const l of e.lanesInclude || []) {
    check(sample.id, f.preferredLanes.includes(l), \`missing lane \${l}\`);
  }
  for (const l of e.lanesExclude || []) {
    check(sample.id, !f.preferredLanes.includes(l), \`unexpected lane \${l}\`);
  }
  if (e.minAge != null) {
    check(sample.id, (f.estimatedAge ?? p.age) >= e.minAge, \`age \${f.estimatedAge} < \${e.minAge}\`);
  }
  if (e.maxAge != null) {
    check(sample.id, (f.estimatedAge ?? p.age) <= e.maxAge, \`age \${f.estimatedAge} > \${e.maxAge}\`);
  }
  if (e.isStudent != null) {
    check(sample.id, f.isStudent === e.isStudent, \`isStudent \${f.isStudent} != \${e.isStudent}\`);
  }
}

// Real-world sample if extracted text available
try {
  const real = readFileSync("/tmp/cv_extract.txt", "utf8");
  if (real.length > 100) {
    const f = extractCvFeatures(real);
    check("real-ryan-cv", (f.name || "").includes("Ryan"), \`real name \${f.name}\`);
    check("real-ryan-cv", f.educationLevel === "phd", \`real edu \${f.educationLevel}\`);
    check("real-ryan-cv", f.preferredLanes.includes("full-time"), \`real lanes \${f.preferredLanes}\`);
    check("real-ryan-cv", !f.preferredLanes.includes("summer"), "real should not prefer summer");
    check("real-ryan-cv", f.skills.includes("python"), "real python");
    check("real-ryan-cv", f.languages.includes("Cantonese"), "real cantonese");
  }
} catch {}

const pass = rows.filter(r => r.ok).length;
console.log("\\n=== RESULT", pass + "/" + rows.length, "checks passed;", failed, "failed ===");
process.exit(failed ? 1 : 0);
`,
  ],
  { cwd: root, encoding: "utf8", env: process.env }
);

console.log(result.stdout || "");
if (result.stderr) console.error(result.stderr);
process.exit(result.status ?? 1);
