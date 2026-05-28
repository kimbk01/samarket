/**
 * 커밋 직전 i18n 게이트 — ko/en 대칭, catalog key=값, JSX key 원문 노출, safe-translate 계약.
 *
 * Usage: npm run verify:i18n-key-exposure
 */
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  collectMergedCatalog,
  MESSAGE_KEY_PATTERN,
  UI_KEY_SEGMENT_PATTERN,
} from "./lib/i18n-catalog-merge.mjs";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");

const SCAN_DIRS = ["app", "components", "lib"];
const SCAN_EXT = new Set([".tsx", ".jsx"]);
const SKIP_DIR = new Set(["__tests__", "node_modules", ".next"]);
const SKIP_FILE = /\.(test|spec)\.(tsx|jsx)$/;

/** t()/safeT() 없이 JSX 에 string literal key 가 직접 출력되는 패턴 */
const JSX_LITERAL_KEY =
  /\{[\s\n]*["']([a-z][a-z0-9]*(?:_[a-z0-9]+)+)["'][\s\n]*\}/g;
const JSX_TEXT_KEY = />\s*([a-z][a-z0-9]*(?:_[a-z0-9]+)+)\s*</g;

const SAFE_TRANSLATE_LINE =
  /return\s+humanizeMessageKeyForDisplay\s*\(\s*key\s*\)\s*;/;

function run(label, command, args) {
  console.log(`\n[verify:i18n-key-exposure] ${label}`);
  const result = spawnSync(command, args, {
    cwd: ROOT,
    stdio: "inherit",
    shell: process.platform === "win32",
  });
  if (result.status !== 0) {
    console.error(`[verify:i18n-key-exposure] FAILED: ${label}`);
    return false;
  }
  return true;
}

function shouldScanFile(filePath) {
  if (!SCAN_EXT.has(path.extname(filePath))) return false;
  if (SKIP_FILE.test(filePath)) return false;
  const parts = filePath.split(path.sep);
  return !parts.some((p) => SKIP_DIR.has(p));
}

function walkScanFiles(dir, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const name of fs.readdirSync(dir)) {
    const full = path.join(dir, name);
    const stat = fs.statSync(full);
    if (stat.isDirectory()) {
      if (SKIP_DIR.has(name)) continue;
      walkScanFiles(full, out);
    } else if (shouldScanFile(full)) {
      out.push(full);
    }
  }
  return out;
}

function isLikelyUiMessageKey(key) {
  if (!MESSAGE_KEY_PATTERN.test(key)) return false;
  if (UI_KEY_SEGMENT_PATTERN.test(key)) return true;
  return key.split("_").length >= 4;
}

function isSafeKeyLine(line) {
  const trimmed = line.trim();
  if (trimmed.startsWith("//") || trimmed.startsWith("*")) return true;
  if (/\b(?:t|safeT|translate|safeTranslate|MessageKey|storeOrderOpsSafeT)\s*\(/.test(line)) {
    return true;
  }
  if (/key:\s*["']/.test(line) || /as MessageKey/.test(line)) return true;
  if (/i18n-ok|i18n:key-display-ok/.test(line)) return true;
  if (/<code[\s>]/.test(line)) return true;
  return false;
}

function scanJsxKeyExposure() {
  const hits = [];
  const files = SCAN_DIRS.flatMap((d) => walkScanFiles(path.join(ROOT, d)));

  for (const file of files) {
    const rel = path.relative(ROOT, file).replace(/\\/g, "/");
    const content = fs.readFileSync(file, "utf8");
    const lines = content.split("\n");

    for (let i = 0; i < lines.length; i += 1) {
      const line = lines[i];
      if (isSafeKeyLine(line)) continue;

      JSX_LITERAL_KEY.lastIndex = 0;
      let m;
      while ((m = JSX_LITERAL_KEY.exec(line)) !== null) {
        const key = m[1];
        if (!isLikelyUiMessageKey(key)) continue;
        hits.push({ file: rel, line: i + 1, key, kind: "jsx-literal" });
      }

      JSX_TEXT_KEY.lastIndex = 0;
      while ((m = JSX_TEXT_KEY.exec(line)) !== null) {
        const key = m[1];
        if (!isLikelyUiMessageKey(key)) continue;
        hits.push({ file: rel, line: i + 1, key, kind: "jsx-text" });
      }
    }
  }
  return hits;
}

function checkSafeTranslateContract() {
  const file = path.join(ROOT, "lib/i18n/safe-translate.ts");
  const content = fs.readFileSync(file, "utf8");
  if (SAFE_TRANSLATE_LINE.test(content)) {
    console.error(
      "[verify:i18n-key-exposure] FAIL — safeTranslate 가 humanizeMessageKeyForDisplay(key) 로 key slug 를 노출할 수 있음"
    );
    return false;
  }
  return true;
}

function checkCatalogSelfKeys() {
  const koMap = collectMergedCatalog("ko");
  const enMap = collectMergedCatalog("en");
  const bad = [];
  for (const [key, { value }] of koMap) {
    const v = value.trim();
    if (v === key || (MESSAGE_KEY_PATTERN.test(v) && v.length >= 6 && UI_KEY_SEGMENT_PATTERN.test(v))) {
      bad.push({ key, lang: "ko", value: v });
    }
  }
  for (const [key, { value }] of enMap) {
    const v = value.trim();
    if (v === key || (MESSAGE_KEY_PATTERN.test(v) && v.length >= 6 && UI_KEY_SEGMENT_PATTERN.test(v))) {
      bad.push({ key, lang: "en", value: v });
    }
  }
  if (bad.length) {
    console.error(`[verify:i18n-key-exposure] FAIL — catalog 값이 key 원문 (${bad.length})`);
    for (const item of bad.slice(0, 20)) {
      console.error(`  - [${item.lang}] ${item.key}`);
    }
    if (bad.length > 20) console.error(`  … +${bad.length - 20} more`);
    return false;
  }
  return true;
}

let ok = true;

ok = run("check:i18n (ko/en catalog parity)", "npm", ["run", "check:i18n"]) && ok;

console.log("\n[verify:i18n-key-exposure] catalog self-key scan");
ok = checkCatalogSelfKeys() && ok;

console.log("\n[verify:i18n-key-exposure] safe-translate contract");
ok = checkSafeTranslateContract() && ok;

console.log("\n[verify:i18n-key-exposure] JSX key literal scan");
const jsxHits = scanJsxKeyExposure();
if (jsxHits.length > 0) {
  ok = false;
  console.error(`[verify:i18n-key-exposure] FAIL — JSX 에 i18n key 원문 후보 (${jsxHits.length})`);
  for (const hit of jsxHits.slice(0, 24)) {
    console.error(`  - ${hit.file}:${hit.line} ${hit.key} (${hit.kind})`);
  }
  if (jsxHits.length > 24) console.error(`  … +${jsxHits.length - 24} more`);
} else {
  console.log("[verify:i18n-key-exposure] JSX scan ok");
}

ok =
  run("vitest i18n unit tests", "npx", [
    "vitest",
    "run",
    "lib/i18n/__tests__/safe-translate.test.ts",
    "lib/store-order-chat/__tests__/store-order-ops-i18n.test.ts",
  ]) && ok;

process.exit(ok ? 0 : 1);
