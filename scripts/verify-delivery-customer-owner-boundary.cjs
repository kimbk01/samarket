/**
 * Delivery Customer ↔ Owner runtime import boundary.
 *
 * Type-only shared contracts are allowed. Runtime Store/Cache/Realtime/Context
 * imports across role surfaces are forbidden. Known owner-lite/hub-badge debt is
 * intentionally outside cutover ①~③ and must be listed by exact file.
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

function runtimeImports(text) {
  const imports = [];
  const re = /import\s+(?!type\b)[\s\S]*?\sfrom\s+["']([^"']+)["']/g;
  let match;
  while ((match = re.exec(text))) imports.push(match[1]);
  return imports;
}

// Parser contract: type-only is allowed; runtime import is enforceable.
if (runtimeImports('import type { X } from "@/hooks/delivery-owner/x";').length !== 0) {
  failures.push("boundary parser must allow import type");
}
if (
  runtimeImports('import { X } from "@/hooks/delivery-owner/x";')[0] !==
  "@/hooks/delivery-owner/x"
) {
  failures.push("boundary parser must detect runtime import");
}

const customerRoots = [
  "app/(main)/orders",
  "app/(main)/mypage/store-orders",
  "components/orders",
  "components/mypage",
  "components/stores",
  "hooks/delivery-customer",
].map((p) => path.join(root, p));

const ownerRoots = [
  "app/(main)/stores/owner",
  "components/business/owner",
  "components/stores/owner",
  "hooks/delivery-owner",
  "lib/store-owner",
].map((p) => path.join(root, p));

const customerForbidden = [
  /^@\/hooks\/delivery-owner\//,
  /^@\/hooks\/stores\/useOwner/,
  /^@\/lib\/store-owner\//,
  /^@\/lib\/stores\/owner-store-orders/,
  /^@\/lib\/stores\/use-owner-lite-store/,
  /^@\/lib\/stores\/owner-lite-external-store/,
  /^@\/lib\/stores\/owner-hub-/,
];
const ownerForbidden = [
  /^@\/hooks\/delivery-customer\//,
  /^@\/hooks\/useSupabaseBuyerStoreOrdersRealtime/,
  /^@\/lib\/stores\/buyer-store-orders/,
  /^@\/lib\/stores\/store-commerce-cart/,
  /^@\/contexts\/StoreCommerceCartContext/,
  /^@\/components\/mypage\//,
];

/**
 * Exact Customer→Owner runtime debt allowlist.
 * Closeout 2026-07: OrdersHubStoreAdminAccess orphan removed — empty.
 */
const exactRuntimeDebt = new Set([]);

/**
 * Pure UI primitive exception:
 * OwnerStoreSuspenseFallback reuses a loading presentation only; no MyPage
 * Store/Hook/Cache writer is imported.
 */
const exactPureUiAllowed = new Set([
  "components/business/owner/OwnerStoreSuspenseFallback.tsx",
]);

function checkRoleImports(dirs, forbidden, role) {
  for (const dir of dirs) {
    for (const file of walk(dir)) {
      const rel = path.relative(root, file);
      if (role === "Customer" && rel.includes(`${path.sep}stores${path.sep}owner${path.sep}`)) continue;
      if (exactRuntimeDebt.has(rel) || exactPureUiAllowed.has(rel)) continue;
      const text = fs.readFileSync(file, "utf8");
      for (const specifier of runtimeImports(text)) {
        if (forbidden.some((pattern) => pattern.test(specifier))) {
          failures.push(`${rel}: ${role} runtime imports forbidden authority ${specifier}`);
        }
      }
    }
  }
}

checkRoleImports(customerRoots, customerForbidden, "Customer");
checkRoleImports(ownerRoots, ownerForbidden, "Owner");

const ownerApp = path.join(root, "app/(main)/stores/owner");
for (const file of walk(ownerApp)) {
  const text = fs.readFileSync(file, "utf8");
  if (/StoreCommerceCartContext|useStoreCommerceCart/.test(text)) {
    failures.push(`${path.relative(root, file)}: Owner route must not use Customer cart`);
  }
}

const genericRowRealtime = "@/hooks/useSupabaseStoreOrderRowRealtime";
const genericAllowed = new Set([
  "hooks/delivery-customer/useCustomerStoreOrderRowRealtime.ts",
  "hooks/delivery-owner/useOwnerStoreOrderRowRealtime.ts",
  "hooks/admin/useAdminStoreOrderRowRealtime.ts",
]);
for (const base of [...customerRoots, ...ownerRoots]) {
  for (const file of walk(base)) {
    const rel = path.relative(root, file);
    const text = fs.readFileSync(file, "utf8");
    if (text.includes(genericRowRealtime) && !genericAllowed.has(rel)) {
      failures.push(`${rel}: role surface must use Customer/Owner row realtime adapter`);
    }
  }
}

if (failures.length) {
  console.error("[verify:delivery-customer-owner-boundary] FAIL");
  for (const f of failures) console.error(" -", f);
  process.exit(1);
}
console.log("[verify:delivery-customer-owner-boundary] OK — role runtime imports + row realtime adapters");
