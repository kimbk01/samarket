import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const EXT = new Set([".ts", ".tsx"]);
const HANGUL = /[\u3131-\u318E\uAC00-\uD7A3]/;
const PATTERNS = [
  />\s*[^<{]*[\u3131-\u318E\uAC00-\uD7A3][^<]*</g,
  /(?:placeholder|title|aria-label|alt)\s*=\s*["'`][^"'`]*[\u3131-\u318E\uAC00-\uD7A3]/g,
  /toast\.(?:success|error|info|warning)\(\s*["'`][^"'`]*[\u3131-\u318E\uAC00-\uD7A3]/g,
  /\b(?:alert|confirm)\(\s*["'`][^"'`]*[\u3131-\u318E\uAC00-\uD7A3]/g,
];

const scopes = [
  "app/(main)/market",
  "app/(main)/post",
  "app/(main)/write",
  "app/(main)/products",
  "components/home",
  "components/trade",
  "components/write/trade",
  "components/search",
];

const files = [];

function walk(target) {
  if (!fs.existsSync(target)) return;
  const stat = fs.statSync(target);
  if (stat.isFile()) {
    if (EXT.has(path.extname(target))) files.push(target);
    return;
  }
  for (const entry of fs.readdirSync(target, { withFileTypes: true })) {
    const full = path.join(target, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === "node_modules" || entry.name === ".next") continue;
      walk(full);
      continue;
    }
    if (EXT.has(path.extname(entry.name))) files.push(full);
  }
}

for (const scope of scopes) {
  walk(path.join(ROOT, scope));
}

const findings = [];

for (const file of files) {
  const lines = fs.readFileSync(file, "utf8").split(/\r?\n/);
  lines.forEach((line, idx) => {
    const trimmed = line.trimStart();
    if (
      trimmed.startsWith("//") ||
      trimmed.startsWith("*") ||
      trimmed.startsWith("/*") ||
      trimmed.startsWith("*/")
    ) {
      return;
    }
    if (!HANGUL.test(line)) return;
    for (const pattern of PATTERNS) {
      pattern.lastIndex = 0;
      if (pattern.test(line)) {
        findings.push(`${path.relative(ROOT, file)}:${idx + 1}: ${line.trim()}`);
        break;
      }
    }
  });
}

console.log(findings.join("\n"));
console.log(`\nTOTAL=${findings.length}`);
