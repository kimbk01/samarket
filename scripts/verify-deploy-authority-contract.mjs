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
/** `npm run x` 를 재귀로 펼친 전체 명령 (ci → ci:static + test:ci). */
function expandScript(name, seen = new Set()) {
  if (seen.has(name)) return "";
  seen.add(name);
  const body = String(pkg.scripts?.[name] ?? "");
  return body.replace(/\bnpm run ([\w:.-]+)/g, (_, n) => `(${expandScript(n, seen)})`) + ` #${name}`;
}
const ci = expandScript("ci");
const ciStatic = String(pkg.scripts?.["ci:static"] ?? "");
if (/\bnpm run build\b/.test(ci) || /\bnext build\b/.test(ci)) {
  errors.push("package.json scripts.ci must not run next build");
}
// typecheck 1회 (AGENTS 개발 프로세스 · 5단계): tsconfig.test.json → references tsconfig.app.json 이 tsconfig.build.json 과 같은 파일·옵션을 검사하므로
// ci:static 은 typecheck:test 만 돈다. 그 전제(아래 parity)가 깨지면 실패.
if (!/\btypecheck:test\b/.test(ciStatic)) {
  errors.push("package.json scripts.ci:static must run typecheck:test");
}
if (!/\bnpm run ci:static\b/.test(String(pkg.scripts?.ci ?? "")) || !/\bnpm run test:ci\b/.test(String(pkg.scripts?.ci ?? ""))) {
  errors.push("package.json scripts.ci must be ci:static + test:ci");
}
{
  const tsBuild = JSON.parse(read("tsconfig.build.json"));
  const tsApp = JSON.parse(read("tsconfig.app.json"));
  const code = (x) => (x ?? []).filter((s) => !s.endsWith(".json")).slice().sort().join("|");
  const list = (x) => (x ?? []).slice().sort().join("|");
  const EMIT_ONLY = new Set(["composite", "noEmit", "emitDeclarationOnly", "declaration", "declarationMap", "outDir", "tsBuildInfoFile"]);
  const opts = (o) => JSON.stringify(Object.keys(o ?? {}).filter((k) => !EMIT_ONLY.has(k)).sort().map((k) => [k, o[k]]));
  if (code(tsBuild.include) !== code(tsApp.include)) errors.push("tsconfig.build.json/app.json include (non-json) differ — typecheck:test no longer covers typecheck:build");
  if (list(tsBuild.exclude) !== list(tsApp.exclude)) errors.push("tsconfig.build.json/app.json exclude differ — typecheck:test no longer covers typecheck:build");
  if (opts(tsBuild.compilerOptions) !== opts(tsApp.compilerOptions)) errors.push("tsconfig.build.json/app.json compilerOptions differ beyond emit-only keys");
  if (tsBuild.extends !== tsApp.extends) errors.push("tsconfig.build.json/app.json extends differ");
}
{
  const wf = read(".github/workflows/ci.yml");
  if (!/npm run ci:static\b/.test(wf)) errors.push("ci.yml must run npm run ci:static");
  if (!/vitest run --shard=\$\{\{ matrix\.shard \}\}\/2/.test(wf) || !/shard: \[1, 2\]/.test(wf)) errors.push("ci.yml must run vitest shards 1/2 and 2/2");
  const wfCommands = wf.split("\n").filter((l) => !/^\s*(#|-?\s*name:)/.test(l)).join("\n");
  if (/\bnext build\b|\bnpm run build\b/.test(wfCommands)) errors.push("ci.yml must not run next build");
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
