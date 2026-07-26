/**
 * Delivery cache namespace markers — Customer cart storage vs Owner list cache prefixes must stay distinct.
 */
const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");
const failures = [];

const cartStorage = path.join(root, "lib/stores/store-commerce-cart-storage.ts");
const ownerList = path.join(root, "lib/stores/owner-store-orders-list-cache.ts");

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

if (failures.length) {
  console.error("[verify:delivery-cache-namespace] FAIL");
  for (const f of failures) console.error(" -", f);
  process.exit(1);
}
console.log("[verify:delivery-cache-namespace] OK — customer cart vs owner list keys remain distinct");
