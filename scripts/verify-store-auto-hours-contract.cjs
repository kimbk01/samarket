/**
 * 매장 자동 영업시간·공개 주문 가능 계약 검증.
 *
 * 막는 회귀:
 * - enabled:true 만 저장 (schedule_enforced 없음) → 공개 마감 오판
 * - 오너 폼·PATCH 에서 apply/sanitize 우회
 * - 저장 후 클라 Map 캐시 미퍼지 → stale business_hours_json
 */
const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");

function read(rel) {
  return fs.readFileSync(path.join(root, rel), "utf8");
}

function fail(message) {
  console.error(`verify-store-auto-hours-contract: ${message}`);
  process.exitCode = 1;
}

function assertIncludes(source, needle, context) {
  if (!source.includes(needle)) fail(`${context}: missing "${needle}"`);
}

function assertExcludes(source, needle, context) {
  if (source.includes(needle)) fail(`${context}: must not include "${needle}"`);
}

const autoHours = read("lib/stores/store-auto-hours.ts");
const serialize = read("lib/stores/serialize-store-business-hours-json.ts");
const invalidate = read("lib/stores/store-public-cache-invalidate.ts");
const deliveryClient = read("lib/stores/store-delivery-api-client.ts");
const ownerForm = read("components/business/OwnerStoreProfileForm.tsx");
const patchRoute = read("app/api/me/stores/[storeId]/route.ts");
const validateCheckout = read("lib/stores/validate-store-order-checkout.ts");

assertIncludes(autoHours, "schedule_enforced", "readAutoBusinessHoursConfig must gate schedule_enforced");
assertIncludes(autoHours, "STORE_AUTO_SCHEDULE_ENFORCED_KEY", "use shared key constant");
assertIncludes(serialize, "sanitizeBusinessHoursJsonForPersistence", "server/client sanitize export");
assertIncludes(serialize, "applyAutoBusinessHoursToRecord", "single serializer");
assertIncludes(ownerForm, "applyAutoBusinessHoursToRecord", "owner form must use serializer");
assertExcludes(
  ownerForm,
  "prev.auto_business_hours = {",
  "owner form must not inline auto_business_hours assign"
);

assertIncludes(patchRoute, "sanitizeBusinessHoursJsonForPersistence", "PATCH must sanitize hours json");
assertIncludes(patchRoute, "invalidateStorePublicCachesForSlug", "PATCH must invalidate public cache");

assertIncludes(invalidate, "purgeStoreSlugPublicClientCaches", "must purge 15s client maps");
assertIncludes(invalidate, "invalidateStoreSummaryPublicServerCache", "must purge 45s server cache");
assertIncludes(deliveryClient, "export function purgeStoreSlugPublicClientCaches", "client purge export");

assertIncludes(validateCheckout, "resolveStoreFrontOpen", "checkout must use shared open resolver");

const detail = read("components/stores/StoreDetailPublic.tsx");
const cart = read("components/stores/StoreCommerceCartPageClient.tsx");
assertIncludes(detail, "useStorePublicSlugCacheInvalidation", "store detail must listen for invalidate");
assertIncludes(cart, "useStorePublicSlugCacheInvalidation", "cart must listen for invalidate");

const ownerShellCss = read("app/owner-compact-shell.css");
assertIncludes(ownerShellCss, ".owner-ops-drawer-panel[data-open=\"true\"]", "drawer panel open transform in CSS");
assertIncludes(ownerShellCss, "transform: translate3d(0, 0, 0)", "drawer slide-in CSS");
const shell = read("components/business/admin/BusinessAdminShell.tsx");
assertIncludes(shell, "OwnerMobileOpsMenuDrawer", "shell must use CSS-backed drawer");
assertExcludes(shell, 'className="contents"', "drawer portal must not use display:contents");

if (!process.exitCode) {
  console.log("verify-store-auto-hours-contract: ok");
}
