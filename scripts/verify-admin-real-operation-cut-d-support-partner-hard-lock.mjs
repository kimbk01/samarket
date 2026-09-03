#!/usr/bin/env node
/**
 * DIBAY Admin Real Operation CUT D — Support + Partner context linkage gate.
 * @see docs/dibay-admin-real-operation-cut-d-support-partner-hard-lock.md
 */
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

const root = process.cwd();

function read(rel) {
  return readFileSync(resolve(root, rel), "utf8");
}

function fail(msg) {
  console.error(`FAIL: ${msg}`);
  process.exit(1);
}

function ok(msg) {
  console.log(`OK: ${msg}`);
}

const anchorPath = "lib/admin/admin-real-operation-cut-d-support-partner-hard-lock.ts";
const docPath = "docs/dibay-admin-real-operation-cut-d-support-partner-hard-lock.md";

if (!existsSync(resolve(root, anchorPath))) fail(`missing ${anchorPath}`);
if (!existsSync(resolve(root, docPath))) fail(`missing ${docPath}`);

const anchor = read(anchorPath);
const doc = read(docPath);

for (const s of [
  "ADMIN_REAL_OPERATION_CUT_D_LOCKED = true",
  "mergeOpsThreadIntoSupport: false",
  "supportMutatesAds: false",
  "supportMutatesFinance: false",
  "partnerIsAdProduct: false",
  'financeProductionE2E: "NOT_PROVEN"',
  'popupRuntime: "NOT_PROVEN"',
  'tabletSupportPartner: "NOT_PROVEN"',
  "FEED_AD_REQUEST",
  "PLATFORM_POPUP_OWNER_REQUEST",
  "PARTNER_MEMBERSHIP",
]) {
  if (!anchor.includes(s)) fail(`anchor missing: ${s}`);
}

if (!doc.includes("SUPPORT CASE")) fail("doc must separate SUPPORT CASE");
if (!doc.includes("DELIVERY OPS THREAD")) fail("doc must separate OPS THREAD");
if (!doc.includes("do not squash")) fail("doc must keep independent commits");

const refAuth = read("lib/support/support-reference-authority.ts");
for (const t of [
  "FEED_AD_REQUEST",
  "PLATFORM_POPUP_OWNER_REQUEST",
  "POINT_CHARGE_REQUEST",
  "BUSINESS_CASH_CHARGE_REQUEST",
  "PARTNER_MEMBERSHIP",
]) {
  if (!refAuth.includes(`"${t}"`)) fail(`reference authority missing ${t}`);
}

const href = read("lib/support/support-reference-admin-href.ts");
if (!href.includes("resolveSupportReferenceAdminHref")) {
  fail("missing support-reference-admin-href resolver");
}
if (!href.includes("supportInboxHrefForReference")) {
  fail("missing Ads→Support inbox helper");
}

const supportPage = read("components/admin/support/AdminSupportPage.tsx");
if (!supportPage.includes("resolveSupportCaseContextLinks")) {
  fail("AdminSupportPage must render context deep-links");
}
if (!supportPage.includes("data-admin-support-context-links")) {
  fail("AdminSupportPage missing context links marker");
}

const detail = read("components/admin/stores/AdminDeliveryAdDetailWorkspace.tsx");
if (!detail.includes("data-admin-delivery-ads-support-link")) {
  fail("Delivery Ad detail must link related Support");
}
if (!detail.includes("data-admin-delivery-ads-support-ops-split")) {
  fail("Delivery Ad detail must keep Support vs Ops split");
}
if (!detail.includes("DeliveryAdOperationsPanel")) {
  fail("Ops thread panel must remain");
}

const partner = read("components/admin/stores/AdminDeliveryAdPartnerMembershipsView.tsx");
if (!partner.includes("data-partner-finance-link")) fail("Partner missing Finance link");
if (!partner.includes("data-partner-support-link")) fail("Partner missing Support link");
if (!partner.includes("data-partner-store-link")) fail("Partner missing Store link");
if (!partner.includes("data-partner-ads-link")) fail("Partner missing Ads link");

// No support-v2 / inbox-v2 shells
for (const shell of [
  "app/admin/support-v2/page.tsx",
  "app/admin/inbox-v2/page.tsx",
]) {
  if (existsSync(resolve(root, shell))) fail(`forbidden shell exists: ${shell}`);
}

// Legacy write stays blocked
const platformApi = read("app/api/admin/platform-inquiries/[id]/route.ts");
if (!platformApi.includes("410")) fail("platform-inquiries write must stay 410");

const platformPage = read("app/admin/platform-inquiries/page.tsx");
if (!/redirect\(|permanentRedirect\(/.test(platformPage)) {
  fail("platform-inquiries page must remain redirect-only");
}

// Support must not call delivery transition / cash approve from AdminSupportPage
if (supportPage.includes("admin_delivery_ad_transition")) {
  fail("Support page must not own Ads lifecycle mutation");
}
if (supportPage.includes("approve_business_cash_charge")) {
  fail("Support page must not own Cash approve mutation");
}

ok("CUT D Support + Partner context linkage hard lock");
process.exit(0);
