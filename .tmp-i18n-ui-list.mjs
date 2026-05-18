import fs from "fs";
import path from "path";

const PATTERNS = [
  />\s*[^<{]*[\u3131-\u318E\uAC00-\uD7A3][^<]*</g,
  /(?:placeholder|title|aria-label|alt)\s*=\s*["'`][^"'`]*[\u3131-\u318E\uAC00-\uD7A3]/g,
  /toast\.(?:success|error|info|warning)\(\s*["'`][^"'`]*[\u3131-\u318E\uAC00-\uD7A3]/g,
  /\b(?:alert|confirm)\(\s*["'`][^"'`]*[\u3131-\u318E\uAC00-\uD7A3]/g,
];
const SKIP = ["lib/i18n/catalog", "messages/", "docs/", "__tests__", ".test.", ".spec."];

function walk(d, out = []) {
  if (!fs.existsSync(d)) return out;
  if (fs.statSync(d).isFile()) {
    if (/\.tsx?$/.test(d)) out.push(d);
    return out;
  }
  for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    if (e.name === "node_modules" || e.name === ".next") continue;
    walk(path.join(d, e.name), out);
  }
  return out;
}

function hits(file) {
  const norm = file.replace(/\\/g, "/");
  if (SKIP.some((s) => norm.includes(s))) return 0;
  let n = 0;
  for (const line of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
    const t = line.trim();
    if (t.startsWith("//") || t.startsWith("*")) continue;
    for (const p of PATTERNS) {
      p.lastIndex = 0;
      if (p.test(line)) n++;
    }
  }
  return n;
}

const byFile = new Map();
for (const root of ["app", "components"]) {
  for (const f of walk(root)) {
    const n = hits(f);
    if (n) byFile.set(f.replace(/\\/g, "/"), n);
  }
}
const sorted = [...byFile.entries()].sort((a, b) => b[1] - a[1]);
console.log("files:", sorted.length, "hits:", sorted.reduce((s, [, n]) => s + n, 0));
for (const [f, n] of sorted) console.log(`${n}\t${f}`);
