import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  isMypageDeepPath,
  isMypageGuestPublicItem,
  isMypageTopLevelPath,
  resolveMypageIaParentHref,
  resolveMypageIaTitleKey,
} from "@/lib/mypage/mypage-ia";
import { isBottomNavEligibleRoute } from "@/lib/navigation/bottom-nav-route-policy";
import {
  HIDDEN_INTERNAL_LOGIN_TAP_COUNT,
  HIDDEN_INTERNAL_LOGIN_WINDOW_MS,
  registerHiddenInternalLoginTap,
} from "@/components/auth/DibayAuthLogoHiddenGate";

describe("내정보 분류(IA) — 단계·하단 탭", () => {
  it("홈·분류 화면만 L0/L1, 그 아래는 하단 탭 숨김", () => {
    expect(isMypageTopLevelPath("/mypage")).toBe(true);
    expect(isMypageTopLevelPath("/mypage/section/asset")).toBe(true);
    expect(isMypageTopLevelPath("/mypage/section/messenger")).toBe(false);
    expect(isMypageDeepPath("/mypage/points")).toBe(true);
    expect(isMypageDeepPath("/mypage/section/settings/notifications")).toBe(true);
    expect(isMypageDeepPath("/mypage/section/trade")).toBe(false);
    expect(isBottomNavEligibleRoute("/mypage")).toBe(true);
    expect(isBottomNavEligibleRoute("/mypage/section/store")).toBe(true);
    expect(isBottomNavEligibleRoute("/mypage/points/charge")).toBe(false);
    expect(isBottomNavEligibleRoute("/mypage/store-orders")).toBe(false);
  });
});

describe("내정보 분류(IA) — 제목·뒤로", () => {
  it("L2 제목 = 분류 행 이름, 뒤로 = 그 분류", () => {
    expect(resolveMypageIaTitleKey("/mypage/products")).toBe("mypage_comp_menu_trade_active_title");
    expect(resolveMypageIaParentHref("/mypage/products")).toBe("/mypage/section/trade");
    expect(resolveMypageIaTitleKey("/mypage/coupons")).toBe("store_coupon_wallet_title");
    expect(resolveMypageIaParentHref("/mypage/coupons")).toBe("/mypage/section/asset");
    expect(resolveMypageIaParentHref("/mypage/section/settings/region")).toBe("/mypage/section/trade");
    expect(resolveMypageIaParentHref("/mypage/section/store/payment")).toBe("/mypage/section/account");
    expect(resolveMypageIaTitleKey("/mypage/section/settings/device-permissions")).toBe("mypage_ia_device_permissions");
  });

  it("앱 설정(헤더 ⚙)·고객지원(카드) 분리 — 하위 화면 뒤로 = 소속 분류 (Owner 2026-11-03)", () => {
    expect(resolveMypageIaParentHref("/mypage/section/settings/notifications")).toBe("/mypage/section/settings");
    expect(resolveMypageIaParentHref("/mypage/section/settings/version")).toBe("/mypage/section/settings");
    expect(resolveMypageIaParentHref("/mypage/section/settings/terms")).toBe("/mypage/section/support");
    expect(resolveMypageIaParentHref("/mypage/customer-center")).toBe("/mypage/section/support");
    expect(resolveMypageIaParentHref("/mypage/section/support")).toBe("/mypage");
    expect(resolveMypageIaParentHref("/mypage/section/settings")).toBe("/mypage");
    const header = readFileSync(join(process.cwd(), "components/my/MyMypageHeaderActions.tsx"), "utf8");
    expect(header).toContain('buildMypageIaCategoryHref("settings")');
    expect(header.indexOf("mypage-header-app-settings")).toBeLessThan(header.indexOf("<MyHeaderNotificationInbox"));
  });

  it("L3 뒤로 = 부모 화면, 분류 화면 뒤로 = 홈, 홈 = 없음", () => {
    expect(resolveMypageIaParentHref("/mypage/points/expiring")).toBe("/mypage/points");
    expect(resolveMypageIaParentHref("/mypage/store-orders/o1")).toBe("/mypage/store-orders");
    expect(resolveMypageIaParentHref("/mypage/customer-center/notice/n1")).toBe("/mypage/customer-center");
    expect(resolveMypageIaParentHref("/mypage/order-notifications")).toBe("/mypage/section/settings/notifications");
    expect(resolveMypageIaParentHref("/mypage/section/community")).toBe("/mypage");
    expect(resolveMypageIaParentHref("/mypage")).toBeNull();
    expect(resolveMypageIaTitleKey("/mypage/store-orders/o1")).toBeNull();
  });

  it("비로그인 공개 항목 = 약관·버전·언어만", () => {
    expect(isMypageGuestPublicItem("settings", "terms")).toBe(true);
    expect(isMypageGuestPublicItem("settings", "version")).toBe(true);
    expect(isMypageGuestPublicItem("settings", "notifications")).toBe(false);
    expect(isMypageGuestPublicItem("account", "blocked-users")).toBe(false);
  });
});

describe("운영자 로그인 숨김 — 로고 4회 탭 (3초 안)", () => {
  it("3번은 안 열림, 4번째에 열리고 횟수 초기화", () => {
    let taps: number[] = [];
    for (let i = 0; i < HIDDEN_INTERNAL_LOGIN_TAP_COUNT - 1; i++) {
      const r = registerHiddenInternalLoginTap(taps, 1000 + i * 200);
      expect(r.unlocked).toBe(false);
      taps = r.taps;
    }
    const r = registerHiddenInternalLoginTap(taps, 1800);
    expect(r.unlocked).toBe(true);
    expect(r.taps).toEqual([]);
  });

  it("3초가 지난 탭은 세지 않는다", () => {
    let taps: number[] = [];
    taps = registerHiddenInternalLoginTap(taps, 0).taps;
    taps = registerHiddenInternalLoginTap(taps, 100).taps;
    const late = HIDDEN_INTERNAL_LOGIN_WINDOW_MS + 200;
    taps = registerHiddenInternalLoginTap(taps, late).taps;
    const r = registerHiddenInternalLoginTap(taps, late + 100);
    expect(r.unlocked).toBe(false);
    expect(r.taps).toHaveLength(2);
  });
});
