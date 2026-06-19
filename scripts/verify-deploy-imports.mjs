#!/usr/bin/env node
/**
 * Git 트리(HEAD 또는 스테이징 후 예상 트리)에서 @/ import 대상이 실제로 존재하는지 검증.
 * 부분 커밋(import만 올리고 의존 파일 미추가) 재발 방지 — 로컬 tsc는 워킹트리를 보므로 이 검사가 필요.
 *
 * Usage:
 *   node scripts/verify-deploy-imports.mjs          # HEAD (CI)
 *   node scripts/verify-deploy-imports.mjs --staged # 커밋 직전 스테이징 트리
 *
 * Env: DEPLOY_IMPORTS_REF=HEAD (기본)
 */
import { spawnSync } from "node:child_process";

const root = process.cwd();
const stagedMode = process.argv.includes("--staged");
const ref = process.env.DEPLOY_IMPORTS_REF?.trim() || "HEAD";

const STATIC_IMPORT_RE = /from ["']@\/([^"']+)["']/g;
const DYNAMIC_IMPORT_RE = /(?<![\'"])import\s*\(\s*["']@\/([^"']+)["']\s*\)/g;

function git(args) {
  const r = spawnSync("git", args, { cwd: root, encoding: "utf8", maxBuffer: 50e6 });
  if (r.status !== 0) {
    const err = (r.stderr || r.stdout || "").trim();
    throw new Error(`git ${args.join(" ")} failed: ${err}`);
  }
  return r.stdout;
}

function gitShow(refPath) {
  const r = spawnSync("git", ["show", refPath], { cwd: root, encoding: "utf8", maxBuffer: 20e6 });
  if (r.status !== 0) return null;
  return r.stdout;
}

function resolveCandidates(base) {
  const candidates = [];
  if (/\.(css|json|svg|png|jpg|jpeg|gif|webp|woff2?)$/i.test(base)) {
    candidates.push(base);
  }
  candidates.push(
    `${base}.ts`,
    `${base}.tsx`,
    `${base}.css`,
    `${base}.json`,
    `${base}.module.css`,
    `${base}/index.ts`,
    `${base}/index.tsx`,
  );
  return candidates;
}

function buildStagedTree() {
  const tracked = git(["ls-files", "-z"]).split("\0").filter(Boolean);
  const stagedDeleted = new Set(
    git(["diff", "--cached", "--name-only", "-z", "--diff-filter=D"]).split("\0").filter(Boolean),
  );
  const stagedChanged = new Set(
    git(["diff", "--cached", "--name-only", "-z"]).split("\0").filter(Boolean),
  );

  const tree = new Set();
  for (const f of tracked) {
    if (!stagedDeleted.has(f)) tree.add(f);
  }
  for (const f of stagedChanged) {
    if (!stagedDeleted.has(f)) tree.add(f);
  }
  return { tree, stagedChanged };
}

function buildHeadTree(refName) {
  const files = git(["ls-tree", "-r", refName, "--name-only"]).split("\n").filter(Boolean);
  return { tree: new Set(files), stagedChanged: new Set() };
}

function readFileContent(filePath, stagedChanged, refName) {
  if (stagedMode && stagedChanged.has(filePath)) {
    return gitShow(`:${filePath}`);
  }
  return gitShow(`${refName}:${filePath}`);
}

function collectMissing({ tree, stagedChanged }, refName) {
  const missing = new Map();
  const tsFiles = [...tree].filter((f) => /\.(ts|tsx)$/.test(f));

  for (const filePath of tsFiles) {
    const content = readFileContent(filePath, stagedChanged, refName);
    if (!content) continue;

    for (const re of [STATIC_IMPORT_RE, DYNAMIC_IMPORT_RE]) {
      for (const m of content.matchAll(re)) {
        const base = m[1].replace(/\\/g, "/");
        const candidates = resolveCandidates(base);
        if (!candidates.some((c) => tree.has(c))) {
          const imp = `@/${base}`;
          if (!missing.has(imp)) missing.set(imp, []);
          missing.get(imp).push(filePath);
        }
      }
    }
  }

  return missing;
}

function main() {
  const label = stagedMode ? "staged" : ref;
  const ctx = stagedMode ? buildStagedTree() : buildHeadTree(ref);
  const missing = collectMissing(ctx, ref);

  if (missing.size === 0) {
    console.log(`verify:deploy-imports OK (${label})`);
    process.exit(0);
  }

  console.error(`verify:deploy-imports FAIL (${label}) — missing modules in git tree:\n`);
  console.error(
    "로컬에 파일이 있어도 git에 없으면 CI tsc가 실패합니다. 의존 파일을 함께 add/commit 하세요.\n",
  );
  for (const [imp, froms] of missing) {
    console.error(imp);
    for (const fr of froms) console.error(`  imported by ${fr}`);
  }
  process.exit(1);
}

try {
  main();
} catch (err) {
  console.error("verify:deploy-imports ERROR:", err instanceof Error ? err.message : err);
  process.exit(1);
}
