import { describe, expect, it } from "vitest";
import {
  composePhilifeBottomNavDisplayTabs,
  isPhilifeConsumerBottomNavSurface,
  isPhilifeHomeHubBottomNavActive,
} from "@/lib/main-menu/philife-bottom-nav-layout";
import { composeMainBottomNavDisplayTabs } from "@/lib/main-menu/main-bottom-nav-split-layout";
import { BOTTOM_NAV_ITEMS } from "@/lib/main-menu/bottom-nav-config";

describe("composePhilifeBottomNavDisplayTabs", () => {
  it("5탭 순서 — 거래·배달·커뮤니티홈·메신저·내정보", () => {
    const tabs = composePhilifeBottomNavDisplayTabs();
    expect(tabs.map((t) => t.id)).toEqual([
      "philife-trade",
      "philife-delivery",
      "philife-home-hub",
      "philife-messenger",
      "philife-my",
    ]);
    expect(tabs.find((t) => t.id === "philife-home-hub")?.href).toBe("/philife");
    expect(tabs.find((t) => t.id === "philife-trade")?.href).toBe("/market");
    expect(tabs.find((t) => t.id === "philife-delivery")?.href).toBe("/stores");
  });
});

describe("isPhilifeConsumerBottomNavSurface", () => {
  it("/philife·/community", () => {
    expect(isPhilifeConsumerBottomNavSurface("/philife")).toBe(true);
    expect(isPhilifeConsumerBottomNavSurface("/philife/board/x")).toBe(true);
    expect(isPhilifeConsumerBottomNavSurface("/community/post/x")).toBe(true);
    expect(isPhilifeConsumerBottomNavSurface("/market")).toBe(false);
  });
});

describe("isPhilifeHomeHubBottomNavActive", () => {
  it("커뮤니티 루트 접두", () => {
    expect(isPhilifeHomeHubBottomNavActive("/philife")).toBe(true);
    expect(isPhilifeHomeHubBottomNavActive("/community")).toBe(true);
    expect(isPhilifeHomeHubBottomNavActive("/market")).toBe(false);
  });
});

describe("composeMainBottomNavDisplayTabs (philife rail)", () => {
  it("/philife — 커뮤니티 5탭", () => {
    const tabs = composeMainBottomNavDisplayTabs("/philife", BOTTOM_NAV_ITEMS, null);
    expect(tabs).toHaveLength(5);
    expect(tabs.some((t) => t.id === "community")).toBe(false);
    expect(tabs.some((t) => t.id === "philife-home-hub")).toBe(true);
  });

  it("/community-messenger?from=community — philife 5탭", () => {
    const tabs = composeMainBottomNavDisplayTabs("/community-messenger", BOTTOM_NAV_ITEMS, {
      get: (k) => (k === "from" ? "community" : k === "section" ? "chats" : null),
    });
    expect(tabs).toHaveLength(5);
    expect(tabs.map((t) => t.id)).toEqual([
      "philife-trade",
      "philife-delivery",
      "philife-home-hub",
      "philife-messenger",
      "philife-my",
    ]);
  });
});
