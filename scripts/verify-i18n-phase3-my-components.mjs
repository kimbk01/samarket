/**
 * Phase 3 — components/my i18n 게이트 (카탈로그 + 하드코딩 + 선택 e2e).
 *
 * Usage:
 *   node scripts/verify-i18n-phase3-my-components.mjs
 *   node scripts/verify-i18n-phase3-my-components.mjs --e2e
 *     (Playwright가 webServer로 dev 기동 — 로컬에서 이미 띄운 경우 PLAYWRIGHT_NO_WEBSERVER=1)
 */
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const runE2e = process.argv.includes("--e2e");

function run(label, command, args) {
  console.log(`\n[verify:i18n-phase3-my] ${label}`);
  const result = spawnSync(command, args, { cwd: ROOT, stdio: "inherit", shell: process.platform === "win32" });
  if (result.status !== 0) {
    console.error(`[verify:i18n-phase3-my] FAILED: ${label}`);
    return false;
  }
  return true;
}

let ok = true;
ok = run("check:i18n (ko/en catalog parity)", "npm", ["run", "check:i18n"]) && ok;
ok =
  run("hardcoded Korean scan: components/my", "node", [
    "scripts/check-hardcoded-korean.mjs",
    "components/my",
  ]) && ok;
ok = run("TypeScript", "npx", ["tsc", "--noEmit"]) && ok;

if (runE2e) {
  ok =
    run("Playwright i18n my profile", "npx", [
      "playwright",
      "test",
      "tests/e2e/i18n-my-profile-language.spec.ts",
    ]) && ok;
} else {
  console.log("\n[verify:i18n-phase3-my] skip e2e (pass --e2e to run Playwright)");
}

process.exit(ok ? 0 : 1);
