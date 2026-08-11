#!/usr/bin/env node
/**
 * git commit 직전 게이트 — CI `check`의 tsc 실패(부분 커밋)를 로컬에서 선차단.
 * tsc 는 working tree 가 아니라 git index 를 본다. dirty 파일이 타입을 메워
 * Vercel/CI 만 터지던 구멍(1bfd71913 / a00f341)을 막는다.
 * 전체 CI 대체 아님. GHA는 `npm run ci` (next build 없음). Vercel이 Next build authority.
 */
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");

function run(cmd, args, label) {
  const executable =
    process.platform === "win32" && (cmd === "npm" || cmd === "npx") ? `${cmd}.cmd` : cmd;
  const r = spawnSync(executable, args, { cwd: root, stdio: "inherit", shell: false, env: process.env });
  if (r.status !== 0) {
    console.error(`[verify:pre-commit] FAIL: ${label}`);
    process.exit(r.status ?? 1);
  }
}

function stagedNeedsTestTypecheck() {
  const r = spawnSync("git", ["diff", "--cached", "--name-only", "-z"], {
    cwd: root,
    encoding: "utf8",
    maxBuffer: 16e6,
  });
  if (r.status !== 0) return false;
  const files = (r.stdout || "").split("\0").filter(Boolean);
  return files.some(
    (f) =>
      /\.(test|spec)\.(ts|tsx)$/.test(f) ||
      f.includes("/__tests__/") ||
      f.startsWith("tests/") ||
      f.startsWith("scripts/") ||
      f === "vitest.config.ts" ||
      f === "playwright.config.ts",
  );
}

const steps = [
  ["node", ["scripts/verify-deploy-imports.mjs", "--staged"], "staged @/ import tree"],
  [
    "node",
    ["scripts/verify-i18n-staged-catalog.mjs", "--staged"],
    "staged i18n catalog keys",
  ],
  ["node", ["scripts/verify-index-tsc.mjs"], "TypeScript source graph (git index)"],
  ...(stagedNeedsTestTypecheck()
    ? [["node", ["scripts/verify-index-tsc.mjs", "--test"], "TypeScript test graph (git index)"]]
    : []),
  ["npm", ["run", "lint"], "ESLint"],
  ["npm", ["run", "verify:i18n-key-exposure"], "i18n key exposure"],
  [
    "node",
    ["scripts/verify-staged-call-v4-incoming-boundary.mjs"],
    "staged call-v4 incoming FSI/fallback bundle",
  ],
];

console.log("[verify:pre-commit] starting…");
for (const [cmd, args, label] of steps) {
  console.log(`[verify:pre-commit] ${label}…`);
  run(cmd, args, label);
}
console.log("[verify:pre-commit] PASS");
