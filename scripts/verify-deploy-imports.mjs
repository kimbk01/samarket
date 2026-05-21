#!/usr/bin/env node
/**
 * Push 전 검증: origin/main 트리에 깨진 @/ import 가 있으면 exit 1.
 * 근본 원인(부분 커밋) 재발 방지.
 */
import { execSync } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const ref = process.env.DEPLOY_IMPORTS_REF?.trim() || "HEAD";

function listFiles(refName) {
  return execSync(`git ls-tree -r ${refName} --name-only`, { encoding: "utf8" })
    .split(/\n/)
    .filter((f) => /\.(ts|tsx)$/.test(f));
}

function resolveImport(base) {
  const candidates = [
    `${base}.ts`,
    `${base}.tsx`,
    `${base}/index.ts`,
    `${base}/index.tsx`,
  ];
  for (const c of candidates) {
    if (existsSync(join(root, c))) return c;
  }
  return null;
}

const files = listFiles(ref);
const tree = new Set(files);
const re = /from ["']@\/([^"']+)["']/g;
const missing = new Map();

for (const f of files) {
  const content = execSync(`git show ${ref}:${f}`, { encoding: "utf8", maxBuffer: 20e6 });
  for (const m of content.matchAll(re)) {
    const base = m[1].replace(/\\/g, "/");
    const candidates = [`${base}.ts`, `${base}.tsx`, `${base}/index.ts`, `${base}/index.tsx`];
    if (!candidates.some((c) => tree.has(c))) {
      const imp = `@/${base}`;
      if (!missing.has(imp)) missing.set(imp, []);
      missing.get(imp).push(f);
    }
  }
}

if (missing.size === 0) {
  console.log(`verify:deploy-imports OK (${ref})`);
  process.exit(0);
}

console.error(`verify:deploy-imports FAIL (${ref}) — missing modules:\n`);
for (const [imp, froms] of missing) {
  console.error(imp);
  for (const fr of froms) console.error(`  imported by ${fr}`);
}
process.exit(1);
