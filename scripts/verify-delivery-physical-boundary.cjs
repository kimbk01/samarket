/**
 * Delivery physical boundary — shared contracts must not re-export Customer/Owner runtime.
 */
const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");
const failures = [];

const sharedDir = path.join(root, "lib/delivery/shared");
function walk(dir, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const name of fs.readdirSync(dir)) {
    const p = path.join(dir, name);
    const st = fs.statSync(p);
    if (st.isDirectory()) walk(p, out);
    else if (/\.(ts|tsx)$/.test(name)) out.push(p);
  }
  return out;
}

for (const file of walk(sharedDir)) {
  const text = fs.readFileSync(file, "utf8");
  if (/owner-lite-external-store|owner-hub-badge-store|store-commerce-cart-storage|useCustomerStoreOrderRowRealtime|useOwnerStoreOrderRowRealtime/.test(text)) {
    failures.push(`${path.relative(root, file)}: shared must not export Customer/Owner runtime`);
  }
}

const oldPath = path.join(root, "lib/stores/delivery-order-cache-namespace.ts");
if (fs.existsSync(oldPath)) {
  failures.push("legacy lib/stores/delivery-order-cache-namespace.ts must be removed (no compatibility export)");
}

const required = [
  "lib/delivery/shared/contracts/delivery-order-cache-namespace.ts",
  "lib/delivery/owner/apply-owner-commerce-notification-invalidate.ts",
  "lib/delivery/owner/projections/owner-navigation-summary.ts",
  "lib/delivery/owner/owner-surface-activity.ts",
  "lib/delivery/owner/owner-store-badge-display-policy.ts",
  "lib/delivery/owner/owner-store-orders-list-cache.ts",
  "lib/delivery/customer/buyer-store-orders-list-snapshot.ts",
  "lib/delivery/customer/delivery-order-history-nav.ts",
];
for (const rel of required) {
  if (!fs.existsSync(path.join(root, rel))) failures.push(`missing ${rel}`);
}

/** Closeout: moved modules must not leave compatibility stubs under lib/stores. */
const forbiddenCompat = [
  "lib/stores/owner-store-badge-display-policy.ts",
  "lib/stores/owner-store-orders-list-cache.ts",
  "lib/stores/buyer-store-orders-list-snapshot.ts",
  "lib/stores/delivery-order-history-nav.ts",
  "lib/stores/pick-preferred-owner-store.ts",
];
for (const rel of forbiddenCompat) {
  if (fs.existsSync(path.join(root, rel))) {
    failures.push(`legacy path must be removed (no compatibility export): ${rel}`);
  }
}

if (failures.length) {
  console.error("[verify:delivery-physical-boundary] FAIL");
  for (const f of failures) console.error(" -", f);
  process.exit(1);
}
console.log("[verify:delivery-physical-boundary] OK — delivery customer/owner/shared physical contracts present");
