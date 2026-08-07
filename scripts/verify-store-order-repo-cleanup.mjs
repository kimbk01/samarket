#!/usr/bin/env node
/**
 * Phase C — Delivery repository cleanup: deleted dead paths stay gone; owner detail uses embedded review.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const fails = [];

function exists(rel) {
  return fs.existsSync(path.join(root, rel));
}

const dead = [
  "lib/business/fetch-store-orders-meta-deduped.ts",
  "lib/store-owner/owner-order-remote.ts",
  "lib/store-owner/owner-order-filters.ts",
  "components/stores/owner/OwnerOrdersPageClient.tsx",
  "components/stores/owner/OwnerOrderDetailPageClient.tsx",
  "components/stores/owner/OwnerOrderCard.tsx",
  "components/stores/owner/OwnerOrderActionPanel.tsx",
  "components/stores/owner/OwnerNotificationBell.tsx",
  "components/stores/owner/StoreOwnerOrderChatsShell.tsx",
];

for (const rel of dead) {
  if (exists(rel)) fails.push(`dead path still exists: ${rel}`);
}

const ownerRpcTs = fs.readFileSync(
  path.join(root, "lib/stores/fetch-store-order-detail-snapshot-rpc.ts"),
  "utf8"
);
if (ownerRpcTs.includes("fetchBuyerStoreOrderDetailSnapshot")) {
  fails.push("buyer detail snapshot helper must remain deleted");
}
if (!ownerRpcTs.includes("review:") || !ownerRpcTs.includes("d.review")) {
  fails.push("owner snapshot TS must map review field");
}

const mig = fs.readFileSync(
  path.join(root, "supabase/migrations/20261022130000_owner_store_order_detail_snapshot_review.sql"),
  "utf8"
);
if (!mig.includes("'review', v_review")) {
  fails.push("owner snapshot migration must return review jsonb");
}

const route = fs.readFileSync(
  path.join(root, "app/api/me/stores/[storeId]/orders/[orderId]/route.ts"),
  "utf8"
);
if (route.includes("loadOwnerOrderReviewDetail(\n      sbAny")) {
  fails.push("snapshot hit must not call loadOwnerOrderReviewDetail");
}
if (!route.includes("snapshotGate.review")) {
  fails.push("owner detail route must use snapshotGate.review on hit");
}

const adminBell = fs.readFileSync(
  path.join(root, "components/admin/order-notifications/AdminNotificationBell.tsx"),
  "utf8"
);
if (adminBell.includes("export function OwnerNotificationBell")) {
  fails.push("deprecated OwnerNotificationBell export must be removed from AdminNotificationBell");
}

if (fails.length) {
  console.error("FAIL: store-order-repo-cleanup\n" + fails.join("\n"));
  process.exit(1);
}
console.log("PASS: store-order-repo-cleanup");
process.exit(0);
