/**
 * ko/en 메시지 카탈로그 키 대칭 검사.
 * Usage: node scripts/check-i18n-messages.mjs
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");

function readJsonKeys(filePath) {
  const raw = JSON.parse(fs.readFileSync(filePath, "utf8"));
  return new Set(Object.keys(raw));
}

function extractCatalogKeys(filePath, lang) {
  const content = fs.readFileSync(filePath, "utf8");
  const re = new RegExp(`\\n  ${lang}: \\{([\\s\\S]*?)\\n  \\},`, "m");
  const match = content.match(re);
  if (!match) return new Set();
  const block = match[1];
  const keys = new Set();
  for (const line of block.split("\n")) {
    const m = line.match(/^\s+([a-zA-Z_][a-zA-Z0-9_]*)\s*:/);
    if (m) keys.add(m[1]);
  }
  return keys;
}

function collectCatalogKeys(lang) {
  const dir = path.join(ROOT, "lib", "i18n", "catalog");
  const keys = new Set();
  for (const file of fs.readdirSync(dir)) {
    if (!file.endsWith(".ts")) continue;
    for (const key of extractCatalogKeys(path.join(dir, file), lang)) {
      keys.add(key);
    }
  }
  return keys;
}

const koKeys = new Set([
  ...readJsonKeys(path.join(ROOT, "messages", "ko.json")),
  ...collectCatalogKeys("ko"),
]);
const enKeys = new Set([
  ...readJsonKeys(path.join(ROOT, "messages", "en.json")),
  ...collectCatalogKeys("en"),
]);

const missingInEn = [...koKeys].filter((k) => !enKeys.has(k)).sort();
const missingInKo = [...enKeys].filter((k) => !koKeys.has(k)).sort();

if (missingInEn.length > 0) {
  console.error("[check:i18n] ko 에만 있는 key:");
  for (const key of missingInEn) console.error(`  - ${key}`);
}
if (missingInKo.length > 0) {
  console.error("[check:i18n] en 에만 있는 key:");
  for (const key of missingInKo) console.error(`  - ${key}`);
}

if (missingInEn.length > 0 || missingInKo.length > 0) {
  process.exit(1);
}

console.log(`[check:i18n] ok — ${koKeys.size} keys matched (ko/en)`);
