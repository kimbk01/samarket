import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { resolveBottomNavScrollHideEnabled } from "@/lib/layout/use-bottom-nav-scroll-hide-behavior";
import {
  MAIN_BOTTOM_NAV_BODY_CLEARANCE_CLASS,
  MAIN_BOTTOM_NAV_ORBIT_BODY_CLEARANCE_CLASS,
  MESSENGER_HUB_LIST_SCROLL_BOTTOM_INSET_CLASS,
  resolveBodyBottomNavClearanceClass,
} from "@/lib/layout/main-bottom-nav-hub-clearance";
import { PHILIFE_HUB_BOTTOM_NAV_CLEARANCE_CLASS, TRADE_FEED_LIST_END_CLEARANCE_CLASS } from "@/lib/philife/philife-flat-ui-classes";
import { MYPAGE_HOME_BOTTOM_NAV_CLEARANCE_CLASS } from "@/lib/ui/mypage-home-starbucks-styles";

/**
 * 크롬 S4 (2026-11-02 · Owner 「S4, 권고대로」) — 하단 내비.
 * docs/audit/dibay-chrome-header-tab-bottomnav-audit-2026-11-02.md §3-3 · §7-2 · §7-3
 */
const ROOT = process.cwd();
const read = (rel: string) => readFileSync(join(ROOT, rel), "utf8");
const navCss = read("app/app-bottom-nav.css");

describe("chrome S4 — bottom nav", () => {
  it("결정 6: orbit 선택 = 하단 내비 브랜드 그린, 배달 토큰(--delivery-*) 미사용", () => {
    const i = navCss.indexOf("--app-bottom-nav-orbit-size: 2.625rem;");
    const block = navCss.slice(navCss.lastIndexOf(":root {", i), navCss.indexOf("}", i));
    expect(block).toContain("--app-bottom-nav-orbit-bg-active: var(--app-bottom-nav-main-green);");
    expect(block).not.toContain("--delivery-dark");
    expect(block).not.toContain("--delivery-primary");
    expect(block).not.toContain("rgba(0, 98, 65");
  });

  it("결정 2: 스크롤 숨김 규칙표 — 긴 목록(커뮤니티·메신저 목록) on, 내정보·배달 홈/업종 off", () => {
    expect(resolveBottomNavScrollHideEnabled("/philife", false)).toBe(true);
    expect(resolveBottomNavScrollHideEnabled("/philife", true)).toBe(false);
    expect(resolveBottomNavScrollHideEnabled("/mypage", false)).toBe(false);
    expect(resolveBottomNavScrollHideEnabled("/stores", false)).toBe(false);
    expect(resolveBottomNavScrollHideEnabled("/stores/browse/food", false)).toBe(false);
    expect(resolveBottomNavScrollHideEnabled("/community-messenger", false, "section=chats")).toBe(true);
    expect(resolveBottomNavScrollHideEnabled("/mypage/section/settings", false)).toBe(false);
  });

  it("숨긴 하단 탭은 inert (키보드·스크롤 모두)", () => {
    expect(read("components/layout/ConditionalAppShell.tsx")).toContain(
      "inert={bottomNavKeyboardHidden || bottomNavScrollHidden}"
    );
  });

  it("비배달 허브 본문 여백 = 탭 + 원형 탭 높이 + safe · 배달 허브는 계약값 그대로", () => {
    expect(MAIN_BOTTOM_NAV_ORBIT_BODY_CLEARANCE_CLASS).toBe("pb-[var(--app-bottom-nav-clearance)]");
    expect(navCss).toContain(
      "--app-bottom-nav-clearance: calc(var(--app-bottom-nav-height, 60px) + var(--main-scroll-nav-overhang, 0px) + var(--safe-bottom));"
    );
    expect(MAIN_BOTTOM_NAV_BODY_CLEARANCE_CLASS).not.toContain("--main-scroll-nav-overhang");
    for (const c of [
      PHILIFE_HUB_BOTTOM_NAV_CLEARANCE_CLASS,
      TRADE_FEED_LIST_END_CLEARANCE_CLASS,
      MYPAGE_HOME_BOTTOM_NAV_CLEARANCE_CLASS,
      MESSENGER_HUB_LIST_SCROLL_BOTTOM_INSET_CLASS,
    ]) {
      expect(c).toBe(MAIN_BOTTOM_NAV_ORBIT_BODY_CLEARANCE_CLASS);
    }
    expect(resolveBodyBottomNavClearanceClass("/philife", true)).toBe(MAIN_BOTTOM_NAV_ORBIT_BODY_CLEARANCE_CLASS);
    expect(resolveBodyBottomNavClearanceClass("/market", true)).toBe(MAIN_BOTTOM_NAV_ORBIT_BODY_CLEARANCE_CLASS);
    for (const p of ["/stores", "/stores/browse/food", "/stores/cart", "/orders"]) {
      expect(resolveBodyBottomNavClearanceClass(p, true), p).toBe(MAIN_BOTTOM_NAV_BODY_CLEARANCE_CLASS);
    }
    for (const rel of [
      "components/stores/home/hub/StoresHomeHub.tsx",
      "components/stores/browse/StoresBrowsePrimaryView.tsx",
      "lib/stores/store-cart-page-layout.ts",
    ]) {
      expect(read(rel), rel).not.toContain("MAIN_BOTTOM_NAV_ORBIT_BODY_CLEARANCE_CLASS");
    }
  });

  it("하단 탭 배지 링 색 1개 (ring-white 중복 없음)", () => {
    const nav = read("components/layout/BottomNav.tsx");
    expect(nav).toContain('OWNER_HUB_BADGE_DOT_CLASS.replace(\n  " ring-white",');
    expect(nav).toContain("ring-[color:var(--app-bottom-nav-surface)]");
  });

  it("B-R2: 미선택 하단 탭 눌림 배경 = 골드 10% (배달·사장님 셸 제외)", () => {
    expect(navCss).toContain(
      '.app-bottom-nav-shell:not(.app-bottom-nav-shell--delivery) .app-bottom-nav-item[data-active="false"]:active {\n  background: var(--app-bottom-nav-hover-bg);'
    );
  });

  it("H-R3: 운영 문서 취소 = 기록 없으면 목록으로", () => {
    expect(read("components/admin/ops-docs/OpsDocumentForm.tsx")).toContain("runHistoryBackWithFallback(router,");
    expect(read("components/admin/ops-docs/OpsDocumentForm.tsx")).not.toContain("onClick={() => router.back()}");
  });

  it("렌더되지 않던 허브 탭 컴포넌트 제거", () => {
    const nav = read("components/layout/BottomNav.tsx");
    expect(nav).not.toContain("BottomNavTabDeliveryHomeHub");
    expect(nav).not.toContain("BottomNavTabTradeHomeHub");
  });
});
