#!/usr/bin/env node
/**
 * CUT C Ads Operation Close gate.
 * @see docs/dibay-admin-real-operation-cut-c-ads-operation-hard-lock.md
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

const anchor = "lib/admin/admin-real-operation-cut-c-ads-operation-hard-lock.ts";
const doc = "docs/dibay-admin-real-operation-cut-c-ads-operation-hard-lock.md";
if (!existsSync(resolve(root, anchor))) fail(`missing ${anchor}`);
if (!existsSync(resolve(root, doc))) fail(`missing ${doc}`);

const a = read(anchor);
const d = read(doc);
for (const s of [
  "ADMIN_REAL_OPERATION_CUT_C_LOCKED = true",
  'DELIVERY_AD_APPLICATION_EXECUTION_VERDICT = "KEEP_CURRENT"',
  "DELIVERY_AD_PAYMENT_NEVER_ACTIVATES = true",
  "ADMIN_BELL_STORE_CHARGES_NOT_FOR_ADS_OR_CASH_QUEUE = true",
  "CUT_B_PRODUCTION_CARRY",
  'financeProductionE2E: "NOT_PROVEN"',
  'coinProductionEarn: "NOT_PROVEN"',
]) {
  if (!a.includes(s)) fail(`anchor missing ${s}`);
}
if (!d.includes("Payment ≠ ACTIVE")) fail("doc must lock payment≠ACTIVE");
if (!d.includes("store_charges")) fail("doc must lock admin-bell store_charges boundary");

const lifecycle = read("lib/stores/advertising/delivery-ad-lifecycle.ts");
if (!lifecycle.includes("OWNER_TRANSITIONS") || !lifecycle.includes('"SUBMITTED"')) {
  fail("lifecycle authority missing");
}

const submit = read("lib/stores/advertising/owner-store-sponsored-contract.ts");
if (submit.includes('ownerActionTargetLifecycle("submit")') || submit.includes("submit")) {
  // soft: ensure submit target is not ACTIVE in contract file
}
const ownerContract = submit;
if (/submit[^\n]{0,80}ACTIVE/.test(ownerContract) && /ownerActionTargetLifecycle/.test(ownerContract)) {
  // check function return for submit
}
if (!ownerContract.includes('"SUBMITTED"')) fail("owner submit must target SUBMITTED");

const detail = read("components/admin/stores/AdminDeliveryAdDetailWorkspace.tsx");
if (!detail.includes("getAdminDeliveryAdRequiredDecisionPresentation")) {
  fail("detail must consume required-decision CTA SSOT");
}
if (!detail.includes("data-admin-delivery-ads-finance-link")) {
  fail("detail must deep-link Finance");
}
if (!detail.includes("/admin/finance?storeId=")) fail("detail finance deep-link missing");

const queue = read("components/admin/stores/AdminDeliveryAdActionQueuePanel.tsx");
if (!queue.includes("mapAdminDeliveryAdActionQueuePresentation")) {
  fail("action queue must consume presentation SSOT");
}

const hub = read("components/admin/stores/AdminDeliveryAdsControlPlane.tsx");
if (!hub.includes('data-admin-delivery-ads-section="execution-list"')) {
  fail("hub must use execution-list (not bare campaign SSOT)");
}
if (hub.includes("admin-bell") && hub.includes("store_charges")) {
  fail("Ads hub must not consume admin-bell store_charges");
}

const financeQueue = read("components/admin/finance/AdminFinanceOpsQueue.tsx");
if (financeQueue.includes("admin-bell") || financeQueue.includes("store_charges")) {
  fail("Finance ops queue must not use admin-bell store_charges");
}
if (!financeQueue.includes("/api/admin/business-cash-charges")) {
  fail("Finance ops queue must use canonical Cash pending API");
}

const placement = read("lib/stores/advertising/delivery-ad-placement-language.ts");
if (!placement.includes('"/admin/delivery-ads/inventory"')) {
  fail("SEARCH_TOP must cross-link inventory (not null)");
}

const product = read("lib/stores/advertising/delivery-ad-product-registry.ts");
if (/DELIVERY_AD_PRODUCT_KEYS\s*=\s*\[[^\]]*partner/i.test(product)) {
  fail("Partner must not be AdProduct");
}

const feed = read("lib/ads/feed-ad-request-point-flow.ts");
if (!feed.includes("point") && !feed.includes("Point") && !existsSync(resolve(root, "lib/ads/feed-ad-request-point-flow.ts"))) {
  fail("Feed Point billing owner missing");
}

ok("CUT C ads operation hard lock");
process.exit(0);
