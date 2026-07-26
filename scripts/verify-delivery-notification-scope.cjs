/**
 * Notification writers must not clear Delivery caches without role+store scope.
 */
const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");
const failures = [];

function read(rel) {
  return fs.readFileSync(path.join(root, rel), "utf8");
}

const append = read("lib/notifications/append-user-notification.ts");
if (/invalidateOwnerStoreOrdersListCache\s*\(/.test(append)) {
  failures.push(
    "append-user-notification.ts must not call invalidateOwnerStoreOrdersListCache directly"
  );
}
if (!append.includes("applyOwnerCommerceNotificationInvalidate")) {
  failures.push("append-user-notification.ts must use applyOwnerCommerceNotificationInvalidate");
}

const bridge = read("components/notifications/NotificationsBadgeRealtimeBridge.tsx");
if (/invalidateOwnerStoreOrdersListCache(Coalesced)?\s*\(/.test(bridge)) {
  failures.push(
    "NotificationsBadgeRealtimeBridge must not call Owner list invalidate helpers directly"
  );
}
if (!bridge.includes("applyOwnerCommerceNotificationInvalidate")) {
  failures.push("NotificationsBadgeRealtimeBridge must use scoped Owner notification invalidate");
}

const scoped = read("lib/delivery/owner/apply-owner-commerce-notification-invalidate.ts");
if (!scoped.includes("if (!storeId) return false")) {
  failures.push("Owner commerce notification invalidate must no-op without storeId");
}
if (/invalidateBuyerStoreOrdersList|delivery-customer:|invalidateMeStoreOrder/.test(scoped)) {
  failures.push("Owner notification invalidate must not touch Customer caches");
}

/**
 * Exact debt: notification-unread-count-cache may still fan out owner dashboard
 * snapshot by optional storeId — cutover ⑥ badge authority owns that path.
 */
const debt = ["lib/notifications/notification-unread-count-cache.ts"];
for (const rel of debt) {
  if (!fs.existsSync(path.join(root, rel))) {
    failures.push(`declared notification-scope debt missing: ${rel}`);
  }
}

if (failures.length) {
  console.error("[verify:delivery-notification-scope] FAIL");
  for (const f of failures) console.error(" -", f);
  process.exit(1);
}
console.log("[verify:delivery-notification-scope] OK — Owner invalidate requires storeId");
