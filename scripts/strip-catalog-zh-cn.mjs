/**
 * Remove dead "zh-CN" blocks and spread merges from lib/i18n/catalog/*.ts
 * Usage: node scripts/strip-catalog-zh-cn.mjs
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const CATALOG_DIR = path.join(ROOT, "lib/i18n/catalog");

function stripZhCnBlocks(content) {
  const marker = '"zh-CN": {';
  let idx = content.indexOf(marker);
  while (idx !== -1) {
    const start = idx;
    const braceStart = content.indexOf("{", idx);
    let depth = 0;
    let i = braceStart;
    for (; i < content.length; i++) {
      const ch = content[i];
      if (ch === "{") depth++;
      else if (ch === "}") {
        depth--;
        if (depth === 0) {
          i++;
          break;
        }
      }
    }
    let end = i;
    while (end < content.length && /[\s,]/.test(content[end])) {
      if (content[end] === ",") {
        end++;
        break;
      }
      end++;
    }
    content = content.slice(0, start) + content.slice(end);
    idx = content.indexOf(marker);
  }
  content = content.replace(/^\s*\.\.\.[a-zA-Z0-9_$]+\["zh-CN"\],?\s*\r?\n/gm, "");
  return content;
}

function walk(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else if (entry.name.endsWith(".ts")) out.push(full);
  }
  return out;
}

let changed = 0;
for (const file of walk(CATALOG_DIR)) {
  const before = fs.readFileSync(file, "utf8");
  if (!before.includes('"zh-CN"')) continue;
  const after = stripZhCnBlocks(before);
  if (after !== before) {
    fs.writeFileSync(file, after, "utf8");
    changed++;
    console.log(`stripped: ${path.relative(ROOT, file)}`);
  }
}

console.log(`[strip-catalog-zh-cn] done — ${changed} file(s) updated`);
