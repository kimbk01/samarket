/**
 * `/mypage` root network contract — static import/caller bans + unit gates.
 * Run: node scripts/verify-mypage-root-network-contract.cjs
 * Also: vitest run lib/mypage/__tests__/mypage-root-network-contract.test.ts
 */
const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");

function read(rel) {
  return fs.readFileSync(path.join(root, rel), "utf8");
}

/** Strip line comments so DO NOT contract notes do not false-positive bans. */
function codeOnly(src) {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/.*$/gm, "$1");
}

const failures = [];

const requiredInfo = codeOnly(read("components/mypage/home/MypageRequiredInfoSummary.tsx"));
if (/useRepresentativeAddressPresentation|useRepresentativeAddressLine|useRepresentativeFullAddressLine/.test(requiredInfo)) {
  failures.push("MypageRequiredInfoSummary must not call representative address hooks (parent owns address fetch)");
}
if (/fetchAddressDefaultsSnapshot\s*\(/.test(requiredInfo)) {
  failures.push("MypageRequiredInfoSummary must not call fetchAddressDefaultsSnapshot");
}

const homeModel = codeOnly(read("hooks/use-mypage-home-model.ts"));
if (/fetchMeStoresListDeduped|\/api\/me\/stores/.test(homeModel)) {
  failures.push("useMypageHomeModel must not fetch stores");
}
if (/getMyPageData|\/trade-counts|\/order-counts|my_page_banners/.test(homeModel)) {
  failures.push("useMypageHomeModel must not fetch trade-counts / order-counts / CMS");
}
if (!/resolveMypageHomeProfileRow/.test(homeModel)) {
  failures.push("useMypageHomeModel must use resolveMypageHomeProfileRow (canonical profile authority)");
}
if (!/fetchAddressDefaultsSnapshot/.test(homeModel)) {
  failures.push("useMypageHomeModel must own address-defaults read");
}

const dashboard = codeOnly(read("components/mypage/MyPageHomeDashboard.tsx"));
if (/useMypageHubModel|fetchMeStoresListDeduped|MyStoreCommerceSection/.test(dashboard)) {
  failures.push("MyPageHomeDashboard must not mount hub model / stores commerce section");
}

const myContent = codeOnly(read("app/(main)/my/MyContent.tsx"));
if (/useMypageHubModel|fetchMeStoresListDeduped/.test(myContent)) {
  failures.push("MyContent must not use hub model / stores list");
}

const ownerLite = read("lib/stores/owner-lite-external-store.ts");
if (!/isMypageRootSurfacePathname/.test(ownerLite)) {
  failures.push("owner-lite-external-store must gate auto-hydrate off mypage root");
}
if (!/cancelPendingOwnerLiteAutoHydrate/.test(ownerLite)) {
  failures.push("owner-lite-external-store must export cancelPendingOwnerLiteAutoHydrate");
}
if (!/cancelPendingOwnerLiteAutoHydrate/.test(homeModel)) {
  failures.push("useMypageHomeModel must cancel pending owner-lite hydrate on mount");
}

const addressFetch = read("lib/addresses/fetch-address-defaults-client.ts");
if (!/__SAMARKET_ADDRESS_DEFAULTS_CANONICAL__/.test(addressFetch)) {
  failures.push("address-defaults fetch must use globalThis canonical inflight/cache");
}

const resolveProfile = codeOnly(read("lib/mypage/resolve-mypage-home-profile.ts"));
if (/profile\?lite|lite=1|mode=lite/.test(resolveProfile)) {
  failures.push("resolveMypageHomeProfile must not call profile lite");
}

if (failures.length) {
  console.error("[verify:mypage-root-network-contract] FAIL");
  for (const f of failures) console.error(" -", f);
  process.exit(1);
}
console.log("[verify:mypage-root-network-contract] OK");
