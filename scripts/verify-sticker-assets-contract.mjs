/**
 * 스티커 fallback·마이그레이션 시드 URL ↔ public/stickers 실파일 1:1 계약
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");

function fail(message) {
  console.error(`[sticker-assets-contract] ${message}`);
  process.exitCode = 1;
}

function read(rel) {
  return fs.readFileSync(path.join(root, rel), "utf8");
}

/** fallback-sticker-catalog.ts 의 /stickers/... 경로 추출 */
function pathsFromFallbackCatalog() {
  const src = read("lib/stickers/fallback-sticker-catalog.ts");
  const re = /["'](\/stickers\/[^"']+\.webp)["']/g;
  const out = new Set();
  let m;
  while ((m = re.exec(src)) !== null) {
    out.add(m[1]);
  }
  return [...out];
}

/** 마이그레이션 시드와 동일 경로가 catalog에 포함되는지 교차 확인 */
function pathsFromMigration() {
  const src = read("supabase/migrations/20260417090000_community_messenger_sticker_packs.sql");
  const re = /['"](\/stickers\/[^'"]+\.webp)['"]/g;
  const out = new Set();
  let m;
  while ((m = re.exec(src)) !== null) {
    out.add(m[1]);
  }
  return [...out];
}

const catalogPaths = pathsFromFallbackCatalog();
const migrationPaths = pathsFromMigration();

if (catalogPaths.length < 11) {
  fail(`fallback catalog: expected at least 11 sticker paths, got ${catalogPaths.length}`);
}

for (const p of migrationPaths) {
  if (!catalogPaths.includes(p)) {
    fail(`migration path missing from fallback catalog: ${p}`);
  }
}

let missing = 0;
for (const publicPath of catalogPaths) {
  const disk = path.join(root, "public", publicPath.replace(/^\//, "").split("/").join(path.sep));
  if (!fs.existsSync(disk)) {
    fail(`missing file: ${publicPath} (expected ${disk})`);
    missing++;
    continue;
  }
  const stat = fs.statSync(disk);
  if (!stat.isFile() || stat.size === 0) {
    fail(`empty or not a file: ${publicPath}`);
    missing++;
  }
}

if (process.exitCode === 1) {
  console.error(
    "[sticker-assets-contract] Run: npm run stickers:build — then commit public/stickers/packs/**/*.webp"
  );
  process.exit(1);
}

console.log(`[sticker-assets-contract] OK (${catalogPaths.length} assets)`);
