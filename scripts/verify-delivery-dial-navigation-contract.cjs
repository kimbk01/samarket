/**
 * 하단 탭·배달 홈·다이얼 — 단일 commitMainBottomNavRoute 계약.
 */
const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");

function read(rel) {
  return fs.readFileSync(path.join(root, rel), "utf8");
}

function fail(message) {
  console.error(`verify-delivery-dial-navigation-contract: ${message}`);
  process.exitCode = 1;
}

function assertIncludes(source, needle, context) {
  if (!source.includes(needle)) fail(`${context}: missing "${needle}"`);
}

function assertNotIncludes(source, needle, context) {
  if (source.includes(needle)) fail(`${context}: forbidden "${needle}"`);
}

const bottomNav = read("components/layout/BottomNav.tsx");
const overlay = read("components/delivery/navigation/DeliveryDomainSwitcherOverlay.tsx");
const dialNav = read("lib/delivery/delivery-dial-item-navigation.ts");
const homeHub = read("lib/delivery/delivery-home-hub-navigation.ts");
const commit = read("lib/main-menu/main-bottom-nav-route-commit.ts");
const resolver = read("lib/delivery/resolve-delivery-domain-dial-item-href.ts");
const prewarm = read("lib/delivery/prewarm-delivery-domain-dial.ts");
const css = read("app/delivery-domain-switcher.css");
const chipContract = read("lib/delivery/delivery-dial-chip-contract.ts");

assertIncludes(commit, "commitMainBottomNavRoute", "route commit export");
assertIncludes(commit, "CONTRACT", "route commit contract");

assertIncludes(bottomNav, "commitMainBottomNavRoute", "BottomNav must use unified route commit");
assertNotIncludes(bottomNav, "shouldBottomNavTapScrollOnlyNoNavigate", "scroll-only logic must live in commit module");

assertIncludes(homeHub, "runDeliveryHomeHubShortTap", "home hub short tap");
assertIncludes(homeHub, "onToggleSwitcher", "home short tap must toggle dial");
assertIncludes(homeHub, "runDeliveryHomeHubLongPress", "home hub long press");
assertIncludes(homeHub, "runDeliveryHomeHubNavigateToStores", "long press navigates to delivery home");
assertNotIncludes(
  homeHub.slice(homeHub.indexOf("runDeliveryHomeHubShortTap"), homeHub.indexOf("runDeliveryHomeHubLongPress")),
  "runDeliveryHomeHubNavigateToStores",
  "home short tap must not navigate to stores"
);

assertIncludes(
  read("lib/main-menu/main-bottom-nav-interaction-contract.ts"),
  "CONTRACT",
  "interaction contract doc"
);
assertIncludes(dialNav, "commitMainBottomNavRoute", "dial navigation must use unified route commit");
assertIncludes(dialNav, "resolveDeliveryDomainDialItemHref(tab)", "dial must resolve href from tab id");

assertIncludes(overlay, "runDeliveryDialItemNavigation", "overlay must delegate to dial lib");
assertIncludes(overlay, "currentSearch: navSearch", "overlay must pass search for scroll-only parity");
assertIncludes(overlay, "onClick={(e)", "overlay chips must use onClick");
assertNotIncludes(overlay, 'from "next/link"', "overlay must not use Link for dial chips");

assertIncludes(prewarm, "resolveDeliveryDomainDialItemHref", "prewarm must use href resolver");

const pushIdx = Math.max(commit.indexOf("args.push(args.href)"), commit.indexOf("args.replace(args.href)"));
const closeIdx = commit.indexOf("args.onCloseOverlay?.()", pushIdx);
if (pushIdx < 0 || closeIdx < 0) {
  fail("commitMainBottomNavRoute: push/replace must precede onCloseOverlay");
}

assertIncludes(css, "pointer-events: none", "swipe surface must not steal chip taps");
assertIncludes(chipContract, "DELIVERY_DIAL_CHIP_HIT_CLASS", "chip contract export");

const packageJson = read("package.json");
assertIncludes(packageJson, "verify:delivery-dial-navigation-contract", "package.json verify script");

if (process.exitCode) {
  process.exit(process.exitCode);
}
console.log("verify-delivery-dial-navigation-contract: ok");
