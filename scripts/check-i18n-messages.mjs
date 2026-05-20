/**
 * DIBAY ko/en 메시지 카탈로그 대칭·품질 검사.
 * Usage: node scripts/check-i18n-messages.mjs
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");

const MESSAGE_KEY_PATTERN = /^[a-z][a-z0-9]*(_[a-z0-9]+)+$/;
const UNREPLACED_PLACEHOLDER = /\{[a-zA-Z_][a-zA-Z0-9_]*\}/;

function classifyDomain(key) {
  if (key.startsWith("admin_") || key.startsWith("launch_") || key.startsWith("ops_")) return "admin";
  if (key.startsWith("store_") || key.startsWith("delivery_") || key.startsWith("nav_bottom_delivery")) {
    return "delivery/stores";
  }
  if (
    key.startsWith("cm_") ||
    key.startsWith("messenger_") ||
    key.startsWith("community_messenger_")
  ) {
    return "messenger";
  }
  if (key.startsWith("trade_") || key.startsWith("post_") || key.startsWith("market_")) return "trade";
  if (
    key.startsWith("philife_") ||
    key.startsWith("community_") ||
    key.startsWith("neighborhood_")
  ) {
    return "community";
  }
  if (
    key.startsWith("mypage_") ||
    key.startsWith("my_") ||
    key.startsWith("settings_") ||
    key.startsWith("navigation_")
  ) {
    return "mypage/myinfo";
  }
  if (
    key.includes("_modal_") ||
    key.includes("_sheet_") ||
    key.includes("_dialog_") ||
    key.includes("_popup_") ||
    key.includes("_confirm_") ||
    key.includes("_alert_")
  ) {
    return "modal/popup";
  }
  if (key.startsWith("common_") || key.startsWith("app_") || key.startsWith("auth_")) return "common";
  return "other";
}

function readJsonEntries(filePath) {
  const raw = JSON.parse(fs.readFileSync(filePath, "utf8"));
  return Object.entries(raw).map(([key, value]) => ({ key, value: String(value ?? "") }));
}

function extractCatalogEntries(filePath, lang) {
  const content = fs.readFileSync(filePath, "utf8");
  const re = new RegExp(`\\n  ${lang}: \\{([\\s\\S]*?)\\n  \\},`, "m");
  const match = content.match(re);
  if (!match) return [];
  const block = match[1];
  const out = [];
  const keyValueRe =
    /^\s+([a-zA-Z_][a-zA-Z0-9_]*)\s*:\s*(?:\n\s*)?(?:"((?:\\.|[^"\\])*)"|'((?:\\.|[^'\\])*)')/gm;
  let m;
  while ((m = keyValueRe.exec(block)) !== null) {
    const value = (m[2] ?? m[3] ?? "").replace(/\\n/g, "\n").replace(/\\"/g, '"');
    out.push({ key: m[1], value });
  }
  return out;
}

function collectMerged(lang) {
  const map = new Map();
  const jsonPath = path.join(ROOT, "messages", `${lang}.json`);
  if (fs.existsSync(jsonPath)) {
    for (const { key, value } of readJsonEntries(jsonPath)) {
      map.set(key, { value, source: "messages" });
    }
  }
  const dir = path.join(ROOT, "lib", "i18n", "catalog");
  for (const file of fs.readdirSync(dir)) {
    if (!file.endsWith(".ts")) continue;
    for (const { key, value } of extractCatalogEntries(path.join(dir, file), lang)) {
      map.set(key, { value, source: `catalog/${file}` });
    }
  }
  return map;
}

function pushGrouped(bucket, domain, item) {
  if (!bucket[domain]) bucket[domain] = [];
  bucket[domain].push(item);
}

const koMap = collectMerged("ko");
const enMap = collectMerged("en");
const koKeys = new Set(koMap.keys());
const enKeys = new Set(enMap.keys());

const missingInEn = [...koKeys].filter((k) => !enKeys.has(k)).sort();
const missingInKo = [...enKeys].filter((k) => !koKeys.has(k)).sort();

const emptyKo = [];
const emptyEn = [];
const sameAsKeyKo = [];
const sameAsKeyEn = [];
const rawKeyWarnKo = [];
const rawKeyWarnEn = [];

for (const key of koKeys) {
  const { value } = koMap.get(key);
  if (!value.trim()) emptyKo.push(key);
  if (value.trim() === key) sameAsKeyKo.push(key);
  if (MESSAGE_KEY_PATTERN.test(value.trim()) && value.trim().length >= 6) {
    rawKeyWarnKo.push(key);
  }
}
for (const key of enKeys) {
  const { value } = enMap.get(key);
  if (!value.trim()) emptyEn.push(key);
  if (value.trim() === key) sameAsKeyEn.push(key);
  if (MESSAGE_KEY_PATTERN.test(value.trim()) && value.trim().length >= 6) {
    rawKeyWarnEn.push(key);
  }
}

let exitCode = 0;

function reportDomain(title, keys, map) {
  const byDomain = {};
  for (const key of keys) {
    pushGrouped(byDomain, classifyDomain(key), { key, value: map.get(key)?.value ?? "" });
  }
  console.error(`\n[check:i18n] ${title} (${keys.length})`);
  for (const domain of Object.keys(byDomain).sort()) {
    console.error(`  [${domain}]`);
    for (const { key, value } of byDomain[domain].slice(0, 12)) {
      console.error(`    - ${key}${value ? `: ${value.slice(0, 48)}` : ""}`);
    }
    if (byDomain[domain].length > 12) {
      console.error(`    … +${byDomain[domain].length - 12} more`);
    }
  }
}

if (missingInEn.length > 0) {
  exitCode = 1;
  reportDomain("FAIL — ko 에만 있는 key", missingInEn, koMap);
}
if (missingInKo.length > 0) {
  exitCode = 1;
  reportDomain("FAIL — en 에만 있는 key", missingInKo, enMap);
}
if (emptyKo.length > 0 || emptyEn.length > 0) {
  exitCode = 1;
  if (emptyKo.length) reportDomain("FAIL — ko 빈 문자열", emptyKo, koMap);
  if (emptyEn.length) reportDomain("FAIL — en 빈 문자열", emptyEn, enMap);
}
if (sameAsKeyKo.length > 0 || sameAsKeyEn.length > 0) {
  exitCode = 1;
  if (sameAsKeyKo.length) reportDomain("FAIL — ko 값이 key 와 동일", sameAsKeyKo, koMap);
  if (sameAsKeyEn.length) reportDomain("FAIL — en 값이 key 와 동일", sameAsKeyEn, enMap);
}

const rawWarn = [...new Set([...rawKeyWarnKo, ...rawKeyWarnEn])].sort();
if (rawWarn.length > 0) {
  console.warn(`\n[check:i18n] WARN — 값이 raw key 형태 (${rawWarn.length})`);
  for (const key of rawWarn.slice(0, 20)) {
    console.warn(`  - ${key}`);
  }
  if (rawWarn.length > 20) console.warn(`  … +${rawWarn.length - 20} more`);
}

if (exitCode !== 0) {
  process.exit(exitCode);
}

console.log(
  `[check:i18n] ok — ${koKeys.size} keys matched (ko/en), empty=0, sameAsKey=0`
);
