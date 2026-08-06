/**
 * Slice 2 Authority — Member MyPage Nav/CTA/Motion structural contract.
 * Slice 3 IA — logout MOVE off profile → Account menu.
 *   npm run verify:mypage-authority-contract
 */
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const root = join(import.meta.dirname, "..");
const failures = [];

function read(rel) {
  const p = join(root, rel);
  if (!existsSync(p)) {
    failures.push(`missing file: ${rel}`);
    return "";
  }
  return readFileSync(p, "utf8");
}

// 1) Authority module exports
const authMod = read("lib/mypage/mypage-authority-contract.ts");
for (const token of [
  "MYPAGE_DOMAIN_ROOT_PATH",
  "MYPAGE_LOGOUT_DANGER_VARIANTS",
  "MYPAGE_MOTION_MS",
  "MYPAGE_LOGOUT_PUSH_CONFIRM_PATHS",
  "isMypageDomainHubPath",
]) {
  if (!authMod.includes(token)) failures.push(`authority module missing export/symbol: ${token}`);
}
if (!authMod.includes("push: 300") || !authMod.includes("modal: 200")) {
  failures.push("MYPAGE_MOTION_MS must pin push=300 and modal=200");
}

// 2) Profile hub — logout MOVE off (Slice 3); never text_link
const profileSummary = read("components/mypage/home/MypageProfileSummary.tsx");
if (/LogoutActionTrigger/.test(profileSummary)) {
  failures.push("MypageProfileSummary: LogoutActionTrigger forbidden (Slice 3 MOVE → Account)");
}
if (!/mypage-profile-manner-row/.test(profileSummary)) {
  failures.push("MypageProfileSummary: expected manner/trust row (Slice 3 ADD)");
}

const accountSection = read("components/mypage/myinfo/MyInfoHomeMenuSections.tsx");
if (!/LogoutActionTrigger[\s\S]*?variant=["']menu_row["']/.test(accountSection)) {
  failures.push("MyInfoAccountMenuSection: expected menu_row logout (Danger + modal)");
}
if (!/MyInfoTradeMenuSection/.test(accountSection) || !/MYPAGE_HOME_TRADE_ITEMS/.test(accountSection)) {
  failures.push("MyInfoHomeMenuSections: expected trade MERGE section");
}

const dashboard = read("components/mypage/MyPageHomeDashboard.tsx");
if (!/MyInfoTradeMenuSection/.test(dashboard)) {
  failures.push("MyPageHomeDashboard: trade section missing from hub IA");
}
const mobileBlock = dashboard.match(/md:hidden[\s\S]*?MyPageAdminMenuEntry/);
if (mobileBlock) {
  const order = [
    "MyInfoTradeMenuSection",
    "MyInfoStoreMenuSection",
    "MyInfoAccountMenuSection",
    "MyInfoServiceMenuSection",
    "MyInfoSupportMenuSection",
  ];
  let last = -1;
  for (const name of order) {
    const i = mobileBlock[0].indexOf(name);
    if (i < 0) {
      failures.push(`MyPageHomeDashboard mobile: missing ${name}`);
      break;
    }
    if (i < last) {
      failures.push(`MyPageHomeDashboard mobile: IA order broken around ${name}`);
      break;
    }
    last = i;
  }
}

// 3) /mypage/logout and /my/logout — redirect only, no LogoutActionTrigger confirm
for (const rel of ["app/(main)/mypage/logout/page.tsx", "app/(main)/my/logout/page.tsx"]) {
  const src = read(rel);
  if (!/redirect\s*\(/.test(src)) failures.push(`${rel}: must server redirect`);
  if (/LogoutActionTrigger/.test(src)) {
    failures.push(`${rel}: must not render LogoutActionTrigger (push confirm ban)`);
  }
  if (/autoOpen/.test(src)) failures.push(`${rel}: autoOpen confirm forbidden`);
}

// 4) Nav registry — no logout browse item
const registry = read("lib/mypage/mypage-mobile-nav-registry.ts");
if (/\blogout\b/.test(registry) && /id:\s*["']logout["']/.test(registry)) {
  failures.push("mypage-mobile-nav-registry: logout must not be a browse push item");
}

// 5) Live hub must not deep-link logout confirm (legacy MypageInstagramView file-read removed — Slice 10)
if (
  /href=["']\/mypage\/logout["']/.test(accountSection) ||
  /href=["']\/mypage\/logout["']/.test(dashboard) ||
  /href=["']\/mypage\/logout["']/.test(profileSummary)
) {
  failures.push("hub: href=/mypage/logout forbidden — use modal Danger CTA");
}

// 6) Docs motion table filled
const navDoc = read("docs/customer-platform/03-NAVIGATION.md");
if (/TBD LOCK|^\| push \| TBD/m.test(navDoc)) {
  failures.push("03-NAVIGATION.md Motion TBD must be filled with LOCK durations");
}
if (!navDoc.includes("300ms") || !navDoc.includes("MYPAGE_MOTION_MS")) {
  failures.push("03-NAVIGATION.md must reference 300ms push and MYPAGE_MOTION_MS");
}

if (failures.length) {
  console.error("[verify:mypage-authority-contract] FAIL");
  for (const f of failures) console.error(" -", f);
  process.exit(1);
}
console.log("[verify:mypage-authority-contract] OK");
