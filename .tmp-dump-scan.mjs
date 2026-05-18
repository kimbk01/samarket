import fs from "node:fs";
import path from "node:path";
const ROOT = "c:/samarket";
const target = path.join(ROOT, "components/community");
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
function walk(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (e.name === "node_modules" || e.name === ".next") continue;
      walk(full, out);
    } else if (EXT.has(path.extname(e.name))) out.push(full);
  }
  return out;
}
const findings = [];
for (const file of walk(target)) {
  const lines = fs.readFileSync(file, "utf8").split(/\r?\n/);
  lines.forEach((line, index) => {
    const code = stripComments(line);
    if (!HANGUL.test(code)) return;
    for (const pattern of PATTERNS) {
      pattern.lastIndex = 0;
      if (pattern.test(code)) {
        findings.push(`${path.relative(ROOT, file).replace(/\\/g, "/")}:${index + 1}: ${code.trim().slice(0, 200)}`);
        break;
      }
    }
  });
}
fs.writeFileSync(path.join(ROOT, ".tmp-community-scan-full.txt"), findings.join("\n"), "utf8");
console.log("count", findings.length);
