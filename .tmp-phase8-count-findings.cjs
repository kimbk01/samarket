const fs = require("node:fs");
const path = require("node:path");

const ROOT = "C:/samarket";
const DIRS = ["app/(main)/community-messenger", "components/community-messenger"];
const EXT = new Set([".ts", ".tsx"]);
const HANGUL = /[\u3131-\u318E\uAC00-\uD7A3]/;
const PATTERNS = [
  />\s*[^<{]*[\u3131-\u318E\uAC00-\uD7A3][^<]*</g,
  /(?:placeholder|title|aria-label|alt)\s*=\s*["'`][^"'`]*[\u3131-\u318E\uAC00-\uD7A3]/g,
  /toast\.(?:success|error|info|warning)\(\s*["'`][^"'`]*[\u3131-\u318E\uAC00-\uD7A3]/g,
  /\b(?:alert|confirm)\(\s*["'`][^"'`]*[\u3131-\u318E\uAC00-\uD7A3]/g,
];

function stripComments(line) {
  const trimmed = line.trimStart();
  if (trimmed.startsWith("//")) return "";
  if (trimmed.startsWith("*")) return "";
  if (trimmed.startsWith("/*") || trimmed.startsWith("*/")) return "";
  return line;
}

function walk(target, files = []) {
  if (!fs.existsSync(target)) return files;
  const stat = fs.statSync(target);
  if (stat.isFile()) {
    if (EXT.has(path.extname(target))) files.push(target);
    return files;
  }
  for (const entry of fs.readdirSync(target, { withFileTypes: true })) {
    if (entry.name === "node_modules" || entry.name === ".next") continue;
    walk(path.join(target, entry.name), files);
  }
  return files;
}

const findings = [];
for (const relDir of DIRS) {
  const absDir = path.join(ROOT, relDir);
  for (const file of walk(absDir)) {
    const lines = fs.readFileSync(file, "utf8").split(/\r?\n/);
    for (let i = 0; i < lines.length; i += 1) {
      const code = stripComments(lines[i]);
      if (!HANGUL.test(code)) continue;
      for (const pattern of PATTERNS) {
        pattern.lastIndex = 0;
        if (pattern.test(code)) {
          findings.push(`${path.relative(ROOT, file)}:${i + 1}: ${code.trim()}`);
          break;
        }
      }
    }
  }
}

const counts = new Map();
for (const row of findings) {
  const file = row.split(":")[0];
  counts.set(file, (counts.get(file) ?? 0) + 1);
}
const sorted = [...counts.entries()].sort((a, b) => b[1] - a[1]);
fs.writeFileSync(path.join(ROOT, ".tmp-phase8-findings-all.txt"), findings.join("\n"));
fs.writeFileSync(
  path.join(ROOT, ".tmp-phase8-findings-counts.txt"),
  sorted.map(([file, count]) => `${String(count).padStart(4, " ")} ${file}`).join("\n")
);
console.log(`findings=${findings.length}, files=${sorted.length}`);
