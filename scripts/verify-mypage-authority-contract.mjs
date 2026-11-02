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

const accountSection = read("components/mypage/myinfo/MyInfoIaCategoryScreen.tsx");
// 로그아웃 = 「설정·지원」 분류 화면의 메뉴 행 + 확인 창(modal) — push 확인 화면 금지 (IA 2026-11-02)
if (!/case "logout":[\s\S]*?<LogoutActionTrigger[\s\S]*?variant=["']menu_row["']/.test(accountSection)) {
  failures.push("MyInfoIaCategoryScreen: expected menu_row logout (modal) for the logout row");
}

const dashboard = read("components/mypage/MyPageHomeDashboard.tsx");
const dashboardJsx = dashboard.slice(dashboard.indexOf("return ("));
// 내정보 홈 = 분류 허브 (IA 2026-11-02 Owner 승인): 프로필 → 필수 정보 → 진행 중 → 분류 카드. 메뉴 행 나열 금지.
{
  const order = ["MypageProfileSummary", "MyInfoHomeNowStrip", "MyInfoHomeCategoryGrid"];
  let last = -1;
  for (const name of order) {
    const i = dashboardJsx.indexOf(name);
    if (i < 0) {
      failures.push(`MyPageHomeDashboard hub: missing ${name}`);
      break;
    }
    if (i < last) {
      failures.push(`MyPageHomeDashboard hub: order broken around ${name}`);
      break;
    }
    last = i;
  }
  for (const banned of ["MyInfoTradeMenuSection", "MyInfoAccountMenuSection", "MyInfoDangerMenuSection"]) {
    if (dashboardJsx.includes(banned)) failures.push(`MyPageHomeDashboard hub: menu rows must live in category screens (${banned})`);
  }
}
const ia = read("lib/mypage/mypage-ia.ts");
for (const token of ["MYPAGE_IA_CATEGORIES", "resolveMypageIaParentHref", "resolveMypageIaTitleKey", "isMypageDeepPath"]) {
  if (!ia.includes(token)) failures.push(`mypage-ia: missing ${token}`);
}
if (!/kind: "logout"/.test(ia)) failures.push("mypage-ia: logout must be a menu row (modal) in settings category");

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
