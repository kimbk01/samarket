/**
 * 오너 주문 목록: 허브 타임라인 캐시 ≠ 전체 목록 캐시, items[] 계약.
 */
import { readFileSync } from "node:fs";

const files = [
  "lib/stores/fetch-store-orders-list-deduped.ts",
  "lib/stores/owner-hub-dashboard-orders-cache.ts",
  "lib/stores/owner-store-orders-list-cache.ts",
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
  }
}

if (errors.length) {
  console.error("verify-owner-store-orders-list-contract FAILED:\n" + errors.join("\n"));
  process.exit(1);
}
console.log("verify-owner-store-orders-list-contract OK");
