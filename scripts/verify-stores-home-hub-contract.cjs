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



const searchModal = read("components/stores/home/hub/StoresHomeSearchModal.tsx");

const philifeInbox = read("components/philife/PhilifeHeaderNotificationInbox.tsx");

const tier1OverlayBackdrop = read("lib/ui/tier1-header-overlay-backdrop.ts");

assertIncludes(

  tier1OverlayBackdrop,

  "sam-tier1-header-overlay-backdrop",

  "tier1 header overlay backdrop must define single CSS class"

);

assertIncludes(

  searchModal,

  "TIER1_HEADER_OVERLAY_BACKDROP_CLASS",

  "stores search popup must use unified tier1 overlay backdrop"

);

assertIncludes(

  philifeInbox,

  "TIER1_HEADER_OVERLAY_BACKDROP_CLASS",

  "tier1 notification inbox must use unified tier1 overlay backdrop"

);

assertNotIncludes(

  searchModal,

  "stores-home-search-popup__backdrop",

  "stores search must not use legacy per-feature backdrop class"

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

  read("lib/stores/use-stores-home-pull-refresh.ts"),

  "computeStoresHomePullPxFromTouchDy",

  "pull refresh must use shared rubber-band pull curve"

);

assertIncludes(

  read("lib/stores/stores-home-pull-refresh-store.ts"),

  "STORES_HOME_PULL_REFRESH_THRESHOLD_PX = 58",

  "pull refresh threshold must stay at +20% over legacy 48px"

);

assertIncludes(

  read("components/stores/home/hub/StoresHomeHub.tsx"),

  "force: true",

  "pull refresh must force network home-feed reload"

);

assertIncludes(

  read("lib/stores/stores-home-pull-refresh-store.ts"),

  "addStoresHomePullRefreshHandler",

  "pull refresh must support multiple domain handlers"

);

assertIncludes(

  read("components/stores/home/hub/StoresHomeHeaderChrome.tsx"),

  "StoresHomePtrSpinner",

  "pull refresh must show buffering spinner while refreshing"

);

assertIncludes(

  read("lib/stores/stores-home-pull-refresh-store.ts"),

  "resolveStoresHomePullRefreshSlotPx",

  "pull refresh must settle release height before spinner"

);

assertIncludes(

  quickCategories,

  "addStoresHomePullRefreshHandler",

  "pull refresh must reload taxonomy on release"

);

const deliveryLayoutShell = read("components/delivery/navigation/StoresDeliveryLayoutShell.tsx");

