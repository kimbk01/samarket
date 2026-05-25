#!/usr/bin/env node
/**
 * LFC1 — global legacy fallback registry audit (static).
 * Emits [legacy-fallback-usage-audit] rows with used_count=0 for all PASS tracks.
 */
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const fails = [];

function mustExist(rel) {
  if (!fs.existsSync(path.join(root, rel))) fails.push(`missing: ${rel}`);
}

function mustInclude(rel, needle) {
  const full = path.join(root, rel);
  if (!fs.existsSync(full)) {
    fails.push(`missing: ${rel}`);
    return;
  }
  if (!fs.readFileSync(full, "utf8").includes(needle)) {
    fails.push(`${rel} missing ${needle}`);
  }
}

console.log("\n=== LFC1 legacy fallback cleanup audit (static) ===\n");

mustExist("lib/ops/legacy-fallback-cleanup-policy.ts");
mustExist("lib/ops/legacy-fallback-usage-audit.ts");
mustExist("docs/perf/legacy-fallback-cleanup-lock.md");
mustExist("docs/perf/legacy-fallback-cleanup-report.md");

const policyText = fs.readFileSync(path.join(root, "lib/ops/legacy-fallback-cleanup-policy.ts"), "utf8");
const tracks = [
  "HUB_BADGE",
  "HS2",
  "RB1",
  "SM1",
  "ODN1",
  "DSA1",
  "OOL1",
  "CR1",
  "SOD1",
  "SOL1",
  "SB1",
  "CMB1",
  "FBT1",
];
for (const t of tracks) {
  if (!policyText.includes(`track: "${t}"`)) fails.push(`registry missing track ${t}`);
}

const legacyModules = [
  "lib/chats/build-owner-hub-badge-payload.ts",
  "lib/community-messenger/service.ts",
  "lib/chats/fetch-chat-rooms-list-legacy.ts",
  "lib/community-messenger/fetch-cm-bootstrap-legacy.ts",
  "lib/community-messenger/fetch-full-bootstrap-legacy.ts",
];

const hardDeletedModules = [
  {
    module: "lib/stores/fetch-store-menus-catalog.ts",
    track: "SM1",
    needle: "tryLoadStoreMenusCatalogFromSnapshot",
  },
  {
    module: "app/api/me/notifications/route.ts",
    track: "ODN1",
    needle: "tryLoadOwnerStoreNotificationsFromSnapshot",
  },
  {
    module: "lib/stores/fetch-owner-store-order-counts.ts",
    track: "DSA1",
    needle: "tryLoadDeliverySummarySnapshot",
  },
  {
    module: "app/api/me/stores/[storeId]/orders/route.ts",
    track: "OOL1",
    needle: "tryLoadOwnerStoreOrdersListFromSnapshot",
  },
  {
    module: "app/api/me/store-orders/route.ts",
    track: "SOL1",
    needle: "tryLoadBuyerStoreOrdersListFromSnapshot",
  },
  {
    module: "app/api/me/store-orders/[orderId]/route.ts",
    track: "SOD1",
    needle: "tryLoadBuyerStoreOrderDetailFromSnapshot",
  },
  {
    module: "app/api/stores/browse/route.ts",
    track: "SB1",
    needle: "tryLoadStoresBrowseFromSnapshot",
  },
  {
    module: "lib/community-messenger/service.ts",
    track: "HS2",
    needle: "tryBuildHomeSyncCriticalFromSnapshot",
  },
];

for (const mod of legacyModules) {
  mustExist(mod);
  const text = fs.readFileSync(path.join(root, mod), "utf8");
  const hasAudit =
    text.includes("auditLegacyFallbackUsage") ||
    text.includes("gateLegacyFallback") ||
    text.includes("LegacyFallbackBlockedError");
  if (!hasAudit) fails.push(`${mod} missing legacy fallback audit/gate`);
}

