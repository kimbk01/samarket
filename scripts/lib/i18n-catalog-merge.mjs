/**
 * ko/en 메시지 카탈로그 병합 (messages/*.json + lib/i18n/catalog/*.ts)
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "../..");

export const MESSAGE_KEY_PATTERN = /^[a-z][a-z0-9]*(_[a-z0-9]+)+$/;

export const UI_KEY_SEGMENT_PATTERN = /_(title|body|label|button|status|message)_/;

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

export function collectMergedCatalog(lang) {
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
