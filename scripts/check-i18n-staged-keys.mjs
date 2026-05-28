/**
 * 스테이징(또는 지정) diff 에서 새로 등장한 i18n key 만 ko/en 존재 여부를 빠르게 확인.
 * 개발 중 전체 카탈로그 스캔 대신, key 추가·t("key") 변경 시에만 사용.
 *
 * Usage:
 *   node scripts/check-i18n-staged-keys.mjs
 *   node scripts/check-i18n-staged-keys.mjs --staged
 *   node scripts/check-i18n-staged-keys.mjs --files lib/i18n/catalog/my.ts
 */
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { collectMergedCatalog, MESSAGE_KEY_PATTERN } from "./lib/i18n-catalog-merge.mjs";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");

const KEY_IN_CODE =
  /\b(?:t|safeT|translate|safeTranslate|storeOrderOpsSafeT|resolveSafeMessageKey)\(\s*["']([a-z][a-z0-9]*(?:_[a-z0-9]+)+)["']/g;
const KEY_IN_CATALOG = /^\+\s+([a-z][a-z0-9]*(?:_[a-z0-9]+)+)\s*:/gm;

function parseArgs(argv) {
  const files = [];
  let mode = "staged";
  for (let i = 2; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--staged") mode = "staged";
    else if (arg === "--working") mode = "working";
    else if (arg === "--files") {
      while (argv[i + 1] && !argv[i + 1].startsWith("--")) {
        files.push(argv[++i]);
      }
    } else if (!arg.startsWith("--")) {
      files.push(arg);
    }
  }
  return { mode, files };
}

function gitDiffUnified(mode, files) {
  const args =
    mode === "staged"
      ? ["diff", "--cached", "--unified=0", "--"]
      : ["diff", "--unified=0", "--"];
  const patterns =
    files.length > 0
      ? files
      : ["lib/i18n/catalog/", "messages/", "app/", "components/", "lib/"];
  const result = spawnSync("git", [...args, ...patterns], {
    cwd: ROOT,
    encoding: "utf8",
  });
  if (result.status !== 0 && result.stderr?.trim()) {
    console.error(result.stderr.trim());
  }
  return result.stdout ?? "";
}

function extractAddedKeys(diffText) {
  const keys = new Set();
  const addedLines = diffText
    .split("\n")
    .filter((line) => line.startsWith("+") && !line.startsWith("+++"));
  const block = addedLines.join("\n");

  let m;
  KEY_IN_CATALOG.lastIndex = 0;
  while ((m = KEY_IN_CATALOG.exec(block)) !== null) {
    keys.add(m[1]);
  }
  KEY_IN_CODE.lastIndex = 0;
  while ((m = KEY_IN_CODE.exec(block)) !== null) {
    keys.add(m[1]);
  }
  return [...keys].filter((k) => MESSAGE_KEY_PATTERN.test(k)).sort();
}

function main() {
  const { mode, files } = parseArgs(process.argv);
  const diffText = gitDiffUnified(mode, files);
  const keys = extractAddedKeys(diffText);

  if (keys.length === 0) {
    console.log("[check:i18n-staged] skip — diff 에 새 i18n key 없음");
    process.exit(0);
  }

  const koMap = collectMergedCatalog("ko");
  const enMap = collectMergedCatalog("en");
  const missingKo = [];
  const missingEn = [];
  const emptyKo = [];
  const emptyEn = [];
  const sameAsKey = [];

  for (const key of keys) {
    if (!koMap.has(key)) missingKo.push(key);
    else if (!koMap.get(key).value.trim()) emptyKo.push(key);
    if (!enMap.has(key)) missingEn.push(key);
    else if (!enMap.get(key).value.trim()) emptyEn.push(key);
    const koVal = koMap.get(key)?.value?.trim() ?? "";
    const enVal = enMap.get(key)?.value?.trim() ?? "";
    if (koVal === key || enVal === key) sameAsKey.push(key);
  }

  let exitCode = 0;
  console.log(`[check:i18n-staged] checking ${keys.length} new/changed key(s)`);

  if (missingKo.length) {
    exitCode = 1;
    console.error(`[check:i18n-staged] FAIL — ko 누락: ${missingKo.join(", ")}`);
  }
  if (missingEn.length) {
    exitCode = 1;
    console.error(`[check:i18n-staged] FAIL — en 누락: ${missingEn.join(", ")}`);
  }
  if (emptyKo.length || emptyEn.length) {
    exitCode = 1;
    if (emptyKo.length) console.error(`[check:i18n-staged] FAIL — ko 빈 값: ${emptyKo.join(", ")}`);
    if (emptyEn.length) console.error(`[check:i18n-staged] FAIL — en 빈 값: ${emptyEn.join(", ")}`);
  }
  if (sameAsKey.length) {
    exitCode = 1;
    console.error(`[check:i18n-staged] FAIL — 값이 key 와 동일: ${sameAsKey.join(", ")}`);
  }

  if (exitCode === 0) {
    console.log(`[check:i18n-staged] ok — ${keys.length} key(s) ko/en present`);
  }
  process.exit(exitCode);
}

main();
