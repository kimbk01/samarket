/**
 * 배달·매장 결제 라벨 COD 통일 계약.
 *
 * 막는 회귀:
 * - 고객/주문 UI에 구 「현금(착불·만나서)」「만나서 현금」 하드코딩 재유입
 * - i18n catalog·business 오너 체크박스가 COD 가 아닌 문구
 * - formatBuyerPaymentDisplay 우회 하드코딩
 */
const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");

const FORBIDDEN_IN_SOURCE = [
  "현금(착불·만나서)",
  "현금 (착불·만나서)",
  "만나서 현금",
  "Cash on meet-up",
  "Cash (COD / meet-up)",
];

const ALLOWLIST_REL = new Set([
  "lib/i18n/store-browse-label-i18n.ts",
  "lib/stores/payment-methods-config.ts",
  "scripts/verify-store-payment-cod-label-contract.cjs",
]);

function read(abs) {
  return fs.readFileSync(abs, "utf8");
}

function fail(message) {
  console.error(`verify-store-payment-cod-label-contract: ${message}`);
  process.exitCode = 1;
}

function walk(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const abs = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === "node_modules" || entry.name === ".next" || entry.name === "__tests__") continue;
      walk(abs, out);
      continue;
    }
    if (!/\.(ts|tsx)$/.test(entry.name)) continue;
    out.push(abs);
  }
  return out;
}

const paymentConfig = read(path.join(root, "lib", "stores", "payment-methods-config.ts"));
if (!paymentConfig.includes("normalizeCheckoutPaymentMethodId")) {
  fail("payment-methods-config must export normalizeCheckoutPaymentMethodId");
}
if (!paymentConfig.includes("FORBIDDEN_LEGACY_COD_DISPLAY_STRINGS")) {
  fail("payment-methods-config must list forbidden legacy COD strings");
}

const storeCommerceUi = read(path.join(root, "lib", "i18n", "catalog", "store-commerce-ui.ts"));
if (!storeCommerceUi.includes('store_pay_label_cod: "COD"')) {
  fail('store-commerce-ui store_pay_label_cod must be "COD"');
}

const business = read(path.join(root, "lib", "i18n", "catalog", "business.ts"));
if (!business.includes('business_phase7_067: "COD"')) {
  fail('business.ts business_phase7_067 must be "COD"');
}

const chatCard = read(path.join(root, "lib", "store-order-chat", "build-store-order-chat-card-view.ts"));
if (!chatCard.includes("formatBuyerPaymentDisplay")) {
  fail("order chat card must use formatBuyerPaymentDisplay");
}
if (chatCard.includes("현금(착불")) {
  fail("order chat card must not hardcode legacy cash-on-delivery Korean label");
}

const scanRoots = [
  path.join(root, "components", "stores"),
  path.join(root, "components", "mypage"),
  path.join(root, "components", "business"),
  path.join(root, "lib", "stores"),
  path.join(root, "lib", "store-order-chat"),
];

for (const dir of scanRoots) {
  if (!fs.existsSync(dir)) continue;
  for (const abs of walk(dir)) {
    const rel = path.relative(root, abs).replace(/\\/g, "/");
    if (ALLOWLIST_REL.has(rel)) continue;
    const src = read(abs);
    for (const needle of FORBIDDEN_IN_SOURCE) {
      if (src.includes(needle)) {
        fail(`${rel} contains forbidden legacy label "${needle}" — use payment-methods-config / i18n COD`);
      }
    }
  }
}

if (process.exitCode) {
  console.error("→ 의도적 변경이면 FORBIDDEN_LEGACY_COD_DISPLAY_STRINGS·검증 스크립트를 함께 갱신하세요.");
  process.exit(process.exitCode);
}

console.log("verify-store-payment-cod-label-contract: ok");
