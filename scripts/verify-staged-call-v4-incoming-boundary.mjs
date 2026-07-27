#!/usr/bin/env node
/**
 * Pre-commit: if staged files touch call-v4 incoming FSI/fallback bundle, run boundary verify + import guard.
 */
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const manifest = JSON.parse(
  fs.readFileSync(path.join(root, "scripts/call-v4-incoming-fsi-fallback-manifest.json"), "utf8"),
);

const staged = spawnSync("git", ["diff", "--cached", "--name-only"], {
  cwd: root,
  encoding: "utf8",
}).stdout
  .split("\n")
  .map((l) => l.trim())
  .filter(Boolean);

const bundlePaths = new Set([
  ...manifest.androidIncoming,
  ...manifest.webIncoming,
  manifest.qaScript,
  ...manifest.verifyScripts,
  "scripts/call-v4-incoming-fsi-fallback-manifest.json",
  manifest.importGuardTest,
]);

const touched = staged.some((f) => {
  if (bundlePaths.has(f)) return true;
  return (
    f.includes("IncomingCall") &&
    (f.endsWith(".java") || f.includes("call-v4") || f.includes("v4-abc-policy"))
  );
});

if (!touched) {
  console.log("[verify:staged-call-v4-incoming] skip (bundle not in staged diff)");
  process.exit(0);
}

console.log("[verify:staged-call-v4-incoming] bundle paths staged — running boundary gates…");

function run(cmd, args, label) {
  const r = spawnSync(cmd, args, { cwd: root, stdio: "inherit", shell: false });
  if (r.status !== 0) {
    console.error(`[verify:staged-call-v4-incoming] FAIL: ${label}`);
    process.exit(r.status ?? 1);
  }
}

run("node", ["scripts/verify-call-v4-incoming-fsi-fallback-boundary.cjs"], "boundary + structure-lock + push-delivery");
run(
  "npx",
  [
    "vitest",
    "run",
    "--exclude",
    "**/.qa-logs/**",
    "--exclude",
    "**/.worktrees/**",
    manifest.importGuardTest,
  ],
  "call-v4-import-guard",
);
console.log("[verify:staged-call-v4-incoming] PASS");
