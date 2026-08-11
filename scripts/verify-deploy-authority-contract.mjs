#!/usr/bin/env node
/**
 * Production deploy authority + Next TS graph contract.
 * Executable CLI Production callers must stay at 0.
 * next.config must use tsconfig.build.json and must not ignoreBuildErrors.
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, dirname, extname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const errors = [];

function read(rel) {
  return readFileSync(join(root, rel), "utf8");
}

const nextConfig = read("next.config.js");
if (!/tsconfigPath:\s*["']tsconfig\.build\.json["']/.test(nextConfig)) {
  errors.push("next.config.js: missing typescript.tsconfigPath tsconfig.build.json");
}
if (/ignoreBuildErrors\s*:\s*true/.test(nextConfig)) {
  errors.push("next.config.js: ignoreBuildErrors true is forbidden");
}

const pkg = JSON.parse(read("package.json"));
const ci = String(pkg.scripts?.ci ?? "");
if (/\bnpm run build\b/.test(ci) || /\bnext build\b/.test(ci)) {
  errors.push("package.json scripts.ci must not run next build");
}
if (!/\btypecheck:build\b/.test(ci) || !/\btypecheck:test\b/.test(ci)) {
  errors.push("package.json scripts.ci must run typecheck:build and typecheck:test");
}

const forbiddenRe = /vercel\s+--prod|deploy\s+--prod|vercel\s+deploy\s+--prod/;
const scanExt = new Set([".sh", ".mjs", ".cjs", ".js", ".ts", ".yml", ".yaml"]);
const skipDirs = new Set([
  "node_modules",
  ".git",
  ".next",
  ".vercel",
  "android",
  "ios",
  "dist",
  ".qa-logs",
  "coverage",
  "playwright-report",
  "test-results",
  ".turbo",
]);

function walk(dir, rel = "") {
  let names;
  try {
    names = readdirSync(dir);
  } catch {
    return;
  }
  for (const name of names) {
    if (skipDirs.has(name)) continue;
    const abs = join(dir, name);
    const childRel = rel ? `${rel}/${name}` : name;
    let st;
    try {
      st = statSync(abs);
    } catch {
      continue;
    }
    if (st.isDirectory()) {
      walk(abs, childRel);
      continue;
    }
    if (!scanExt.has(extname(name))) continue;
    if (childRel.startsWith(".cursor/") || childRel.startsWith("docs/")) continue;
    let text;
    try {
      text = readFileSync(abs, "utf8");
    } catch {
      continue;
    }
    if (forbiddenRe.test(text)) {
      errors.push(`${childRel}: Production CLI deploy token found`);
    }
  }
}

walk(root);

if (errors.length) {
  console.error("[verify:deploy-authority] FAIL");
  for (const e of errors) console.error(`  - ${e}`);
  process.exit(1);
}
console.log("[verify:deploy-authority] PASS");
