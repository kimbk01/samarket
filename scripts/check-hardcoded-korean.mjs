/**
 * app/components/lib JSX·문자열 리터럴 내 한글 하드코딩 탐지 (개발 규칙 보조).
 * Usage:
 *   node scripts/check-hardcoded-korean.mjs
 *   node scripts/check-hardcoded-korean.mjs app/(main)/mypage components/mypage
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const DEFAULT_SCAN_DIRS = ["app", "components", "lib"];
const EXT = new Set([".ts", ".tsx"]);

const EXCLUDE_PATH_SNIPPETS = [
  `${path.sep}lib${path.sep}i18n${path.sep}catalog${path.sep}`,
  `${path.sep}messages${path.sep}`,
  `${path.sep}docs${path.sep}`,
  `${path.sep}__tests__${path.sep}`,
  ".test.ts",
  ".test.tsx",
  ".spec.ts",
  ".spec.tsx",
];

const HANGUL = /[\u3131-\u318E\uAC00-\uD7A3]/;

const PATTERNS = [
  />\s*[^<{]*[\u3131-\u318E\uAC00-\uD7A3][^<]*</g,
  /(?:placeholder|title|aria-label|alt)\s*=\s*["'`][^"'`]*[\u3131-\u318E\uAC00-\uD7A3]/g,
  /toast\.(?:success|error|info|warning)\(\s*["'`][^"'`]*[\u3131-\u318E\uAC00-\uD7A3]/g,
  /\b(?:alert|confirm)\(\s*["'`][^"'`]*[\u3131-\u318E\uAC00-\uD7A3]/g,
];

function resolveScanRoots() {
  const args = process.argv.slice(2).filter((a) => a && !a.startsWith("-"));
  if (args.length === 0) {
    return DEFAULT_SCAN_DIRS.map((d) => path.join(ROOT, d));
  }
  return args.map((rel) => path.resolve(ROOT, rel));
}

function shouldSkip(filePath) {
  const norm = filePath.split(path.sep).join(path.sep);
  return EXCLUDE_PATH_SNIPPETS.some((snippet) => norm.includes(snippet));
}

function stripComments(line) {
  const trimmed = line.trimStart();
  if (trimmed.startsWith("//")) return "";
  if (trimmed.startsWith("*")) return "";
  if (trimmed.startsWith("/*") || trimmed.startsWith("*/")) return "";
  return line;
}

function walk(target, out = []) {
  if (!fs.existsSync(target)) return out;
  const stat = fs.statSync(target);
  if (stat.isFile()) {
    if (EXT.has(path.extname(target))) out.push(target);
    return out;
  }
  for (const entry of fs.readdirSync(target, { withFileTypes: true })) {
    const full = path.join(target, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === "node_modules" || entry.name === ".next") continue;
      walk(full, out);
    } else if (EXT.has(path.extname(entry.name))) {
      out.push(full);
    }
  }
  return out;
}

const findings = [];
const scanRoots = resolveScanRoots();
const files = new Set();

for (const root of scanRoots) {
  for (const file of walk(root)) {
    files.add(file);
  }
}

for (const file of files) {
  if (shouldSkip(file)) continue;
  const lines = fs.readFileSync(file, "utf8").split(/\r?\n/);
  lines.forEach((line, index) => {
    const code = stripComments(line);
    if (!HANGUL.test(code)) return;
    for (const pattern of PATTERNS) {
      pattern.lastIndex = 0;
      if (pattern.test(code)) {
        findings.push(`${path.relative(ROOT, file)}:${index + 1}: ${code.trim().slice(0, 120)}`);
        break;
      }
    }
  });
}

if (findings.length > 0) {
  console.error(`[check:i18n-hardcoded] ${findings.length} possible hardcoded Korean string(s):`);
  for (const row of findings.slice(0, 80)) console.error(`  ${row}`);
  if (findings.length > 80) {
    console.error(`  … and ${findings.length - 80} more`);
  }
  process.exit(1);
}

const scope =
  scanRoots.length === DEFAULT_SCAN_DIRS.length
    ? "app, components, lib"
    : scanRoots.map((r) => path.relative(ROOT, r)).join(", ");
console.log(`[check:i18n-hardcoded] ok — no targeted Korean literals in: ${scope}`);
