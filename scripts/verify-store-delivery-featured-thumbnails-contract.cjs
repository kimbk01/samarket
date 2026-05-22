/**
 * 배달 목록 행 메뉴 썸네일 계약 — browse 2e668b9 패턴(인라인 featuredItems) 유지.
 */
const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");

function read(rel) {
  const filePath = path.join(root, rel);
  const buf = fs.readFileSync(filePath);
  if (buf.length >= 2 && buf[0] === 0xff && buf[1] === 0xfe) {
    fail(`${rel}: UTF-16 LE BOM — re-run scripts/_patch-store-product-public-final.cjs`);
  }
  if (buf.length >= 2 && buf[0] === 0xfe && buf[1] === 0xff) {
    fail(`${rel}: UTF-16 BE BOM — re-run scripts/_patch-store-product-public-final.cjs`);
  }
  const sample = buf.subarray(0, Math.min(buf.length, 4000));
  let zeroPairs = 0;
  for (let i = 1; i < sample.length; i += 2) {
    if (sample[i] === 0) zeroPairs++;
  }
  if (zeroPairs > 40) {
    fail(`${rel}: looks like UTF-16 — save as UTF-8`);
  }
  return buf.toString("utf8");
}

function fail(message) {
  console.error(`verify-store-delivery-featured-thumbnails-contract: ${message}`);
  process.exitCode = 1;
}

function assertIncludes(source, needle, context) {
  if (!source.includes(needle)) fail(`${context}: missing "${needle}"`);
}

function assertNotIncludes(source, needle, context) {
  if (source.includes(needle)) fail(`${context}: forbidden "${needle}"`);
}

const browseRoute = read("app/api/stores/browse/route.ts");
assertIncludes(browseRoute, "featuredByStore", "browse route must inline featured menu preview");
assertIncludes(browseRoute, "thumbnail_url", "browse route must select product thumbnails");
assertIncludes(
  browseRoute,
  "resolveBrowseFeaturedMenuImageUrl",
  "browse route must normalize featured thumbnail URLs"
);
assertNotIncludes(
  browseRoute,
  "featuredItems: []",
  "browse cold payload must include featuredItems from DB (not deferred-only empty)"
);

const browseView = read("components/stores/browse/StoresBrowsePrimaryView.tsx");
assertIncludes(browseView, "browseItemToRowCard(s)", "browse list must map row cards from API payload");
assertNotIncludes(
  browseView,
  "useBrowseFeaturedItemsHydration",
  "browse list must not depend on deferred hydration hook (2e668b9 contract)"
);

const rowCard = read("components/stores/home/StoreDeliveryRowCard.tsx");
assertIncludes(
  rowCard,
  'typeof x.imageUrl === "string" && x.imageUrl.trim().length > 0',
  "row card must only render menu tiles with imageUrl"
);
assertIncludes(rowCard, ".slice(0, BROWSE_FEATURED_ITEMS_PER_STORE_MAX)", "row card must allow up to 6 menu tiles");

const productPublic = read("components/stores/StoreProductPublic.tsx");
assertIncludes(
  productPublic,
  "StoreProductDetailPageChrome",
  "product /p page uses store hero chrome (50c207c)"
);
assertIncludes(productPublic, "StoreBaeminProductDetailView", "product /p page is cart-add only");
assertNotIncludes(productPublic, "postMeStoreOrder", "product /p page must not submit orders directly");
assertIncludes(
  productPublic,
  "buildStoreProductGalleryUrls",
  "product /p page resolves hero media URLs"
);

const pageChrome = read("components/stores/product-detail/baemin/StoreProductDetailPageChrome.tsx");
assertIncludes(pageChrome, "heroGlassOverlayButtons", "product /p hero header overlays image");

const consumerShell = read("components/stores/StoreConsumerShell.tsx");
assertIncludes(
  consumerShell,
  "isStoreProductDetailConsumerPath",
  "product /p must not mount StoreSlugStickyBar"
);

if (process.exitCode) {
  process.exit(process.exitCode);
}
console.log("verify-store-delivery-featured-thumbnails-contract: ok");
