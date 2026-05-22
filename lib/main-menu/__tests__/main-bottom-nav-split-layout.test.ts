import { describe, expect, it, beforeEach, vi } from "vitest";
import { resolveMainBottomNavSecondaryRailKind } from "@/lib/main-menu/main-bottom-nav-split-layout";
import {
  mypageBottomNavOriginToSecondaryRail,
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
