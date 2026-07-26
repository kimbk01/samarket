/**
 * Delivery Customer cart Provider must not mount on Owner routes.
 * Also: /stores/owner pages must not import StoreCommerceCartContext.
 */
const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");
const failures = [];

const mountSrc = fs.readFileSync(
  path.join(root, "lib/layout/store-commerce-cart-mount-surfaces.ts"),
  "utf8"
);
if (!/stores\/owner/.test(mountSrc) || !/return false/.test(mountSrc)) {
  failures.push("store-commerce-cart-mount-surfaces.ts must exclude /stores/owner");
}

function walk(dir, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const name of fs.readdirSync(dir)) {
    const p = path.join(dir, name);
    const st = fs.statSync(p);
    if (st.isDirectory()) walk(p, out);
    else if (/\.(tsx|ts)$/.test(name)) out.push(p);
  }
  return out;
}

const ownerApp = path.join(root, "app/(main)/stores/owner");
for (const file of walk(ownerApp)) {
  const text = fs.readFileSync(file, "utf8");
  if (/StoreCommerceCartContext|useStoreCommerceCart/.test(text)) {
    failures.push(`${path.relative(root, file)}: Owner route must not use Customer cart`);
  }
}

if (failures.length) {
  console.error("[verify:delivery-customer-owner-boundary] FAIL");
  for (const f of failures) console.error(" -", f);
  process.exit(1);
}
console.log("[verify:delivery-customer-owner-boundary] OK — cart mount/owner cart import boundary");
