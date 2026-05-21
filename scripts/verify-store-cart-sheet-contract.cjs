/**
 * 배달 카트/옵션 시트 계약 검증.
 *
 * 막는 회귀:
 * - 카트에서 옵션 시트를 열 때 cart line seed 없이 깨지는 경로
 * - 존재하지 않는 `/stores/:slug/products/:id` 라우트
 *
 * (menus upsell prefetch는 매장 상세 전용 — Baemin 카트 본문은 store block + checkout)
 */
const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");
const cartPageFile = path.join(root, "components", "stores", "StoreCommerceCartPageClient.tsx");
const openFromCartFile = path.join(root, "lib", "stores", "open-store-product-sheet-from-cart.ts");
const cartPrefetchFile = path.join(root, "lib", "stores", "store-cart-sheet-prefetch.ts");

function read(relOrAbs) {
  return fs.readFileSync(relOrAbs, "utf8");
}

function fail(message) {
  console.error(`verify-store-cart-sheet-contract: ${message}`);
  process.exitCode = 1;
}

function assertIncludes(source, needle, context) {
  if (!source.includes(needle)) fail(`${context}: missing "${needle}"`);
}

const cartPage = read(cartPageFile);
const openFromCart = read(openFromCartFile);
const cartPrefetch = read(cartPrefetchFile);

assertIncludes(cartPage, "openStoreProductSheetFromCart", "cart page must open option sheet via cart helper");
assertIncludes(cartPage, "StoreBaeminCartStoreBlock", "cart page must use Baemin store block");
assertIncludes(cartPage, "checkoutMinOrderFooterLine", "cart footer must expose min-order status");
assertIncludes(cartPage, "store_min_order_met", "cart must use min-order met i18n key");
assertIncludes(cartPage, "minOrderLine={checkoutMinOrderFooterLine}", "cart must pass min-order line to checkout bar");
assertIncludes(cartPage, "checkoutPaymentOptionsForCart", "cart must use centralized checkout payment options");
const paymentConfig = read(path.join(root, "lib", "stores", "payment-methods-config.ts"));
assertIncludes(paymentConfig, 'store_pay_label_cod', "payment config must map cod to store_pay_label_cod");
assertIncludes(
  cartPage,
  "if (!cart.hydrated || lines.length === 0) return",
  "checkout identity bootstrap must not run on empty cart"
);

assertIncludes(
  openFromCart,
  "resolveStoreCartSheetPrefetchedRow",
  "openStoreProductSheetFromCart must resolve a seed row before opening"
);
assertIncludes(
  openFromCart,
  "prefetchedListRow,",
  "openStoreProductSheetFromCart must pass prefetchedListRow to sheet store"
);
assertIncludes(
  cartPrefetch,
  "cartLineToPrefetchedListRow",
  "cart line fallback seed helper must exist"
);
assertIncludes(
  cartPrefetch,
  "storeCartInCartProductIdsKey",
  "stable in-cart product id key helper must exist"
);

const storesDir = path.join(root, "components", "stores");
const brokenRoutePattern = /\/stores\/\$\{[^`]*\}\/products\/\$\{[^`]*\}/;
function scanTsxFiles(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const abs = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      scanTsxFiles(abs);
      continue;
    }
    if (!/\.(ts|tsx)$/.test(entry.name)) continue;
    const s = read(abs);
    if (brokenRoutePattern.test(s)) {
      fail(
        `${path.relative(root, abs)} uses /stores/:slug/products/:id; store product route is /stores/:slug/p/:id or sheet open`
      );
    }
  }
}
scanTsxFiles(storesDir);

if (process.exitCode) {
  console.error("→ 의도적 변경이면 카트 시트 seed 계약과 검증 스크립트를 함께 갱신하세요.");
  process.exit(process.exitCode);
}

console.log("verify-store-cart-sheet-contract: ok");
