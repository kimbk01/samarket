/**
 * `/stores` 홈 허브 — 주소 헤더·taxonomy FOUC·피드 스켈레톤 분리 계약.
 */
const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");

function read(rel) {
  return fs.readFileSync(path.join(root, rel), "utf8");
}

function fail(message) {
  console.error(`verify-stores-home-hub-contract: ${message}`);
  process.exitCode = 1;
}

function assertIncludes(source, needle, context) {
  if (!source.includes(needle)) fail(`${context}: missing "${needle}"`);
}

function assertNotIncludes(source, needle, context) {
  if (source.includes(needle)) fail(`${context}: forbidden "${needle}"`);
}

const headerChrome = read("components/stores/home/hub/StoresHomeHeaderChrome.tsx");
assertIncludes(
  headerChrome,
  "resolveDeliveryHomeHeaderButtonLabel",
  "stores header must use shared header label resolver"
);
assertNotIncludes(
  headerChrome,
  't("store_address_manage_link")',
  "stores header button must not use address-manage link copy"
);

const headerLabel = read("lib/addresses/delivery-home-header-label.ts");
assertNotIncludes(
  headerLabel,
  't("store_address_manage_link")',
  "header label resolver must not call address-manage i18n key"
);

const quickCategories = read("components/stores/home/hub/StoresHomeQuickCategories.tsx");
assertNotIncludes(
  quickCategories,
  'from "@/lib/stores/browse-mock',
  "home categories must not import browse mock dataset"
);
assertNotIncludes(
  quickCategories,
  "listBrowsePrimaryIndustries(",
  "home categories must not call browse mock primary list"
);
assertNotIncludes(
  quickCategories,
  "listBrowseSubIndustries(",
  "home categories must not call browse mock sub list"
);
assertIncludes(
  quickCategories,
  "StoresHomeCategoriesSkeleton",
  "home categories must show layout skeleton before taxonomy ready"
);
assertIncludes(
  quickCategories,
  "readStoresHomeTaxonomyFromClientCache",
  "home categories must hydrate taxonomy from TTL cache"
);

const hub = read("components/stores/home/hub/StoresHomeHub.tsx");
assertIncludes(hub, "<StoresHomeQuickCategories />", "hub must always mount categories");
const hubLoadingBlock = hub.slice(hub.indexOf("loading ?"), hub.indexOf("loading ?") + 400);
assertNotIncludes(
  hubLoadingBlock,
  "StoresHomeQuickCategories",
  "feed loading skeleton must not replace categories"
);

const feedSkeleton = read("components/stores/home/hub/StoresHomeSkeleton.tsx");
assertNotIncludes(
  feedSkeleton,
  "delivery-home-category-icon",
  "feed skeleton must not include legacy category rail"
);

const addressSheet = read("components/stores/home/hub/StoresHomeAddressSheet.tsx");
assertIncludes(addressSheet, "AddressListRowBody", "address sheet must share mypage row body");
assertNotIncludes(
  addressSheet,
  "rounded-full bg-[color:var(--delivery-primary)]",
  "address sheet must not use pill current badge"
);

const deliveryAddr = read("lib/addresses/delivery-home-header-address.ts");
assertIncludes(
  deliveryAddr,
  "resolveDeliveryHomeHeaderDisplayLine",
  "delivery header must export display line resolver"
);
assertIncludes(deliveryAddr, "DO NOT", "delivery header module must document Google-only guard");

if (process.exitCode !== 1) {
  console.log("verify-stores-home-hub-contract: ok");
}
