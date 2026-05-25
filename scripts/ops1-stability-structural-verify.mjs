#!/usr/bin/env node
/**
 * OPS1 structural verify — modules, wiring, fallback audit sites (no prod URL required).
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
  const text = fs.readFileSync(full, "utf8");
  if (!text.includes(needle)) fails.push(`${rel} missing ${needle}`);
  else passes.push(`${rel} includes ${needle}`);
}

console.log("\n=== OPS1 structural verify ===\n");

mustExist("lib/ops/legacy-fallback-usage-audit.ts");
mustExist("lib/ops/legacy-fallback-cleanup-policy.ts");
mustExist("lib/ops/legacy-fallback-cleanup-regression-guard.ts");
mustExist("docs/perf/legacy-fallback-cleanup-lock.md");
mustExist("lib/ops/reconnect-stress-analysis.ts");
mustExist("lib/ops/realtime-burst-analysis.ts");
mustExist("lib/ops/long-session-stability.ts");
mustExist("scripts/ops1-prod-same-region-signoff.mjs");
mustExist("docs/perf/prod-signoff-report.md");

mustInclude("lib/chats/build-owner-hub-badge-payload.ts", "auditLegacyFallbackUsage");
mustInclude("lib/community-messenger/service.ts", "auditLegacyFallbackUsage");
mustInclude("lib/stores/fetch-store-menus-catalog.ts", "tryLoadStoreMenusCatalogFromSnapshot");
mustInclude("lib/stores/fetch-owner-store-order-counts.ts", "auditLegacyFallbackUsage");
mustInclude("app/api/me/notifications/route.ts", "auditLegacyFallbackUsage");
mustInclude("lib/community-messenger/consistency/messenger-consistency-cross-tab.ts", "recordReconnectStressEvent");
mustInclude("lib/community-messenger/home/use-community-messenger-home-realtime-bootstrap-list.ts", "recordReconnectStressEvent");
mustInclude("lib/community-messenger/consistency/messenger-consistency-analysis.ts", "recordRealtimeBurstEvent");
mustInclude("components/community-messenger/CommunityMessengerHome.tsx", "initLongSessionStabilityMonitor");

console.log("passes:", passes.length);
console.log("fails:", fails.length);
if (fails.length) {
  for (const f of fails) console.error("FAIL:", f);
  process.exit(1);
}
console.log("\nOPS1 structural verify PASS\n");
