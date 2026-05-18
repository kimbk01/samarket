/**
 * `/stores/[slug]/cart` — Rules of Hooks + checkout bootstrap 계약.
 *
 * 막는 회귀:
 * - early return 아래 useMemo/useCallback 등 추가 (런타임 크래시)
 * - 빈 장바구니에서 checkout-contact 3-way fetch
 */
const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");
const cartPageFile = path.join(root, "components", "stores", "StoreCommerceCartPageClient.tsx");

function fail(message) {
  console.error(`verify-store-cart-hooks-contract: ${message}`);
  process.exitCode = 1;
}

function assertIncludes(source, needle, context) {
  if (!source.includes(needle)) fail(`${context}: missing "${needle}"`);
}

const cartPage = fs.readFileSync(cartPageFile, "utf8");

assertIncludes(cartPage, "JSX 분기 return", "hook boundary marker");
assertIncludes(cartPage, "const deliveryFeeSummaryLabel = useMemo", "delivery fee label hook");
assertIncludes(cartPage, "const openProductSheet = useCallback", "open product sheet hook");
assertIncludes(
  cartPage,
  "if (!cart.hydrated || lines.length === 0) return",
  "bootstrap must skip empty cart"
);
assertIncludes(cartPage, "void bootstrapCheckoutIdentity()", "bootstrap invocation");

const boundaryIdx = cartPage.indexOf("JSX 분기 return");
const afterBoundary = cartPage.slice(boundaryIdx);
const hookRe = /\buse(Memo|Callback|Effect|State|Ref|LayoutEffect|ImperativeHandle|Context)\s*\(/g;
let match;
while ((match = hookRe.exec(afterBoundary))) {
  fail(`hook call "${match[0].trim()}" must not appear after JSX branch boundary (~line ${boundaryIdx})`);
}

if (process.exitCode) {
  console.error("→ early return 아래에 훅을 두지 말고, boundary 주석 위로 올리세요.");
  process.exit(process.exitCode);
}

console.log("verify-store-cart-hooks-contract: ok");
