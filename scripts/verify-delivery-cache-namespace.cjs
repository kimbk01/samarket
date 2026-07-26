/**
 * Delivery Customer / Owner order cache namespace lock.
 *
 * Legacy mixed caches are exact debt entries only; no new role-less order cache
 * writer may be introduced.
 */
const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");
const failures = [];
const namespaceFile = path.join(root, "lib/delivery/shared/contracts/delivery-order-cache-namespace.ts");
const namespaceSource = fs.readFileSync(namespaceFile, "utf8");

for (const required of [
  'DELIVERY_CUSTOMER_CACHE_PREFIX = "delivery-customer"',
  'DELIVERY_OWNER_CACHE_PREFIX = "delivery-owner"',
  "deliveryCustomerOrderDetailCacheKey",
  "deliveryOwnerOrderDetailCacheKey",
]) {
  if (!namespaceSource.includes(required)) {
    failures.push(`delivery-order-cache-namespace.ts missing ${required}`);
  }
}

const cartStorage = path.join(root, "lib/stores/store-commerce-cart-storage.ts");
const ownerList = path.join(root, "lib/delivery/owner/owner-store-orders-list-cache.ts");

if (fs.existsSync(cartStorage)) {
  const t = fs.readFileSync(cartStorage, "utf8");
  if (!/kasama_store_commerce_cart|store_commerce_cart/.test(t)) {
    failures.push("customer cart storage key marker missing");
  }
}
if (fs.existsSync(ownerList)) {
  const t = fs.readFileSync(ownerList, "utf8");
  if (/kasama_store_commerce_cart/.test(t)) {
    failures.push("owner orders list cache must not reuse customer cart storage key");
  }
}

const mount = fs.readFileSync(path.join(root, "lib/layout/store-commerce-cart-mount-surfaces.ts"), "utf8");
if (!/\/stores\/owner/.test(mount)) {
  failures.push("cart mount surface must document/exclude /stores/owner");
}

const customerClient = fs.readFileSync(
  path.join(root, "lib/stores/store-delivery-api-client.ts"),
  "utf8"
);
for (const forbidden of [
  "me:store-order:detail:get:",
  "me:store-order:events:get:",
]) {
  if (customerClient.includes(forbidden)) {
    failures.push(`Customer client retains role-less flight key ${forbidden}`);
  }
}
for (const required of [
  "deliveryCustomerOrderDetailCacheKey",
  "deliveryCustomerOrderEventsCacheKey",
]) {
  if (!customerClient.includes(required)) {
    failures.push(`Customer client must use ${required}`);
  }
}

const ownerServer = fs.readFileSync(
  path.join(root, "lib/delivery/owner/owner-store-orders-list-server-cache.ts"),
  "utf8"
);
if (!ownerServer.includes("deliveryOwnerOrdersListCacheKey")) {
  failures.push("Owner list server cache must use delivery-owner namespace");
}
if (ownerServer.includes("ownerUserId.trim()}\\0${storeId.trim()")) {
  failures.push("Owner list server cache retains role-less composite key");
}

const buyerInvalidation = fs.readFileSync(
  path.join(root, "lib/delivery/customer/buyer-store-orders-list-snapshot-cache.ts"),
  "utf8"
);
if (!buyerInvalidation.includes("deliveryCustomerOrdersListCacheKey")) {
  failures.push("Customer list invalidation must use delivery-customer namespace");
}

/**
 * Exact legacy debt (cutover ④~⑥):
 * - store-order-events-read-cache.ts: shared API event ledger, already includes audience.
 * - store-order-event-ownership-cache.ts: shared authorization result, not a UI projection.
 * - owner-hub-badge caches: deferred to owner-hub-badge authority cutover.
 */
const legacyDebt = [
  "lib/stores/store-order-events-read-cache.ts",
  "lib/stores/store-order-event-ownership-cache.ts",
  "lib/community-messenger/hub-store-order-unread-memory-cache.ts",
  "lib/community-messenger/hub-store-order-roomids-memory-cache.ts",
];
for (const rel of legacyDebt) {
  if (!fs.existsSync(path.join(root, rel))) {
    failures.push(`declared delivery cache debt disappeared; remove allowlist entry: ${rel}`);
  }
}

if (failures.length) {
  console.error("[verify:delivery-cache-namespace] FAIL");
  for (const f of failures) console.error(" -", f);
  process.exit(1);
}
console.log("[verify:delivery-cache-namespace] OK — role-prefixed order caches + exact legacy debt");
