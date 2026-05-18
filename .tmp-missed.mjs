import fs from "node:fs";
import path from "node:path";
const ROOT = "c:/samarket";
const target = path.join(ROOT, "components/community");
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
function matchesScanner(code) {
  for (const pattern of PATTERNS) {
    pattern.lastIndex = 0;
    if (pattern.test(code)) return true;
  }
  return false;
}
function walk(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) walk(full, out);
    else if (e.name.endsWith(".tsx")) out.push(full);
  }
  return out;
}
const missed = [];
for (const file of walk(target)) {
  const rel = path.relative(ROOT, file).replace(/\\/g, "/");
  const lines = fs.readFileSync(file, "utf8").split(/\r?\n/);
  lines.forEach((line, index) => {
    const code = stripComments(line);
    if (!HANGUL.test(code)) return;
    if (!matchesScanner(code)) {
      missed.push(`${rel}:${index + 1}: ${code.trim().slice(0, 200)}`);
    }
  });
}
fs.writeFileSync(path.join(ROOT, ".tmp-community-hangul-missed.txt"), missed.join("\n"), "utf8");
console.log("missed lines", missed.length);
const byFile = {};
for (const m of missed) {
  const f = m.split(":")[0] + ":" + m.split(":")[1] + ":" + m.split(":")[2];
  const file = m.slice(0, m.indexOf(":" + (m.split(":")[1]) + ":"));
  // simpler split
}
