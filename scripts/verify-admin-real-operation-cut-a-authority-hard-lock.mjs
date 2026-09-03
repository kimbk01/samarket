#!/usr/bin/env node
/**
 * DIBAY Admin Real Operation CUT A — authority / legacy / NO_NEW_WRITE gate.
 * @see docs/dibay-admin-real-operation-cut-a-authority-hard-lock.md
 * @see lib/admin/admin-real-operation-cut-a-authority-hard-lock.ts
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

const anchorPath = "lib/admin/admin-real-operation-cut-a-authority-hard-lock.ts";
const docPath = "docs/dibay-admin-real-operation-cut-a-authority-hard-lock.md";

if (!existsSync(resolve(root, anchorPath))) fail(`missing ${anchorPath}`);
if (!existsSync(resolve(root, docPath))) fail(`missing ${docPath}`);

const anchor = read(anchorPath);
const doc = read(docPath);

const requiredAnchorSnippets = [
  "ADMIN_REAL_OPERATION_CUT_A_LOCKED = true",
  "DELIVERY_AD_APPLICATION_ID_EQUALS_EXECUTION_ID = true",
  'duplicateMenuTreeAllowed: false',
  'sharedWithDelivery: false',
  'absorbIntoDeliveryTables: false',
  'adsMayWriteComposition: false',
  'targetRelation: "CROSS_LINK_ONLY"',
  'type: "MEMBERSHIP_NOT_AD_PRODUCT"',
  "mergeIntoSupportCases: false",
  "NO_NEW_WRITE_API_FILES",
  "REDIRECT_ONLY_ADMIN_PAGES",
  "SCENARIO_A_R_ENTRY_LOCK",
  "FORBIDDEN_NEW_ADMIN_SHELL_ROUTES",
];

for (const s of requiredAnchorSnippets) {
  if (!anchor.includes(s)) fail(`anchor missing: ${s}`);
}

if (!doc.includes("CROSS_LINK_ONLY")) fail("doc must lock HOME/CATEGORY as CROSS_LINK_ONLY");
if (!doc.includes("DOC_STALE_FOR_IMPLEMENTATION_STATUS")) {
  fail("doc must record popup DOC vs CODE verdict");
}
if (!doc.includes("MUST REMAIN SEPARATE")) fail("doc must keep placement systems separate");

// Menu SSOT still single tree
const menu = read("components/admin/admin-menu.ts");
if (!menu.includes("플랫폼 Admin 메뉴 SSOT") && !menu.includes("adminMenu")) {
  fail("admin-menu.ts must remain menu SSOT");
}
const compat = read("lib/admin-menu-config.ts");
if (!compat.includes("Compatibility adapter") && !compat.includes("DO NOT invent a second menu tree")) {
  fail("admin-menu-config must remain compatibility adapter only");
}

// Redirect-only pages stay redirects
const redirectPages = [
  ["app/admin/store-insertions/page.tsx", "redirect"],
  ["app/admin/store-banner-ads/page.tsx", "redirect"],
  ["app/admin/platform-inquiries/page.tsx", "support/archive"],
  ["app/admin/operations/page.tsx", "permanentRedirect"],
];
for (const [rel, needle] of redirectPages) {
  const body = read(rel);
  if (!body.includes(needle) && !body.includes("redirect(") && !body.includes("permanentRedirect(")) {
    fail(`${rel} must remain redirect-only`);
  }
  if (body.includes("export default function") && body.length > 2500 && !body.includes("redirect")) {
    // soft size check — real pages shouldn't replace redirect stubs
  }
  if (!/redirect\(|permanentRedirect\(/.test(body)) {
    fail(`${rel} lost redirect()`);
  }
}

// NO_NEW_WRITE API files must keep 410 + legacy_writer_disabled (or explicit 410 on POST)
const noWriteApis = [
  "app/api/admin/store-paid-ads/route.ts",
  "app/api/admin/store-banner-ads/route.ts",
  "app/api/admin/platform-inquiries/[id]/route.ts",
  "app/api/admin/store-points/[storeId]/adjust/route.ts",
  "app/api/admin/store-point-charges/[id]/route.ts",
  "app/api/admin/delivery-ads/business-cash/route.ts",
];
for (const rel of noWriteApis) {
  const body = read(rel);
  if (!body.includes("410")) fail(`${rel} must retain HTTP 410 on legacy write`);
  if (
    rel.includes("store-paid-ads") ||
    rel.includes("store-banner-ads") ||
    rel.includes("platform-inquiries")
  ) {
    if (!body.includes("legacy_writer_disabled") && !body.includes("status: 410")) {
      fail(`${rel} must keep legacy_writer_disabled / 410`);
    }
  }
}

// Canonical Delivery product / placement / CTA owners still present
const mustExist = [
  "lib/stores/advertising/delivery-ad-product-registry.ts",
  "lib/stores/advertising/delivery-ad-inventory.ts",
  "lib/stores/advertising/delivery-ad-lifecycle.ts",
  "lib/stores/advertising/delivery-ad-creative.ts",
  "lib/stores/advertising/delivery-ad-admin-required-decision.ts",
  "lib/stores/advertising/delivery-ad-admin-action-queue-presentation.ts",
  "lib/stores/advertising/canonical-business-cash-contract.ts",
  "lib/points/user-point-ledger.ts",
  "lib/support/support-category-registry.ts",
  "lib/support/support-reference-authority.ts",
  "lib/ads/feed-ad-placement.ts",
  "lib/platform-popup/campaign-lifecycle.ts",
  "lib/stores/composition/stores-composition-contract.ts",
];
for (const rel of mustExist) {
  if (!existsSync(resolve(root, rel))) fail(`canonical owner missing: ${rel}`);
}

const product = read("lib/stores/advertising/delivery-ad-product-registry.ts");
if (!product.includes('"store_sponsored"') || !product.includes('"banner"')) {
  fail("Delivery product keys must remain store_sponsored + banner");
}
if (product.includes("partner") && product.includes("DELIVERY_AD_PRODUCT_KEYS") && /partner/.test(product.split("DELIVERY_AD_PRODUCT_KEYS")[1]?.slice(0, 120) ?? "")) {
  // partner must not appear inside PRODUCT_KEYS array — check keys const
}
if (/DELIVERY_AD_PRODUCT_KEYS\s*=\s*\[[^\]]*partner/i.test(product)) {
  fail("Partner must not be a DeliveryAdProductKey");
}

const partnerFlag = read("lib/stores/advertising/delivery-ad-admin-r3-presentation.ts");
if (!partnerFlag.includes("R3_ADMIN_PARTNER_NOT_PRODUCT = true")) {
  fail("Partner must remain NOT AdProduct (R3_ADMIN_PARTNER_NOT_PRODUCT)");
}

const feed = read("lib/ads/feed-ad-placement.ts");
if (!feed.includes("TRADE") && !feed.includes("COMMUNITY") && !feed.includes("FeedAdPlacement")) {
  fail("Feed placement authority file looks empty/wrong");
}

const supportRef = read("lib/support/support-reference-authority.ts");
if (!supportRef.includes("AD_CAMPAIGN") || !supportRef.includes("DELIVERY_AD_CAMPAIGN")) {
  fail("Support must retain Delivery ad campaign reference types");
}
if (supportRef.includes("FEED_AD") && supportRef.includes("SUPPORT_REFERENCE_TYPES")) {
  // only fail if FEED_AD was added to the const array without lock update — allow absence
}
if (/SUPPORT_REFERENCE_TYPES\s*=\s*\[[^\]]*FEED_AD/.test(supportRef)) {
  fail("FEED_AD support ref added — update CUT A lock + CUT D plan before enabling");
}

// Forbidden shell pages must not appear as real product pages (operations is redirect-only OK)
for (const shell of ["app/admin/growth/page.tsx", "app/admin/ads-center/page.tsx", "app/admin/ads-v2/page.tsx"]) {
  if (existsSync(resolve(root, shell))) {
    fail(`forbidden parallel console page exists: ${shell}`);
  }
}

ok("CUT A authority / legacy / NO_NEW_WRITE hard lock");
process.exit(0);
