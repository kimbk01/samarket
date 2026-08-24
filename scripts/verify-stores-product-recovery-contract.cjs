/**
 * Static contract — Product Recovery HOME + CATEGORY CMS wiring.
 * No Production runtime. Run: node scripts/verify-stores-product-recovery-contract.cjs
 */
const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");

function read(rel) {
  return fs.readFileSync(path.join(root, rel), "utf8");
}

function fail(msg) {
  console.error(`verify-stores-product-recovery-contract: ${msg}`);
  process.exitCode = 1;
}

function assertIncludes(src, needle, ctx) {
  if (!src.includes(needle)) fail(`${ctx}: missing ${JSON.stringify(needle)}`);
}

function assertNotIncludes(src, needle, ctx) {
  if (src.includes(needle)) fail(`${ctx}: forbidden ${JSON.stringify(needle)}`);
}

const slotSection = read("components/stores/home/hub/StoresHomeCompositionSlotSection.tsx");
const primary = read("components/stores/home/hub/StoresHomePrimaryStoreRowListSection.tsx");
const hub = read("components/stores/home/hub/StoresHomeHub.tsx");
const catalog = read("lib/stores/product/stores-home-shelf-product-catalog.ts");
const adminHome = read("components/admin/stores/AdminStoresHomeShelvesPage.tsx");
const adminCat = read("components/admin/stores/AdminStoresCategoryPolicyPage.tsx");
const menu = read("components/admin/admin-menu.ts");
const migration = read("supabase/migrations/20260824180000_stores_product_recovery_cms_extended.sql");

assertIncludes(migration, "product_config jsonb", "migration 241800 kept");
assertIncludes(menu, "stores-home-shelves", "admin menu HOME");
assertIncludes(menu, "stores-category-policy", "admin menu CATEGORY");

assertNotIncludes(hub, "StoresHomeInsertionRails", "HOME must not render text insertion rails");
assertIncludes(hub, "homeInsertions", "HOME passes insertion meta into shelf cards");
assertIncludes(slotSection, "showAllHref", "shelf CMS showAll");
assertIncludes(slotSection, "StoresHomeStoreHorizontalCard", "STORE presentation");
assertIncludes(slotSection, "StoresHomeBrandCircularCard", "BRAND presentation");
assertIncludes(slotSection, "resolveHomeShelfCardBenefit", "HOME card benefit binding");
assertIncludes(primary, "title:", "slot1 CMS title");
assertIncludes(primary, "imageSource", "slot1 imageSource authority");
assertNotIncludes(primary, 't("store_feed_stores_title")', "slot1 no hardcoded title");

assertIncludes(catalog, 'entityType: "product"', "PRODUCT entity");
assertIncludes(catalog, 'entityType: "brand"', "BRAND entity");

assertIncludes(adminHome, "AdminStoresHomeShelfLivePreview", "HOME CMS preview");
assertIncludes(adminHome, "selectedId", "HOME master-detail selection");
assertNotIncludes(adminHome, "<table", "HOME must not be policy table");
assertNotIncludes(adminHome, "slot0Food", "Admin must not expose slot ids");

assertIncludes(adminCat, "AdminStoresCategoryBrowseLivePreview", "CATEGORY CMS preview");
assertIncludes(adminCat, "deleteScopeKeys", "CATEGORY inherit deletes stub rows");
assertIncludes(adminCat, 'mode: "inherit"', "operator inherit mode");
assertIncludes(adminCat, 'mode: "override"', "operator override mode");
assertNotIncludes(adminCat, "<table", "CATEGORY must not be policy table");
assertNotIncludes(adminCat, "cardType:", "CATEGORY must not invent cardType anatomy branch");

if (fs.existsSync(path.join(root, "components/stores/home/hub/StoresHomeInsertionRails.tsx"))) {
  fail("StoresHomeInsertionRails must be deleted");
}
if (fs.existsSync(path.join(root, "components/stores/browse/StoreBrowseInsertionRowCards.tsx"))) {
  fail("StoreBrowseInsertionRowCards must be deleted");
}
if (fs.existsSync(path.join(root, "components/admin/stores/AdminStoresCompositionPolicyPage.tsx"))) {
  fail("AdminStoresCompositionPolicyPage must be deleted");
}

const compositionPut = read("app/api/admin/stores-composition-policy/route.ts");
assertIncludes(compositionPut, "use_stores_home_shelves", "HOME write must reject duplicate API");

if (!process.exitCode) {
  console.log("verify-stores-product-recovery-contract: PASS");
}
