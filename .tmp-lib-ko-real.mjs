import fs from "fs";
import path from "path";

const HANGUL = /[\uAC00-\uD7A3]/;
const SKIP_DIR = /(?:^|[\\/])(?:__tests__|i18n[\\/]catalog)(?:[\\/]|$)/;
const SKIP_FILE = /(?:^|[\\/])mock[-_]|[-_]mock\.|\.test\.|\.spec\.|mock-data|mock-|browse-mock|sample-|fixtures?/i;

function walk(d, out = []) {
  for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    const p = path.join(d, e.name);
    const rel = p.replace(/\\/g, "/");
    if (e.isDirectory()) {
      if (e.name === "node_modules" || e.name === ".next") continue;
      if (SKIP_DIR.test(rel)) continue;
      walk(p, out);
    } else if (/\.ts$/.test(e.name) && !SKIP_FILE.test(rel)) {
      if (!SKIP_DIR.test(rel)) out.push(rel);
    }
  }
  return out;
}

const byFile = new Map();
for (const file of walk("lib")) {
  const lines = fs.readFileSync(file, "utf8").split(/\r?\n/);
  let n = 0;
  for (const line of lines) {
    const t = line.trim();
    if (t.startsWith("//") || t.startsWith("*") || t.startsWith("/**")) continue;
    if (HANGUL.test(line)) n++;
  }
  if (n > 0) byFile.set(file.replace(/\\/g, "/"), n);
}

const sorted = [...byFile.entries()].sort((a, b) => b[1] - a[1]);
console.log("files:", sorted.length, "lines:", sorted.reduce((s, [, n]) => s + n, 0));
for (const [f, n] of sorted.slice(0, 45)) console.log(`${n}\t${f}`);
