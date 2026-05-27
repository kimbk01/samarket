import { describe, expect, it } from "vitest";
import { BOTTOM_NAV_ITEMS } from "@/lib/main-menu/bottom-nav-config";
import {
  MAIN_BOTTOM_NAV_PREFETCH_MAX,
  isBottomNavTabActive,
  pickMainBottomNavPrefetchHrefs,
  resolveActiveMainBottomNavTabIndex,
} from "@/lib/main-menu/main-bottom-nav-prefetch-pick";
import { composeMainBottomNavDisplayTabs } from "@/lib/main-menu/main-bottom-nav-split-layout";

describe("isBottomNavTabActive", () => {
  it("거래 탭 — 기본 /market 경로", () => {
    const marketHref = "/market";
    expect(isBottomNavTabActive("/market", marketHref)).toBe(true);
    expect(isBottomNavTabActive("/market/jobs", marketHref)).toBe(true);
    expect(isBottomNavTabActive("/philife", marketHref)).toBe(false);
    expect(isBottomNavTabActive("/philife", marketHref)).toBe(false);
  });

  it("거래 탭 — /philife href 는 /market 별칭이 아니다", () => {
    const homeHref = "/philife";
    expect(isBottomNavTabActive("/market", homeHref)).toBe(false);
    expect(isBottomNavTabActive("/market/jobs", homeHref)).toBe(false);
    expect(isBottomNavTabActive("/philife", homeHref)).toBe(true);
  });

  it("접두 경로 일치", () => {
    expect(isBottomNavTabActive("/philife/post-1", "/philife")).toBe(true);
    expect(isBottomNavTabActive("/mypage/settings", "/mypage")).toBe(true);
  });
});

describe("resolveActiveMainBottomNavTabIndex", () => {
  it("admin main-bottom-nav 탭 — 도메인별 활성 인덱스", () => {
    const adminTabs = composeMainBottomNavDisplayTabs("/philife", BOTTOM_NAV_ITEMS);
    expect(resolveActiveMainBottomNavTabIndex("/philife", adminTabs)).toBe(0);
    expect(resolveActiveMainBottomNavTabIndex("/philife/x", adminTabs)).toBe(0);
    expect(resolveActiveMainBottomNavTabIndex("/community-messenger", adminTabs)).toBe(3);
    expect(resolveActiveMainBottomNavTabIndex("/mypage", adminTabs)).toBe(4);
    expect(resolveActiveMainBottomNavTabIndex("/market", adminTabs)).toBe(1);
    expect(resolveActiveMainBottomNavTabIndex("/stores", adminTabs)).toBe(2);

    const tradeTabs = composeMainBottomNavDisplayTabs("/market", BOTTOM_NAV_ITEMS);
    expect(resolveActiveMainBottomNavTabIndex("/market", tradeTabs)).toBe(1);
    expect(resolveActiveMainBottomNavTabIndex("/market/jobs", tradeTabs)).toBe(1);
    expect(resolveActiveMainBottomNavTabIndex("/philife", tradeTabs)).toBe(0);
    expect(resolveActiveMainBottomNavTabIndex("/stores", tradeTabs)).toBe(2);
    /** 하단 chat 슬롯 — trade-chats 는 FAB·레거시 href, 탭 활성 아님(전체 인박스만) */
    expect(resolveActiveMainBottomNavTabIndex("/community-messenger/trade-chats", tradeTabs)).toBe(-1);
    expect(resolveActiveMainBottomNavTabIndex("/community-messenger?section=chats", tradeTabs)).toBe(3);
    expect(resolveActiveMainBottomNavTabIndex("/mypage", tradeTabs)).toBe(4);

    const deliveryTabs = composeMainBottomNavDisplayTabs("/stores", BOTTOM_NAV_ITEMS);
    expect(resolveActiveMainBottomNavTabIndex("/stores", deliveryTabs)).toBe(2);
    expect(resolveActiveMainBottomNavTabIndex("/stores/cart", deliveryTabs)).toBe(2);
    expect(resolveActiveMainBottomNavTabIndex("/orders", deliveryTabs)).toBe(-1);

    expect(resolveActiveMainBottomNavTabIndex("/admin", adminTabs)).toBe(-1);
  });
});