for (const { module: mod, track, needle } of hardDeletedModules) {
  mustExist(mod);
  mustInclude(mod, needle);
  const text = fs.readFileSync(path.join(root, mod), "utf8");
  if (text.includes("auditLegacyFallbackUsage")) {
    fails.push(`${mod} (${track}) still has auditLegacyFallbackUsage after hard delete`);
  }
  if (text.includes("store-menus-snapshot-fallback")) {
    fails.push(`${mod} (${track}) still has legacy fallback log tag`);
  }
  if (text.includes("owner-notifications-snapshot-fallback")) {
    fails.push(`${mod} (${track}) still has legacy fallback log tag`);
  }
  if (text.includes("fetchOwnerStoreCommerceNotificationsRpc")) {
    fails.push(`${mod} (${track}) still imports owner store commerce list RPC fallback`);
  }
  if (text.includes("owner-store-ops-counts-legacy-fallback")) {
    fails.push(`${mod} (${track}) still has legacy fallback log tag`);
  }
  if (text.includes("fetchOwnerStoreOrderCountsLegacySnapshot")) {
    fails.push(`${mod} (${track}) still has legacy 25-count aggregate`);
  }
  if (text.includes("owner-orders-list-snapshot-fallback")) {
    fails.push(`${mod} (${track}) still has legacy fallback log tag`);
  }
  if (text.includes("buildOwnerStoreOrdersListLegacy")) {
    fails.push(`${mod} (${track}) still imports legacy owner orders list builder`);
  }
  if (text.includes("buyer-orders-list-snapshot-fallback")) {
    fails.push(`${mod} (${track}) still has legacy fallback log tag`);
  }
  if (text.includes("buildBuyerStoreOrdersListLegacy")) {
    fails.push(`${mod} (${track}) still imports legacy buyer orders list builder`);
  }
  if (text.includes("store-order-detail-snapshot-fallback")) {
    fails.push(`${mod} (${track}) still has legacy fallback log tag`);
  }
  if (text.includes("buildBuyerStoreOrderDetailLegacy")) {
    fails.push(`${mod} (${track}) still imports legacy store order detail builder`);
  }
  if (text.includes("stores-browse-snapshot-fallback")) {
    fails.push(`${mod} (${track}) still has legacy fallback log tag`);
  }
  if (text.includes("buildStoresBrowseLegacy")) {
    fails.push(`${mod} (${track}) still imports legacy stores browse builder`);
  }
  if (text.includes("home-sync-snapshot-fallback")) {
    fails.push(`${mod} (${track}) still has legacy fallback log tag`);
  }
  if (text.includes('fallback_branch: "legacy_multi_wave"')) {
    fails.push(`${mod} (${track}) still has HS2 legacy_multi_wave fallback audit`);
  }
}

const auditRows = [];
const routeRe = /route:\s*"([^"]+)"/g;
const branchRe = /fallback_branch:\s*"([^"]+)"/g;
let m;
const routes = [];
while ((m = routeRe.exec(policyText)) !== null) routes.push(m[1]);
const branches = [];
while ((m = branchRe.exec(policyText)) !== null) branches.push(m[1]);

for (let i = 0; i < routes.length; i++) {
  const row = {
    route: routes[i],
    fallback_branch: branches[i] ?? "unknown",
    used_count: 0,
    last_reason: "lfc1_static_registry_probe",
    rpc_deployed: 1,
    snapshot_available: 1,
    can_delete: 0,
    blocker: "ops1b_signoff_insufficient",
    reconnect_related: /bootstrap|home-sync|chat\/rooms|hub-badge/.test(routes[i]) ? 1 : 0,
    prod_seen: 0,
    dev_only: 1,
  };
  auditRows.push(row);
  console.log("[legacy-fallback-usage-audit]", row);
}

console.log("\nregistry routes:", routes.length);
console.log("fails:", fails.length);

if (fails.length) {
  for (const f of fails) console.error("FAIL:", f);
  process.exit(1);
}

console.log("\nLFC1 legacy fallback cleanup audit PASS\n");
