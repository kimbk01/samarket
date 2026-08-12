/**
 * Trade post detail bottom bar — safe-bottom exactly once + empty seller band 0.
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

if (!constants.includes("TRADE_POST_DETAIL_BOTTOM_PRIMARY_ROW_ABOVE_SELLER")) {
  fail("missing TRADE_POST_DETAIL_BOTTOM_PRIMARY_ROW_ABOVE_SELLER");
}
if (!/TRADE_POST_DETAIL_BOTTOM_PRIMARY_ROW\s*=\s*[`'"][^`'"]*pb-\[max\(10px,var\(--safe-bottom\)\)\]/.test(constants)) {
  fail("PRIMARY_ROW (buyer) must consume max(10px,var(--safe-bottom))");
}
if (!/TRADE_POST_DETAIL_BOTTOM_PRIMARY_ROW_ABOVE_SELLER\s*=\s*[`'"][^`'"]*pb-0/.test(constants)) {
  fail("PRIMARY_ROW_ABOVE_SELLER must use pb-0 (no safe-bottom)");
}
if (/TRADE_POST_DETAIL_BOTTOM_PRIMARY_ROW_ABOVE_SELLER\s*=\s*[`'"][^`'"]*safe-bottom/.test(constants)) {
  fail("PRIMARY_ROW_ABOVE_SELLER must not reference --safe-bottom");
}
if (!/TRADE_POST_DETAIL_BOTTOM_SELLER_BAND\s*=\s*[`'"][^`'"]*pb-\[max\(10px,var\(--safe-bottom\)\)\]/.test(constants)) {
  fail("SELLER_BAND must be the bottom-most safe consumer");
}
if (/TRADE_POST_DETAIL_BOTTOM_SELLER_BAND\s*=\s*[`'"][^`'"]*\bpt-3\b/.test(constants)) {
  fail("SELLER_BAND must not keep oversized pt-3");
}
if (!constants.includes("tradePostDetailSellerBandVisible")) {
  fail("missing tradePostDetailSellerBandVisible helper");
}
if (!constants.includes("TRADE_POST_DETAIL_SCROLL_PAD_BUYER") || !constants.includes("TRADE_POST_DETAIL_SCROLL_PAD_SELLER")) {
  fail("missing scroll pad SSOT tokens");
}

if (!view.includes("tradePostDetailSellerBandVisible")) {
  fail("PostDetailView must use tradePostDetailSellerBandVisible");
}
if (!view.includes("sellerBandVisible")) {
  fail("PostDetailView must gate band on sellerBandVisible");
}
if (!view.includes("TRADE_POST_DETAIL_BOTTOM_PRIMARY_ROW_ABOVE_SELLER")) {
  fail("PostDetailView must select PRIMARY_ROW_ABOVE_SELLER when band visible");
}
if (view.includes("pb-28") || view.includes('"pb-24"') || view.includes("`pb-24`")) {
  fail("PostDetailView must not use fixed pb-28/pb-24 scroll pads");
}
if (!view.includes("TRADE_POST_DETAIL_SCROLL_PAD_BUYER") || !view.includes("TRADE_POST_DETAIL_SCROLL_PAD_SELLER")) {
  fail("PostDetailView must use scroll pad SSOT");
}

if (/\bpb-8\b/.test(sheet)) {
  fail("MemberPostPromoteSheet must not use fixed pb-8");
}
if (/env\(safe-area-inset-bottom/.test(sheet)) {
  fail("MemberPostPromoteSheet must not use raw env(safe-area-inset-bottom)");
}
if (!/pb-\[max\(0\.75rem,var\(--safe-bottom\)\)\]/.test(sheet)) {
  fail("MemberPostPromoteSheet must use pb-[max(0.75rem,var(--safe-bottom))]");
}

console.log("verify-trade-detail-bottom-safe-contract: ok");
