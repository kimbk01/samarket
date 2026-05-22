#!/usr/bin/env node
import { execSync } from "node:child_process";

const files = execSync("git ls-tree -r origin/main --name-only", { encoding: "utf8" })
  .split(/\n/)
  .filter((f) => /\.(ts|tsx)$/.test(f));

const tree = new Set(files);
const re = /from ["']@\/([^"']+)["']/g;
const missing = [];

for (const f of files) {
  let content;
  try {
    content = execSync(`git show origin/main:${f}`, { encoding: "utf8", maxBuffer: 20e6 });
  } catch {
    continue;
  }
  for (const m of content.matchAll(re)) {
    const base = m[1].replace(/\\/g, "/");
    const candidates = [`${base}.ts`, `${base}.tsx`, `${base}/index.ts`, `${base}/index.tsx`];
    if (!candidates.some((c) => tree.has(c))) {
      missing.push({ from: f, import: `@/${base}` });
    }
  }
}

const byImport = new Map();
for (const row of missing) {
  if (!byImport.has(row.import)) byImport.set(row.import, []);
  byImport.get(row.import).push(row.from);
}

for (const [imp, froms] of byImport) {
  console.log(imp);
  for (const fr of froms.slice(0, 5)) console.log(`  <- ${fr}`);
  if (froms.length > 5) console.log(`  ... +${froms.length - 5} more`);
}
console.log("\nTotal missing imports:", byImport.size);
process.exit(byImport.size > 0 ? 1 : 0);
