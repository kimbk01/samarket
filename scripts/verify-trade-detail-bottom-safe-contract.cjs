/**
 * Trade post detail — no sticky bottom bar · inline owner promote · sheet not covered.
 *
 * Usage: npm run verify:trade-detail-bottom-safe-contract
 */
const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const constantsPath = path.join(root, "components/product/detail/product-detail-bottom-constants.ts");
const viewPath = path.join(root, "components/post/PostDetailView.tsx");
const sheetPath = path.join(root, "components/post/MemberPostPromoteSheet.tsx");

function fail(message) {
  console.error(`verify-trade-detail-bottom-safe-contract: ${message}`);
  process.exit(1);
}

function read(p) {
  if (!fs.existsSync(p)) fail(`missing ${path.relative(root, p)}`);
  return fs.readFileSync(p, "utf8");
}

const constants = read(constantsPath);
const view = read(viewPath);
const sheet = read(sheetPath);

if (!constants.includes("TRADE_POST_DETAIL_BOTTOM_PRIMARY_CTA")) {
  fail("missing TRADE_POST_DETAIL_BOTTOM_PRIMARY_CTA");
}

if (view.includes("TRADE_POST_DETAIL_BOTTOM_SHELL")) {
  fail("PostDetailView must not render sticky TRADE_POST_DETAIL_BOTTOM_SHELL");
}
if (view.includes("TRADE_POST_DETAIL_BOTTOM_SELLER_BAND")) {
  fail("PostDetailView must not render sticky TRADE_POST_DETAIL_BOTTOM_SELLER_BAND");
}
if (view.includes("tradePostDetailSellerBandVisible") || /\bsellerBandVisible\b/.test(view)) {
  fail("PostDetailView must not gate a sticky seller band");
}
if (view.includes("TRADE_POST_DETAIL_SCROLL_PAD_BUYER") || view.includes("TRADE_POST_DETAIL_SCROLL_PAD_SELLER")) {
  fail("PostDetailView must not reserve sticky-bar scroll pad");
}
if (view.includes("TRADE_POST_DETAIL_BOTTOM_PRIMARY_ROW")) {
  fail("PostDetailView must not render buyer PRIMARY_ROW — chat is inline");
}
if (view.includes("pb-28") || view.includes('"pb-24"') || view.includes("`pb-24`")) {
  fail("PostDetailView must not use fixed pb-28/pb-24 scroll pads");
}
if (!view.includes('data-ui5-slot="promote"')) {
  fail("PostDetailView must place owner promote CTA inline (data-ui5-slot=promote)");
}
if (!view.includes("TradePostDetailInlinePromoteCta")) {
  fail("PostDetailView must render TradePostDetailInlinePromoteCta");
}
if (!view.includes("pb-[max(10px,var(--safe-bottom))]")) {
  fail("PostDetailView page must consume max(10px,var(--safe-bottom)) once");
}

if (/\bpb-8\b/.test(sheet)) {
  fail("MemberPostPromoteSheet must not use fixed pb-8");
}
if (/env\(safe-area-inset-bottom/.test(sheet)) {
  fail("MemberPostPromoteSheet must not use raw env(safe-area-inset-bottom)");
}
const sheetHasLegacySafePad = /pb-\[max\(0\.75rem,var\(--safe-bottom\)\)\]/.test(sheet);
const sheetUsesDibayAboveNav =
  /DibayBottomSheet/.test(sheet) && /anchor=["']above-bottom-nav["']/.test(sheet);
if (!sheetHasLegacySafePad && !sheetUsesDibayAboveNav) {
  fail(
    "MemberPostPromoteSheet must use pb-[max(0.75rem,var(--safe-bottom))] or DibayBottomSheet anchor=above-bottom-nav (MAIN_BOTTOM_NAV_SHEET_* safe geometry)"
  );
}

console.log("verify-trade-detail-bottom-safe-contract: ok");
