/**
 * 오너 주문 목록: 허브 타임라인 캐시 ≠ 전체 목록 캐시, items[] 계약.
 */
import { readFileSync } from "node:fs";

const files = [
  "lib/stores/fetch-store-orders-list-deduped.ts",
  "lib/stores/owner-hub-dashboard-orders-cache.ts",
  "lib/delivery/owner/owner-store-orders-list-cache.ts",
  "lib/business/owner-orders-entry-policy.ts",
  "components/business/owner/OwnerStoreOrdersView.tsx",
];

const errors = [];

for (const f of files) {
  const s = readFileSync(f, "utf8");
  if (f.includes("fetch-store-orders-list-deduped")) {
    if (s.includes("peekOwnerHubDashboardOrdersCache")) {
      errors.push(`${f}: must not peek hub timeline cache`);
    }
    if (!s.includes("peekOwnerStoreOrdersListCache")) {
      errors.push(`${f}: must peek owner-store-orders-list-cache`);
    }
  }
  if (f.includes("owner-hub-dashboard-orders-cache")) {
    if (s.includes("seedOwnerHubDashboardOrdersCacheFromListJson")) {
      errors.push(`${f}: hub cache must not seed from list API`);
    }
  }
  if (f.includes("OwnerStoreOrdersView")) {
    if (s.includes("order.items.map(") && !s.includes("(order.items ?? [])")) {
      errors.push(`${f}: OwnerOrderCard must guard order.items`);
    }
    if (!s.includes("parseOwnerStoreOrdersListFromApiJson")) {
      errors.push(`${f}: must ingest list via parseOwnerStoreOrdersListFromApiJson`);
    }
    if (!s.includes("owner-orders-entry-policy")) {
      errors.push(`${f}: must use owner-orders-entry-policy for fresh_list entry`);
    }
    if (!s.includes("orders_entry_fresh")) {
      errors.push(`${f}: must load with orders_entry_fresh reason`);
    }
  }
  if (f.includes("owner-orders-entry-policy")) {
    if (!s.includes("OWNER_ORDERS_FRESH_LIST_PARAM")) {
      errors.push(`${f}: must define fresh_list query param`);
    }
    if (!s.includes("shouldOwnerOrdersForceNetwork")) {
      errors.push(`${f}: must export shouldOwnerOrdersForceNetwork`);
    }
  }
}

if (errors.length) {
  console.error("verify-owner-store-orders-list-contract FAILED:\n" + errors.join("\n"));
  process.exit(1);
}
console.log("verify-owner-store-orders-list-contract OK");
