#!/usr/bin/env node
/**
 * CUT E — Control Plane / Action Center / Bell Cash semantic gate.
 */
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

const root = process.cwd();
const read = (rel) => readFileSync(resolve(root, rel), "utf8");
const fail = (msg) => {
  console.error(`FAIL: ${msg}`);
  process.exit(1);
};
const ok = (msg) => console.log(`OK: ${msg}`);

const anchor = "lib/admin/admin-real-operation-cut-e-control-plane-hard-lock.ts";
const doc = "docs/dibay-admin-real-operation-cut-e-control-plane-hard-lock.md";
if (!existsSync(resolve(root, anchor))) fail(`missing ${anchor}`);
if (!existsSync(resolve(root, doc))) fail(`missing ${doc}`);

const a = read(anchor);
for (const s of [
  "ADMIN_REAL_OPERATION_CUT_E_LOCKED = true",
  "newDbForbidden: true",
  'mutationOwner: "CANONICAL_DOMAIN_ONLY"',
  "storeChargesMustNotDriveCashUi: true",
  'cashCategoryKey: "cash_charges"',
  'tabletControlPlane: "NOT_PROVEN"',
]) {
  if (!a.includes(s)) fail(`anchor missing: ${s}`);
}

const queue = read("lib/admin/admin-action-queue.ts");
if (!queue.includes("cash_charges")) fail("action queue missing cash_charges");
if (!queue.includes('business_cash_charge_requests')) {
  fail("action queue must count business_cash_charge_requests");
}
if (!queue.includes("const charges = cash_charges + user_charges")) {
  fail("actionable charges must be cash+user, not AST-002 store_charges");
}

const urgent = read("components/admin/dashboard/DashboardUrgentBlock.tsx");
if (urgent.includes('countKey: "storeCharges"')) {
  fail("DashboardUrgentBlock must not use storeCharges for Cash href");
}
if (!urgent.includes("cashChargePendingCount")) {
  fail("DashboardUrgentBlock must use cashChargePendingCount");
}

const center = read("components/admin/dashboard/AdminActionCenter.tsx");
if (!center.includes("data-admin-action-center")) fail("Action Center missing");
if (!center.includes("data-admin-control-plane")) fail("Control Plane marker missing");

const dash = read("components/admin/dashboard/AdminDashboardPage.tsx");
if (!dash.includes("AdminActionCenter")) fail("Dashboard must mount Action Center");

const overview = read("app/api/admin/customer-platform/overview/route.ts");
if (!overview.includes("cash_charge_pending: counts.cash_charges")) {
  fail("CP overview must map Cash from cash_charges");
}

const hub = read("components/admin/business/AdminBusinessOpsOverview.tsx");
if (!hub.includes("data-admin-store-ops-hub-links")) fail("Store ops hub links missing");
if (!hub.includes("data-store-hub-finance")) fail("Store finance link missing");

const adsHub = read("components/admin/stores/AdminDeliveryAdsControlPlane.tsx");
if (!adsHub.includes('searchParams.get("view")')) {
  fail("Ads hub must read view from URL");
}

for (const shell of [
  "app/admin/control-plane-v2/page.tsx",
  "app/admin/ads-v2/page.tsx",
  "app/admin/growth-v2/page.tsx",
]) {
  if (existsSync(resolve(root, shell))) fail(`forbidden shell: ${shell}`);
}

ok("CUT E Control Plane hard lock");
process.exit(0);
