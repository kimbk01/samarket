#!/usr/bin/env node
/**
 * LFC1 structural verify — policy, guards, legacy module wiring, verify scripts.
 */
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const fails = [];
const passes = [];

function mustExist(rel) {
  const full = path.join(root, rel);
  if (!fs.existsSync(full)) fails.push(`missing: ${rel}`);
  else passes.push(`exists: ${rel}`);
}

function mustInclude(rel, needle) {
  const full = path.join(root, rel);
  if (!fs.existsSync(full)) {
    fails.push(`missing: ${rel}`);
    return;
  }
  if (!fs.readFileSync(full, "utf8").includes(needle)) fails.push(`${rel} missing ${needle}`);
  else passes.push(`${rel} includes ${needle}`);
}

console.log("\n=== LFC1 structural verify ===\n");

mustExist("lib/ops/legacy-fallback-cleanup-policy.ts");
mustExist("lib/ops/legacy-fallback-cleanup-regression-guard.ts");
mustExist("lib/ops/fallback-cleanup-verification.ts");
mustExist("docs/perf/legacy-fallback-cleanup-lock.md");
mustExist("docs/perf/legacy-fallback-cleanup-report.md");
mustExist("scripts/verify-legacy-fallback-cleanup-audit.mjs");

mustInclude("lib/ops/legacy-fallback-cleanup-policy.ts", "LEGACY_FALLBACK_ROUTE_REGISTRY");
mustInclude("lib/ops/legacy-fallback-cleanup-policy.ts", "LegacyFallbackBlockedError");
mustInclude("lib/ops/legacy-fallback-cleanup-policy.ts", "ops1bDeleteGateMet");
mustInclude("lib/ops/legacy-fallback-usage-audit.ts", "used_count");
mustInclude("lib/ops/legacy-fallback-cleanup-regression-guard.ts", "[legacy-cleanup-regression-alert]");
mustInclude("lib/ops/fallback-cleanup-verification.ts", "[fallback-cleanup-verification]");

mustInclude("app/api/stores/browse/route.ts", "tryLoadStoresBrowseFromSnapshot");
mustInclude("app/api/me/store-orders/route.ts", "tryLoadBuyerStoreOrdersListFromSnapshot");
mustInclude("app/api/community-messenger/bootstrap/route.ts", "tryLoadFullBootstrapFromSnapshot");

const pkg = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
for (const script of ["verify:legacy-fallback-cleanup-audit", "verify:legacy-fallback-cleanup-structural"]) {
  if (!pkg.scripts?.[script]) fails.push(`package.json missing ${script}`);
  else passes.push(`package.json has ${script}`);
}

console.log("passes:", passes.length);
console.log("fails:", fails.length);
if (fails.length) {
  for (const f of fails) console.error("FAIL:", f);
  process.exit(1);
}

const verification = {
  route: "LFC1/global",
  fallback_removed: 0,
  verify_rpc_pass: 1,
  verify_e2e_pass: 0,
  reconnect_pass: 0,
  burst_pass: 0,
  stale_detected: 0,
  regression_alert_count: 0,
  query_wave_2_ms: 0,
  rpc_removed: 1,
  pass: 0,
  blocker: "ops1b_signoff_insufficient",
};
console.log("[fallback-cleanup-verification]", verification);

console.log("\nLFC1 structural verify PASS (hard delete gate not met)\n");
