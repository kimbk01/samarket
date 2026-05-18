import fs from "fs";
import path from "path";

const ROOT = "lib";
const HANGUL = /[\uAC00-\uD7A3]/;
const SKIP = [
  `${path.sep}i18n${path.sep}catalog${path.sep}`,
  `${path.sep}__tests__${path.sep}`,
  ".test.ts",
  ".spec.ts",
];

function walk(d, out = []) {
  for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    const p = path.join(d, e.name);
    if (e.isDirectory()) {
      if (e.name === "node_modules") continue;
      walk(p, out);
    } else if (/\.ts$/.test(e.name)) out.push(p);
  }
  return out;
}

const findings = [];
for (const file of walk(ROOT)) {
  const norm = file.replace(/\\/g, "/");
  if (SKIP.some((s) => norm.includes(s.replace(/\\/g, "/")))) continue;
  const lines = fs.readFileSync(file, "utf8").split(/\r?\n/);
  lines.forEach((line, i) => {
    const t = line.trim();
    if (t.startsWith("//") || t.startsWith("*") || t.startsWith("/**")) return;
    if (!HANGUL.test(line)) return;
    if (/import\s/.test(line) || /from\s+["']/.test(line)) return;
    findings.push(`${norm}:${i + 1}: ${line.trim().slice(0, 100)}`);
  });
}

const byFile = new Map();
for (const f of findings) {
  const file = f.split(":")[0];
  byFile.set(file, (byFile.get(file) ?? 0) + 1);
}
const sorted = [...byFile.entries()].sort((a, b) => b[1] - a[1]);
console.log("files with ko (non-catalog):", sorted.length);
console.log("total lines:", findings.length);
for (const [f, n] of sorted.slice(0, 40)) console.log(`${n}\t${f}`);
if (findings.length > 0 && sorted.length <= 5) {
  for (const row of findings.slice(0, 30)) console.log(row);
}
