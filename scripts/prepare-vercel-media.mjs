#!/usr/bin/env node
/**
 * Prepare a Vercel-friendly media set.
 *
 * Free/hobby deploys struggle with ~500MB of cat videos. This script:
 *  1) Moves oversized videos (except front_video.mp4) into media-local/videos/
 *     (gitignored — still available on your Mac for local Cat TV)
 *  2) Keeps front_video.mp4 + the smallest remaining clips under a size budget
 *  3) Regenerates the media list
 *
 * Usage:
 *   npm run media:slim
 *   npm run media:slim -- --budget 40   # max MB of videos to keep (default 45)
 *   npm run media:restore               # move media-local videos back
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { spawnSync } from "child_process";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");
const vidsDir = path.join(root, "public", "videos");
const archiveDir = path.join(root, "media-local", "videos");

const args = process.argv.slice(2);
const restore = args.includes("--restore") || process.env.npm_lifecycle_event === "media:restore";
const budgetIdx = args.indexOf("--budget");
const budgetMb = budgetIdx >= 0 ? Number(args[budgetIdx + 1]) || 45 : 45;
const budgetBytes = budgetMb * 1024 * 1024;
const KEEP_ALWAYS = new Set(["front_video.mp4"]);
const MAX_SINGLE = 12 * 1024 * 1024; // never keep a single clip larger than 12MB (except front)

function ensureDir(d) {
  fs.mkdirSync(d, { recursive: true });
}

function listMp4(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter((f) => f.toLowerCase().endsWith(".mp4"))
    .map((f) => {
      const p = path.join(dir, f);
      const st = fs.statSync(p);
      return { file: f, path: p, size: st.size };
    });
}

function move(src, destDir) {
  ensureDir(destDir);
  const dest = path.join(destDir, path.basename(src));
  if (fs.existsSync(dest)) fs.unlinkSync(dest);
  fs.renameSync(src, dest);
}

if (restore) {
  ensureDir(vidsDir);
  const archived = listMp4(archiveDir);
  for (const v of archived) {
    const dest = path.join(vidsDir, v.file);
    if (fs.existsSync(dest)) {
      console.log(`skip (exists): ${v.file}`);
      continue;
    }
    move(v.path, vidsDir);
    console.log(`restored ${v.file}`);
  }
  spawnSync(process.execPath, [path.join(__dirname, "gen-media-list.mjs")], {
    stdio: "inherit",
  });
  console.log("[media:restore] done");
  process.exit(0);
}

ensureDir(vidsDir);
ensureDir(archiveDir);

const all = listMp4(vidsDir);
if (!all.length) {
  console.log("No videos in public/videos — nothing to slim.");
  process.exit(0);
}

// 1) Park anything huge (except always-keep)
for (const v of all) {
  if (KEEP_ALWAYS.has(v.file)) continue;
  if (v.size > MAX_SINGLE) {
    console.log(
      `archive large ${v.file} (${(v.size / 1024 / 1024).toFixed(1)} MB)`
    );
    move(v.path, archiveDir);
  }
}

// 2) Fill budget with smallest remaining
const remaining = listMp4(vidsDir).sort((a, b) => a.size - b.size);
let used = 0;
const keep = new Set();

// Always keep front video first if present
const front = remaining.find((v) => v.file === "front_video.mp4");
if (front) {
  keep.add(front.file);
  used += front.size;
}

for (const v of remaining) {
  if (keep.has(v.file)) continue;
  if (used + v.size > budgetBytes) continue;
  keep.add(v.file);
  used += v.size;
}

// 3) Archive the rest
for (const v of remaining) {
  if (keep.has(v.file)) continue;
  console.log(
    `archive ${v.file} (${(v.size / 1024 / 1024).toFixed(1)} MB) — over budget`
  );
  move(v.path, archiveDir);
}

const kept = listMp4(vidsDir);
const keptMb = kept.reduce((s, v) => s + v.size, 0) / 1024 / 1024;
console.log(
  `[media:slim] kept ${kept.length} videos (~${keptMb.toFixed(1)} MB, budget ${budgetMb} MB)`
);
console.log(
  `[media:slim] archived extras → media-local/videos/ (local only, not deployed)`
);

spawnSync(process.execPath, [path.join(__dirname, "gen-media-list.mjs")], {
  stdio: "inherit",
});
