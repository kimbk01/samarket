#!/usr/bin/env node
/**
 * CUT H — Pre-launch Reset safety gate.
 */
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

const root = process.cwd();
const read = (rel) => readFileSync(resolve(root, rel), "utf8");
const fail = (msg) => {
  console.error(`FAIL: ${msg}`);
  process.exit(1);
};
const ok = (msg) => console.log(`OK: ${msg}`);

const files = [
  "lib/admin/admin-real-operation-cut-h-prelaunch-reset-hard-lock.ts",
  "docs/dibay-admin-real-operation-cut-h-prelaunch-reset-hard-lock.md",
  "lib/admin/prelaunch-reset/planner.ts",
  "lib/admin/prelaunch-reset/execute.ts",
  "lib/admin/prelaunch-reset/environment.ts",
  "app/api/admin/prelaunch-reset/dry-run/route.ts",
  "app/api/admin/prelaunch-reset/execute/route.ts",
  "components/admin/prelaunch-reset/AdminPrelaunchResetPage.tsx",
  "app/admin/prelaunch-reset/page.tsx",
];
for (const f of files) {
  if (!existsSync(resolve(root, f))) fail(`missing ${f}`);
}

const a = read("lib/admin/admin-real-operation-cut-h-prelaunch-reset-hard-lock.ts");
for (const s of [
  "ADMIN_REAL_OPERATION_CUT_H_LOCKED = true",
  "protectBeforeDelete: true",
  "sharedPlannerRequired: true",
  "productionExecuteForbidden: true",
  "productionDryRunFailClosed: true",
  "authUserDeleteDefaultForbidden: true",
  "financeAmbiguousBlock: true",
  'placementActiveEligibility: "DEFERRED_TO_CUT_I"',
]) {
  if (!a.includes(s)) fail(`anchor missing: ${s}`);
}

const env = read("lib/admin/prelaunch-reset/environment.ts");
if (!env.includes("production_execute_forbidden")) fail("env gate missing production block");
if (!env.includes("production_dry_run_requires_explicit_opt_in")) {
  fail("env gate missing production dry-run opt-in fail-closed");
}
if (!env.includes("PRELAUNCH_RESET_ENABLED")) fail("env gate missing enable flag");
if (!env.includes("PRELAUNCH_RESET_PRODUCTION_DRY_RUN")) {
  fail("env gate missing PRODUCTION_DRY_RUN flag");
}

const planner = read("lib/admin/prelaunch-reset/planner.ts");
if (!planner.includes("export async function buildPrelaunchResetPlan")) {
  fail("shared planner missing");
}
if (!planner.includes("finance_rows_present_block")) fail("finance blocker missing");

const exec = read("lib/admin/prelaunch-reset/execute.ts");
if (!exec.includes("revalidatePrelaunchResetPlan")) fail("stale revalidate missing");
if (!exec.includes("confirmationMatches")) fail("typed confirmation missing");
if (exec.includes("DELETE FROM auth.users") || exec.includes('from("auth.users")')) {
  fail("auth.users delete must not be in executor");
}

const ui = read("components/admin/prelaunch-reset/AdminPrelaunchResetPage.tsx");
if (ui.includes("wipe-all-app-data")) fail("UI must not reference wipe-all script");
if (!ui.includes("data-admin-prelaunch-reset")) fail("UI marker missing");
if (!ui.includes("admin_prelaunch_reset_scope_limit")) {
  fail("UI must declare executable scope limit (no full wipe claim)");
}

const menu = read("components/admin/admin-menu.ts");
if (!menu.includes("/admin/prelaunch-reset")) fail("menu entry missing");

ok("CUT H Pre-launch Reset hard lock");
process.exit(0);
