import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const TARGETS = ["components/stores/owner", "components/business"];
const EXT = new Set([".ts", ".tsx"]);
const HANGUL = /[\u3131-\u318E\uAC00-\uD7A3]/;
const PATTERNS = [
  { kind: "text", re: />\s*([^<{]*[\u3131-\u318E\uAC00-\uD7A3][^<]*)\s*</g },
  {
    kind: "attr",
    re: /(?:placeholder|title|aria-label|alt)\s*=\s*["'`]([^"'`]*[\u3131-\u318E\uAC00-\uD7A3][^"'`]*)["'`]/g,
  },
  {
    kind: "toast",
    re: /toast\.(?:success|error|info|warning)\(\s*["'`]([^"'`]*[\u3131-\u318E\uAC00-\uD7A3][^"'`]*)["'`]/g,
  },
  { kind: "dialog", re: /\b(?:alert|confirm)\(\s*["'`]([^"'`]*[\u3131-\u318E\uAC00-\uD7A3][^"'`]*)["'`]/g },
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
      continue;
    }
    if (EXT.has(path.extname(entry.name))) out.push(full);
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
for (const target of TARGETS) {
  const abs = path.join(ROOT, target);
  for (const file of walk(abs)) {
    const rel = path.relative(ROOT, file).replaceAll("\\", "/");
    const lines = fs.readFileSync(file, "utf8").split(/\r?\n/);
    lines.forEach((line, index) => {
      const code = stripComments(line);
      if (!HANGUL.test(code)) return;
      for (const p of PATTERNS) {
        p.re.lastIndex = 0;
        let m = null;
        while ((m = p.re.exec(code))) {
          const text = String(m[1] ?? "").trim();
          if (!text) continue;
          findings.push({ file: rel, line: index + 1, kind: p.kind, text });
        }
      }
    });
  }
}

const unique = [...new Set(findings.map((f) => f.text))].sort((a, b) => a.localeCompare(b, "ko"));
fs.writeFileSync(
  path.join(ROOT, ".tmp-phase7-findings.json"),
  JSON.stringify({ findings, unique }, null, 2),
  "utf8"
);
console.log(`[phase7-scan] findings=${findings.length} unique=${unique.length}`);
