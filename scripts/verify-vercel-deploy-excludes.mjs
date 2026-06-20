#!/usr/bin/env node
/**
 * `docs/perf` QA APK·스크린샷이 git/Vercel 번들에 들어가 serverless 한도를 넘지 않게 한다.
 *
 * 사용: npm run verify:vercel-deploy-excludes
 */
import { existsSync, readFileSync } from "node:fs";
import { execSync } from "node:child_process";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const errors = [];

function read(rel) {
  return readFileSync(join(root, rel), "utf8");
}

function assertIncludes(source, needle, context) {
  if (!source.includes(needle)) errors.push(`${context}: missing "${needle}"`);
}

const vercelignore = read(".vercelignore");
assertIncludes(vercelignore, "docs/perf/**/*.apk", ".vercelignore");
assertIncludes(vercelignore, "docs/perf/qa-safe-area/", ".vercelignore");

const nextConfig = read("next.config.js");
assertIncludes(nextConfig, "outputFileTracingExcludes", "next.config.js");
assertIncludes(nextConfig, "./docs/perf/**", "next.config.js");

const gitignore = read(".gitignore");
assertIncludes(gitignore, "docs/perf/**/*.apk", ".gitignore");

let trackedApks = "";
try {
  trackedApks = execSync("git ls-files 'docs/perf/*.apk'", { cwd: root, encoding: "utf8" }).trim();
} catch {
  trackedApks = "";
}
if (trackedApks) {
  const count = trackedApks.split("\n").filter(Boolean).length;
  errors.push(`git index: ${count} docs/perf/*.apk still tracked — run: git rm --cached docs/perf/*.apk`);
}

if (errors.length > 0) {
  console.error("verify:vercel-deploy-excludes FAIL\n");
  for (const e of errors) console.error(`  - ${e}`);
  process.exit(1);
}

console.log("verify:vercel-deploy-excludes PASS");
