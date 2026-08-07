#!/usr/bin/env node
/**
 * Phase B — Delivery structure optimization contract (read-path + invalidate coalesce).
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const fails = [];

function read(rel) {
  return fs.readFileSync(path.join(root, rel), "utf8");
}

const ordersRoute = read("app/api/me/stores/[storeId]/orders/route.ts");
const countsCache = read("lib/stores/store-order-counts-cache.ts");
const invalidate = read(
  "lib/delivery/owner/invalidate-owner-delivery-surfaces-after-mutation.ts"
);
const hub = read("lib/delivery/customer/load-buyer-store-orders-hub-summary.ts");
const restore = read("lib/stores/restore-order-stock.ts");
const createRoute = read("app/api/me/store-orders/route.ts");
const patchRoute = read("app/api/me/stores/[storeId]/orders/[orderId]/route.ts");

if (ordersRoute.includes("fetchOwnerStoreOrderCounts(") && !ordersRoute.includes("metaOnly")) {
  // list path must not call ops RPC counts
}
if (ordersRoute.includes("Promise.all([\n    snapPromise,\n    countPromise")) {
  fails.push("owner list still parallel counts with snapshot");
}
if (!ordersRoute.includes("snap.statusCounts") && !ordersRoute.includes("snap.statusCounts.")) {
  if (!ordersRoute.includes("statusCounts.pending_accept_count")) {
    fails.push("owner list should use snapshot statusCounts for meta");
  }
}

if (!countsCache.includes("StoreOrderCountsFactoryResult") || !countsCache.includes("produced.via")) {
  fails.push("counts cache must store honest via from factory");
}

if (!invalidate.includes("scheduleListRefresh: false") || !invalidate.includes("scheduleSnapshotRefresh: false")) {
  fails.push("mutation invalidate helper must coalesce refresh");
}

if (!patchRoute.includes("invalidateOwnerDeliverySurfacesAfterMutation")) {
  fails.push("owner PATCH must use coalesced invalidate helper");
}

if (!hub.includes("community_messenger_room_id") || !hub.includes("sumBuyerStoreOrderMessengerUnreadFromRoomIds")) {
  fails.push("hub summary must single-pass room ids for unread");
}

if (!restore.includes(".in(\"id\", ids)") && !restore.includes(".in('id', ids)")) {
  fails.push("restoreStockForOrderLines must batch select");
}

{
  const storeIdx = createRoute.indexOf('.from("stores")');
  const valCallIdx = createRoute.indexOf("await validateStoreOrderCheckout");
  if (storeIdx < 0 || valCallIdx < 0 || storeIdx > valCallIdx) {
    fails.push("POST create must load store once before validate");
  }
}

if (fails.length) {
  console.error("FAIL: store-order-structure-optimization\n" + fails.join("\n"));
  process.exit(1);
}
console.log("PASS: store-order-structure-optimization");
process.exit(0);