describe("pickMainBottomNavPrefetchHrefs", () => {
  it("활성 탭 href 는 후보에서 제외(누락 방지 = 빈 배열이 아닌 나머지로 채움)", () => {
    const philifeTabs = composeMainBottomNavDisplayTabs("/philife/x", BOTTOM_NAV_ITEMS);
    const hrefs = pickMainBottomNavPrefetchHrefs("/philife/x", philifeTabs);
    expect(hrefs).not.toContain("/philife");
    expect(hrefs).toContain("/market");
    expect(hrefs).toContain("/stores");
    expect(hrefs.some((h) => h.startsWith("/community-messenger") && h.includes("section=chats") && h.includes("from=community"))).toBe(
      true
    );
    expect(hrefs.length).toBeLessThanOrEqual(MAIN_BOTTOM_NAV_PREFETCH_MAX);
  });

  it("거래 표면 idle 후보 — 활성 홈(/market) 제외", () => {
    const tradeTabs = composeMainBottomNavDisplayTabs("/market/list", BOTTOM_NAV_ITEMS);
    const hrefs = pickMainBottomNavPrefetchHrefs("/market/list", tradeTabs);
    expect(hrefs).not.toContain("/market/jobs");
    expect(hrefs.length).toBeLessThanOrEqual(MAIN_BOTTOM_NAV_PREFETCH_MAX);
  });

  it("거래 표면 idle 후보 — chat 슬롯은 전체 인박스(section=chats)·from=trade", () => {
    const tradeTabs = composeMainBottomNavDisplayTabs("/market/list", BOTTOM_NAV_ITEMS);
    const hrefs = pickMainBottomNavPrefetchHrefs("/market/list", tradeTabs);
    expect(hrefs.some((h) => h.includes("section=chats") && h.includes("from=trade"))).toBe(true);
    expect(hrefs.some((h) => h.includes("/community-messenger/trade-chats"))).toBe(false);
  });

  it("배달 표면 idle 후보 — 활성 배달(/stores) 제외", () => {
    const storesTabs = composeMainBottomNavDisplayTabs("/stores", BOTTOM_NAV_ITEMS);
    const hrefs = pickMainBottomNavPrefetchHrefs("/stores", storesTabs, {
      ownerStoreId: "store-uuid-1",
    });
    expect(hrefs).not.toContain("/stores");
    expect(hrefs).not.toContain("/orders");
    expect(hrefs.length).toBeLessThanOrEqual(MAIN_BOTTOM_NAV_PREFETCH_MAX);
  });

  it("메신저 셸에서는 교차 탭 idle 프리페치 생략(미사용 preload·네트워크 경쟁 완화)", () => {
    expect(pickMainBottomNavPrefetchHrefs("/community-messenger/trade-chats", BOTTOM_NAV_ITEMS)).toEqual([]);
    expect(pickMainBottomNavPrefetchHrefs("/community-messenger?section=chats", BOTTOM_NAV_ITEMS)).toEqual([]);
  });

  it("동일 href 중복 탭이 있어도 seen 으로 한 번만", () => {
    const dupTabs = composeMainBottomNavDisplayTabs("/stores", [
      { id: "community", href: "/philife", label: "P", icon: "community" as const },
      { id: "home", href: "/market", label: "H", icon: "trade" as const },
      { id: "stores", href: "/stores", label: "S", icon: "stores" as const },
      { id: "chat", href: "/community-messenger?section=chats", label: "C", icon: "chat" as const },
      { id: "my", href: "/mypage", label: "M", icon: "my" as const },
    ]);
    const hrefs = pickMainBottomNavPrefetchHrefs("/stores", dupTabs);
    expect(hrefs.filter((h) => h === "/market").length).toBeLessThanOrEqual(1);
  });
});
