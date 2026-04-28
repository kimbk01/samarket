import { describe, expect, it } from "vitest";
import { BOTTOM_NAV_ITEMS } from "@/lib/main-menu/bottom-nav-config";
import {
  MAIN_BOTTOM_NAV_PREFETCH_MAX,
  isBottomNavTabActive,
  pickMainBottomNavPrefetchHrefs,
} from "@/lib/main-menu/main-bottom-nav-prefetch-pick";

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

describe("pickMainBottomNavPrefetchHrefs", () => {
  it("활성 탭 href 는 후보에서 제외(누락 방지 = 빈 배열이 아닌 나머지로 채움)", () => {
    const hrefs = pickMainBottomNavPrefetchHrefs("/philife/x", BOTTOM_NAV_ITEMS);
    expect(hrefs.every((h) => !isBottomNavTabActive("/philife/x", h))).toBe(true);
    expect(hrefs).toContain("/market");
    expect(hrefs).toContain("/stores");
    expect(hrefs).toContain("/community-messenger?section=chats");
    expect(hrefs).toContain("/mypage");
    expect(hrefs).not.toContain("/philife");
  });

  it("거래 표면에서는 거래·마켓 href 제외", () => {
    const hrefs = pickMainBottomNavPrefetchHrefs("/market/list", BOTTOM_NAV_ITEMS);
    expect(hrefs).not.toContain("/market");
    expect(hrefs.length).toBeLessThanOrEqual(MAIN_BOTTOM_NAV_PREFETCH_MAX);
  });

  it("동일 href 중복 탭이 있어도 seen 으로 한 번만", () => {
    const dupTabs = [
      { id: "a", href: "/market", label: "H", icon: "trade" as const },
      { id: "b", href: "/market", label: "H2", icon: "trade" as const },
      { id: "c", href: "/philife", label: "P", icon: "community" as const },
    ];
    const hrefs = pickMainBottomNavPrefetchHrefs("/stores", dupTabs);
    expect(hrefs.filter((h) => h === "/market").length).toBeLessThanOrEqual(1);
  });
});
