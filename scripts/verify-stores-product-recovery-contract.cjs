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
const resolve = read("lib/stores/product/stores-home-shelf-product-resolve.ts");
const adminHome = read("components/admin/stores/AdminStoresHomeShelvesPage.tsx");
const adminCat = read("components/admin/stores/AdminStoresCategoryPolicyPage.tsx");
const menu = read("components/admin/admin-menu.ts");
const fixture = read("lib/stores/product/stores-product-recovery-qa-fixture.ts");
const migration = read("supabase/migrations/20260824180000_stores_product_recovery_cms_extended.sql");

assertIncludes(migration, "product_config jsonb", "migration 241800");
assertIncludes(fixture, "STORES_PRODUCT_RECOVERY_QA", "qa fixture contract");

assertIncludes(menu, "stores-home-shelves", "admin menu HOME");
assertIncludes(menu, "stores-category-policy", "admin menu CATEGORY");
assertIncludes(menu, "admin_menu_stores_home_management", "HOME 관리 i18n key");
assertIncludes(menu, "admin_menu_stores_category_management", "카테고리 관리 i18n key");

assertNotIncludes(hub, "StoresHomeInsertionRails", "HOME must not render text insertion rails");
assertIncludes(hub, "homeInsertions", "HOME must pass insertion meta into shelf cards");

assertIncludes(slotSection, "showAllHref", "shelf CMS showAll");
assertIncludes(slotSection, "productConfig.imageSource", "shelf CMS imageSource");
assertIncludes(slotSection, "shelf.max", "shelf CMS max applied");
assertIncludes(slotSection, "data-stores-home-entity-type", "entity type DOM marker");
assertIncludes(slotSection, "StoresHomeStoreHorizontalCard", "STORE presentation renderer");
assertIncludes(slotSection, "StoresHomeBrandCircularCard", "BRAND presentation renderer");
assertIncludes(slotSection, "StoresHomeStoreTeaserCard", "store teaser renderer");

assertIncludes(primary, "title:", "slot1 CMS title prop");
assertIncludes(primary, "actionHref", "slot1 CMS showAll");
assertIncludes(primary, "presentation", "slot1 CMS presentation");
assertNotIncludes(primary, 't("store_feed_stores_title")', "slot1 must not hardcode legacy title");
assertNotIncludes(primary, "STORES_HOME_SECTION_BROWSE.orderNow()", "slot1 must not hardcode browse href");

assertIncludes(catalog, 'entityType: "product"', "PRODUCT entity default");
assertIncludes(catalog, 'entityType: "store"', "STORE entity default");
assertIncludes(catalog, 'entityType: "brand"', "BRAND entity default");
assertIncludes(catalog, 'defaultPresentation: "store_horizontal"', "popular/high_rating store presentation");
assertIncludes(catalog, 'shelfId: "praise_reviews"', "UNAVAILABLE shelf present");

assertIncludes(resolve, "productConfig", "resolve merges productConfig");
assertIncludes(resolve, "mergeHomeShelfProductConfig", "productConfig merge");

assertIncludes(adminHome, "productConfig", "Admin HOME productConfig");
assertIncludes(adminHome, "admin_stores_home_shelves_entity_", "operator entity labels");
assertIncludes(adminHome, "admin_stores_home_shelves_pres_", "operator presentation labels");
assertNotIncludes(adminHome, "slot0Food", "Admin must not expose slot ids");

assertIncludes(adminCat, "admin_stores_category_inherit", "inherit operator language");
assertIncludes(adminCat, "admin_stores_category_override_on", "override operator language");
assertIncludes(adminCat, "admin_stores_category_scope_inherited", "inherited scope label");
assertIncludes(adminCat, "admin_stores_category_scope_overridden", "overridden scope label");

if (!process.exitCode) {
  console.log("verify-stores-product-recovery-contract: PASS");
}
