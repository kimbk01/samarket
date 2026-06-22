import { describe, expect, it, beforeEach, vi } from "vitest";
import {
  composeMainBottomNavDisplayTabs,
  resolveMainBottomNavSecondaryRailKind,
} from "@/lib/main-menu/main-bottom-nav-split-layout";
import { BOTTOM_NAV_ITEMS } from "@/lib/main-menu/bottom-nav-config";
import {
  mypageBottomNavOriginToSecondaryRail,
  resolveMypageBackFallbackHref,
  writeStoredMypageBackPath,
  writeStoredMypageBottomNavOrigin,
} from "@/lib/main-menu/mypage-bottom-nav-origin";

const sessionMock: Record<string, string> = {};

describe("resolveMainBottomNavSecondaryRailKind", () => {
  beforeEach(() => {
    for (const k of Object.keys(sessionMock)) delete sessionMock[k];
    vi.stubGlobal("sessionStorage", {
      getItem: (key: string) => sessionMock[key] ?? null,
      setItem: (key: string, value: string) => {
        sessionMock[key] = value;
      },
      removeItem: (key: string) => {
        delete sessionMock[key];
      },
      clear: () => {
        for (const k of Object.keys(sessionMock)) delete sessionMock[k];
      },
    });
  });
  it("메신저 trade-chats 경로는 from 없어도 trade 레일", () => {
    expect(resolveMainBottomNavSecondaryRailKind("/community-messenger/trade-chats", null)).toBe("trade");
  });

  it("메신저 delivery-chats 경로는 stores 레일", () => {
    expect(resolveMainBottomNavSecondaryRailKind("/community-messenger/delivery-chats", null)).toBe("stores");
  });

  it("/mypage/section/store — 배달 5탭 레일", () => {
    expect(resolveMainBottomNavSecondaryRailKind("/mypage/section/store", null)).toBe("stores");
  });

  it("mypageBottomNavOriginToSecondaryRail", () => {
    expect(mypageBottomNavOriginToSecondaryRail("delivery")).toBe("stores");
    expect(mypageBottomNavOriginToSecondaryRail("trade")).toBe("trade");
    expect(mypageBottomNavOriginToSecondaryRail("community")).toBe("philife");
    expect(mypageBottomNavOriginToSecondaryRail(null)).toBe("philife");
  });

  it("resolveMypageBackFallbackHref — 직전 경로 우선", () => {
    writeStoredMypageBottomNavOrigin("delivery");
    writeStoredMypageBackPath("/stores/browse/restaurant?sub=all");
    expect(resolveMypageBackFallbackHref()).toBe("/stores/browse/restaurant?sub=all");
    writeStoredMypageBackPath("/mypage/settings");
    expect(resolveMypageBackFallbackHref()).toBe("/stores/browse/restaurant?sub=all");
    delete sessionMock["sam.mypage.backPath.v1"];
    expect(resolveMypageBackFallbackHref()).toBe("/stores");
  });

  it("/mypage — 직전 셸 origin 으로 레일 복원", () => {
    writeStoredMypageBottomNavOrigin("delivery");
    expect(resolveMainBottomNavSecondaryRailKind("/mypage", null)).toBe("stores");
    writeStoredMypageBottomNavOrigin("trade");
    expect(resolveMainBottomNavSecondaryRailKind("/mypage", null)).toBe("trade");
  });

  it("/orders·/mypage/store-orders — 배달 레일(stores)", () => {
    expect(resolveMainBottomNavSecondaryRailKind("/orders", null)).toBe("stores");
    expect(resolveMainBottomNavSecondaryRailKind("/orders/store/x", null)).toBe("stores");
    expect(resolveMainBottomNavSecondaryRailKind("/mypage/store-orders", null)).toBe("stores");
  });
});

describe("composeMainBottomNavDisplayTabs", () => {
  it("경로·레일과 무관하게 admin sourceTabs 순서를 그대로 쓴다", () => {
    const custom = [
      { id: "my", href: "/mypage", label: "My", icon: "my" as const },
      { id: "community", href: "/philife", label: "P", icon: "community" as const },
    ];
    expect(composeMainBottomNavDisplayTabs("/market", custom).map((t) => t.id)).toEqual(["my", "community"]);
    expect(composeMainBottomNavDisplayTabs("/stores", BOTTOM_NAV_ITEMS).map((t) => t.id)).toEqual(
      BOTTOM_NAV_ITEMS.map((t) => t.id)
    );
  });

  it("sourceTabs 가 비어 있으면 BOTTOM_NAV_ITEMS fallback", () => {
    expect(composeMainBottomNavDisplayTabs("/philife", []).map((t) => t.id)).toEqual(
      BOTTOM_NAV_ITEMS.map((t) => t.id)
    );
  });
});
