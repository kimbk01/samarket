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

const counts = [];
for (const file of walk("lib")) {
  const lines = fs.readFileSync(file, "utf8").split(/\r?\n/);
  let n = 0;
  for (const line of lines) {
    const t = line.trim();
    if (t.startsWith("//") || t.startsWith("*") || t.startsWith("/**")) continue;
    if (HANGUL.test(line)) n++;
  }
  if (n > 0) counts.push(n);
}

const total = counts.reduce((a, b) => a + b, 0);
const buckets = { gte20: 0, g10_19: 0, g5_9: 0, g1_4: 0 };
for (const n of counts) {
  if (n >= 20) buckets.gte20++;
  else if (n >= 10) buckets.g10_19++;
  else if (n >= 5) buckets.g5_9++;
  else buckets.g1_4++;
}
const sumGte20 = counts.filter((n) => n >= 20).reduce((a, b) => a + b, 0);
const sum10_19 = counts.filter((n) => n >= 10 && n < 20).reduce((a, b) => a + b, 0);
const sumLt10 = counts.filter((n) => n < 10).reduce((a, b) => a + b, 0);
console.log({ files: counts.length, lines: total, buckets, sumGte20, sum10_19, sumLt10 });
