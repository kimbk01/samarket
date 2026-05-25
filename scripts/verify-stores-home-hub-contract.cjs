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

assertIncludes(

  headerChrome,

  "store_home_pull_hint",

  "stores header must show pull-to-refresh hint"

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

const categorySticky = read("components/stores/home/hub/StoresHomeCategoryStickyBelow.tsx");

const hub = read("components/stores/home/hub/StoresHomeHub.tsx");

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

assertNotIncludes(

  quickCategories,

  "subRevealProgress",

  "home categories must not use sticky sub reveal progress"

);

assertNotIncludes(

  categorySticky,

  "StoresHomeSubCategoryReveal",

  "sticky below must not render 2nd category reveal"

);

assertIncludes(

  categorySticky,

  "StoresHomePrimaryCategoriesSkeleton",

  "home category sticky must show layout skeleton before taxonomy ready"

);

assertIncludes(

  categorySticky,

  "StoresHomePrimaryCategoryPanel",

  "primary category panel must live in scroll body with sticky"

);

assertIncludes(

  categorySticky,

  "STORES_HOME_PRIMARY_CATEGORY_SECTION_SCROLL_BODY",

  "primary category must use scroll-body wrapper below sub panel"

);

assertIncludes(

  read("lib/stores/use-stores-home-pull-refresh.ts"),

  "DO NOT: 스크롤 본문",

  "pull refresh must document header-only expansion contract"

);

assertNotIncludes(

  read("lib/stores/use-stores-home-pull-refresh.ts"),

  "translate3d",

  "pull refresh must not translate scroll body"

);

assertNotIncludes(

  read("lib/stores/use-stores-home-pull-refresh.ts"),

  "window.addEventListener(\"touchmove\"",

  "pull refresh must bind touchmove to scroll root not window (iOS)"

);

assertIncludes(

  read("lib/stores/use-stores-home-pull-refresh.ts"),

  "data-main-hub-scroll-body",

  "pull refresh must document scroll root target for iOS"

);

assertIncludes(

  quickCategories,

  "useStoresHomeTouchRelease",

  "home categories must release stuck iOS touch focus after tap"

);

assertNotIncludes(

  categorySticky,

  "HorizontalDragScroll",

  "primary category must not use drag scroll that captures pointer after tab select"

);

assertIncludes(

  quickCategories,

  "STORES_HOME_PRIMARY_CATEGORY_STICKY_BELOW",

  "home categories must register primary stickyBelow when sub panel hides"

);

assertIncludes(

  read("components/stores/home/hub/StoresHomeCategoryStickyBelow.tsx"),

  "StoresHomePrimaryCategoryHeaderSticky",

  "primary header sticky must render when sub category hidden"

);

assertIncludes(

  read("components/stores/home/hub/StoresHomeCategoryStickyBelow.tsx"),

  "subCategoryInView",

  "scroll-body primary must hide when sub category not in view"

);

assertIncludes(

  hub,

  "StoresHomeSubCategoryPanel",

  "hub must mount 2nd category in scroll body"

);

assertIncludes(

  hub,

  "StoresHomePrimaryCategoryPanel",

  "hub must mount 1st category sticky panel after 2nd category"

);

const hubCategoryMount = hub.slice(hub.indexOf("StoresHomeSubCategoryPanel"), hub.indexOf("StoresHomePrimaryCategoryPanel"));

assertIncludes(

  hubCategoryMount,

  "StoresHomeSubCategoryPanel",

  "hub category order must be 2nd before 1st"

);

assertIncludes(

  quickCategories,

  "useStoresHomePullRefresh",

  "home categories must enable pull-to-refresh"

);

assertIncludes(

  quickCategories,

  "subCategoryInView",

  "home categories must branch primary tap on sub panel visibility"

);

assertIncludes(

  read("components/stores/home/hub/StoresHomeSubCategoryPanel.tsx"),

  "stores-home-sub-slide-in",

  "sub category panel must slide in on primary change"

);

assertIncludes(

  read("lib/stores/stores-home-ui.ts"),

  "STORES_HOME_SUB_CATEGORY_RAIL",

  "sub category must use single-row horizontal swipe rail"

);

assertIncludes(

  read("components/stores/home/hub/StoresHomeSubCategoryPanel.tsx"),

  "STORES_HOME_SUB_CATEGORY_RAIL",

  "sub category panel must use horizontal swipe rail constant"

);

assertIncludes(

  read("lib/stores/stores-home-category-chrome-store.ts"),

  "subCategoryInView",

  "category chrome store must track sub panel visibility"

);

assertIncludes(

  read("lib/stores/stores-home-sub-category-slide.ts"),

  "360",

  "sub category slide must use 360ms timing"

);

assertIncludes(

  read("app/delivery-tokens.css"),

  "--delivery-home-category-icon-compact",

  "delivery tokens must define compact primary category icon"

);

assertIncludes(

  read("lib/stores/stores-home-category-chrome-store.ts"),

  "snapshotsEqual",

  "category chrome store must dedupe patch notify"

);

assertIncludes(

  quickCategories,

  "readStoresHomeTaxonomyFromClientCache",

  "home categories must hydrate taxonomy from TTL cache"

);



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