assertIncludes(

  deliveryLayoutShell,

  "useStoresHomeTouchRelease",

  "delivery list layout must release stuck iOS touch focus after tap"

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

const categorySeedClient = read("components/stores/home/hub/StoresHomeCategorySeedPanel.client.tsx");

assertIncludes(

  hub,

  "StoresHomeCategorySeedPanelClient",

  "hub must mount client category hydration bridge"

);

assertIncludes(

  categorySeedClient,

  "StoresHomeSubCategoryPanel",

  "category client bridge must mount 2nd category panel"

);

assertIncludes(

  categorySeedClient,

  "StoresHomePrimaryCategoryPanel",

  "category client bridge must mount 1st category panel after 2nd"

);

const categoryBridgeBody = categorySeedClient.slice(categorySeedClient.indexOf("return ("));

assertIncludes(

  categoryBridgeBody,

  "<StoresHomeSubCategoryPanel />",

  "category bridge render order must mount 2nd category first"

);

assertIncludes(

  categoryBridgeBody,

  "<StoresHomePrimaryCategoryPanel />",

  "category bridge render order must mount 1st category after 2nd"

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

const categoryChrome = read("lib/stores/stores-home-category-chrome-store.ts");

assertIncludes(

  categoryChrome,

  "STORES_HOME_CATEGORY_CHROME_EMPTY_SNAPSHOT",

  "category chrome server snapshot must start empty (no seed paint)"

);

assertNotIncludes(

  categoryChrome,

  "getStoresHomeTaxonomySeedState",

  "category chrome must not import taxonomy seed"

);

assertIncludes(

  quickCategories,

  "readStoresHomeTaxonomyFromClientCache",

  "home categories must hydrate taxonomy from TTL cache"

);

assertNotIncludes(

  quickCategories,

  "getStoresHomeTaxonomySeedState",

  "home categories must not paint static taxonomy seed"

);

assertIncludes(

  quickCategories,

  "resolveStoresHomeTaxonomyFromApi",

  "home categories must load taxonomy from admin API"

);

assertIncludes(

  read("lib/stores/stores-home-taxonomy-client.ts"),

  "STORES_HOME_TAXONOMY_EMPTY",

  "home taxonomy client must default to empty not seed"

);



assertIncludes(hub, "<StoresHomeQuickCategories />", "hub must always mount categories");

function readStoresHubPage() {
  const candidates = ["app/(stores)/stores/page.tsx", "app/(main)/stores/page.tsx"];
  for (const rel of candidates) {
    const abs = path.join(root, rel);
    if (fs.existsSync(abs)) return fs.readFileSync(abs, "utf8");
  }
  fail("stores hub page missing — expected app/(stores)/stores/page.tsx");
  return "";
}
const storesPage = readStoresHubPage();
assertIncludes(
  storesPage,
  'data-stores-layout-profile="stores-hub"',
  "stores hub page must use (stores) route group marker"
);

assertNotIncludes(
  storesPage,
  "export default async function StoresPage",
  "stores page must be sync"
);

assertIncludes(
  storesPage,
  "<StoresHub />",
  "stores page must render single client hub"
);

assertNotIncludes(
  storesPage,
  "StoresHomeInitialShellServer",
  "stores page must not SSR legacy initial shell (old 1·2차 category rails)"
);

assertNotIncludes(
  storesPage,
  "StoresHomeInitialShellClient",
  "stores page must not use dual SSR/client shell bridge"
);

assertNotIncludes(
  storesPage,
  "StoresHomeCategorySeedPanelServer",
  "stores page must not SSR category seed panel"
);

assertIncludes(
  hub,
  "StoresHomeCategorySeedPanelClient",
  "hub must mount interactive category panels"
);

assertNotIncludes(
  categorySeedClient,
  "getElementById",
  "category client must not remove SSR seed DOM (no SSR seed)"
);

assertNotIncludes(
  hub,
  "categorySlot",
  "hub must not accept SSR category slot after initial shell extraction"
);

const hubLoadingBlock = hub.slice(
  hub.indexOf("showBlockingFeedSkeleton"),
  hub.indexOf("showBlockingFeedSkeleton") + 400
);

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

const feedDisplayContract = read("lib/stores/stores-home-feed-display-contract.ts");
assertIncludes(
  feedDisplayContract,
  "pickStoresHomePrimaryRowList",
  "feed display contract must define primary row list picker"
);
assertIncludes(
  feedDisplayContract,
  "detectStoresHomeEmptyRowListRegression",
  "feed display contract must expose empty-row regression detector"
);
assertIncludes(
  feedDisplayContract,
  'DO NOT: `open` exclude',
  "feed display contract must document open exclude + primary row pairing"
);

assertIncludes(
  hub,
  "StoresHomePrimaryStoreRowListSection",
  "hub must mount primary store row list section"
);
const hubFeedBlock = hub.slice(
  hub.indexOf("StoresHomeHeroBanner"),
  hub.indexOf("StoresHomeDeferredViewport")
);
assertIncludes(
  hubFeedBlock,
  "StoresHomePrimaryStoreRowListSection",
  "primary store row list must render before deferred viewport (not scroll-gated)"
);
assertNotIncludes(
  hubFeedBlock,
  "StoresHomeDeferredViewport",
  "primary row block slice must not include deferred viewport"
);

const belowFold = read("components/stores/home/hub/StoresHomeHubBelowFold.tsx");
assertIncludes(
  belowFold,
  "STORES_HOME_BELOW_FOLD_FEED_EXCLUDE_KEYS",
  "below-fold must use shared exclude keys constant"
);
assertIncludes(
  belowFold,
  "primaryRowStoreCount",
  "below-fold feed list must pass primary row count for emptyFallback guard"
);

const loadPolicy = read("lib/stores/stores-home-feed-load-policy.ts");
assertIncludes(
  loadPolicy,
  "applyStoresHomeFeedNetworkResult",
  "home feed load policy must preserve stores on network failure"
);
assertIncludes(
  loadPolicy,
  "DO NOT: catch",
  "load policy must document no clear-on-error"
);

const rowCard = read("components/stores/home/StoreDeliveryRowCard.tsx");
assertNotIncludes(
  rowCard,
  "kind: \"profile\"",
  "store row card must not use profile image as menu tile fallback"
);
assertIncludes(
  read("app/api/stores/home-feed/route.ts"),
  "thumbnail_url",
  "home-feed must include menu thumbnail in existing product query"
);

const foodCard = read("components/stores/home/hub/StoresHomeFoodCard.tsx");

assertNotIncludes(
  read("components/stores/home/hub/StoresHomeSubCategoryPanel.tsx"),
  "STORES_HOME_RESTAURANT_SUB_ICONS",
  "sub category panel must not use legacy food fallback PNGs"
);

assertNotIncludes(
  read("components/stores/home/hub/StoresHomeCategoryStickyBelow.tsx"),
  "STORES_HOME_PRIMARY_CATEGORY_ICONS",
  "primary category panel must not use legacy category fallback PNGs"
);
assertIncludes(
  foodCard,
  "entry.imageUrl",
  "food rail must prefer home-feed thumbnail before hydration batch"
);
assertNotIncludes(
  foodCard,
  "useStoresHomeOverlayDeferUntilInput",
  "food rail must not defer thumbnails until user input"
);

const feedSections = read("lib/stores/stores-home-feed-sections.ts");
assertIncludes(
  feedSections,
  "imageUrl: item.imageUrl",
  "food entries must carry home-feed menu thumbnail"
);

assertIncludes(
  hub,
  "for (const entry of fastFood)",
  "hub must eager-hydrate food rail store ids"
);

function assertFileAbsent(rel, context) {
  if (fs.existsSync(path.join(root, rel))) fail(`${context}: file still exists "${rel}"`);
}

[
  "components/stores/home/hub/StoresHomeInitialShell.server.tsx",
  "components/stores/home/hub/StoresHomeInitialShell.client.tsx",
  "components/stores/home/hub/StoresHomeCategorySeedPanel.server.tsx",
  "components/stores/home/hub/stores-home-primary-category-rail-view.tsx",
  "components/stores/home/hub/stores-home-sub-category-rail-view.tsx",
  "components/stores/home/hub/stores-home-hero-banner-view.tsx",
  "components/stores/home/hub/stores-home-feed-skeleton-view.tsx",
  "lib/stores/stores-home-category-seed-panel-model.ts",
].forEach((rel) => assertFileAbsent(rel, "legacy stores home shell"));

assertNotIncludes(hub, "typeof window", "hub feed state must not use typeof window (hydration)");

assertIncludes(
  read("lib/stores/stores-home-taxonomy-display-contract.ts"),
  "GET `/api/stores/taxonomy`",
  "taxonomy display contract must document admin API authority"
);

assertIncludes(
  quickCategories,
  "fetchStoresTaxonomyDeduped",
  "home categories must fetch admin taxonomy API"
);

const storesHub = read("components/stores/StoresHub.tsx");
assertIncludes(
  storesHub,
  "prewarmStoresHomeRoute",
  "stores hub must prewarm taxonomy+feed on direct /stores entry"
);
assertIncludes(
  storesHub,
  "useLayoutEffect",
  "stores hub route prewarm must run in layout effect before paint"
);
assertIncludes(
  read("lib/stores/stores-home-route-prewarm.ts"),
  "prewarmStoreHomeFeedClientCache",
  "route prewarm must include home-feed client cache"
);

const taxonomyFetchIdx = quickCategories.indexOf("await fetchStoresTaxonomyDeduped");
const beforeTaxonomyFetch = quickCategories.slice(Math.max(0, taxonomyFetchIdx - 220), taxonomyFetchIdx);
assertIncludes(
  beforeTaxonomyFetch,
  "useLayoutEffect",
  "taxonomy network must start in layout effect (not delayed useEffect)"
);

assertIncludes(
  loadPolicy,
  "readStoresHomeFeedLiveStore",
  "load policy must read session live store before TTL cache"
);

const browsePrimaryTabs = read("components/stores/browse/StoresBrowseHeaderPrimaryTabs.tsx");
assertIncludes(
  browsePrimaryTabs,
  "delivery-category-chip",
  "browse primary tabs must use delivery-category-chip pills"
);
assertIncludes(
  browsePrimaryTabs,
  "storeCategoryPillClass",
  "browse primary tabs must use shared pill class helper"
);

const browseScrollCollapse = read("components/stores/browse/StoresBrowseHeaderScrollCollapse.tsx");
assertIncludes(
  browseScrollCollapse,
  "useStoresBrowseHeaderScrollHide",
  "browse subtopic collapse must wire scroll-hide hook"
);

const deliveryComponents = read("app/delivery-components.css");
assertIncludes(
  deliveryComponents,
  "data-stores-browse-subtopic-collapse",
  "delivery CSS must define browse subtopic collapse"
);
assertIncludes(
  deliveryComponents,
  '[data-stores-browse-subtopic-collapse][data-collapsed="true"]',
  "delivery CSS must collapse browse subtopic row on scroll"
);

if (process.exitCode !== 1) {

  console.log("verify-stores-home-hub-contract: ok");

}


