import fs from "node:fs";
import path from "node:path";

const ROOT = "C:/samarket";
const TARGETS = ["app/(main)/community-messenger", "components/community-messenger"];
const EXT = new Set([".ts", ".tsx"]);
const HANGUL = /[\u3131-\u318E\uAC00-\uD7A3]/;
const PATTERNS = [
  />\s*[^<{]*[\u3131-\u318E\uAC00-\uD7A3][^<]*</g,
  /(?:placeholder|title|aria-label|alt)\s*=\s*["'`][^"'`]*[\u3131-\u318E\uAC00-\uD7A3]/g,
  /toast\.(?:success|error|info|warning)\(\s*["'`][^"'`]*[\u3131-\u318E\uAC00-\uD7A3]/g,
  /\b(?:alert|confirm)\(\s*["'`][^"'`]*[\u3131-\u318E\uAC00-\uD7A3]/g,
];

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

function stripComments(line) {
  const trimmed = line.trimStart();
  if (trimmed.startsWith("//")) return "";
  if (trimmed.startsWith("*")) return "";
  if (trimmed.startsWith("/*") || trimmed.startsWith("*/")) return "";
  return line;
}

const findings = [];
for (const relTarget of TARGETS) {
  const absTarget = path.join(ROOT, relTarget);
  for (const file of walk(absTarget)) {
    const lines = fs.readFileSync(file, "utf8").split(/\r?\n/);
    lines.forEach((line, index) => {
      const code = stripComments(line);
      if (!HANGUL.test(code)) return;
      for (const pattern of PATTERNS) {
        pattern.lastIndex = 0;
        if (pattern.test(code)) {
          findings.push({
            file: path.relative(ROOT, file).replace(/\\/g, "/"),
            line: index + 1,
            code: code.trim(),
          });
          break;
        }
      }
    });
  }
}

const byFile = new Map();
for (const item of findings) {
  byFile.set(item.file, (byFile.get(item.file) ?? 0) + 1);
}

const result = {
  total: findings.length,
  byFile: [...byFile.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([file, count]) => ({ file, count })),
  findings,
};

const outPath = path.join(ROOT, ".tmp-cm-hardcoded-report.json");
fs.writeFileSync(outPath, JSON.stringify(result, null, 2), "utf8");
console.log(`wrote ${result.total} findings to ${outPath}`);
