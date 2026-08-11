/**
 * Fast preflight before push — catches recurring CI failures without full build.
 * GHA `npm run ci` has no next build. Local full gate is `npm run check` (ci + build + check:bundle).
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
    console.error(`[verify:ci-stability] FAIL: ${label}`);
    process.exit(r.status ?? 1);
  }
}

const steps = [
  ["node", ["scripts/verify-bundle-budget-baseline.cjs"], "bundle baseline JSON"],
  ["node", ["scripts/verify-stores-home-hub-contract.cjs"], "stores home hub contract"],
  ["npm", ["run", "typecheck:build"], "TypeScript source graph"],
  ["npm", ["run", "test", "--", "--run", "lib/stores/__tests__/stores-browse-prewarm-coordinator.test.ts"], "stores prewarm unit test"],
  ["node", ["--test", "scripts/__tests__/bundle-budget-lock.test.mjs"], "bundle budget lock unit test"],
];

for (const [cmd, args, label] of steps) {
  console.log(`[verify:ci-stability] ${label}…`);
  run(cmd, args, label);
}

console.log("[verify:ci-stability] PASS");
