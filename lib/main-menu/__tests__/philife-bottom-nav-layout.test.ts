import { describe, expect, it } from "vitest";
import {
  composePhilifeBottomNavDisplayTabs,
  isPhilifeConsumerBottomNavSurface,
  isPhilifeHomeHubBottomNavActive,
} from "@/lib/main-menu/philife-bottom-nav-layout";
import { composeMainBottomNavDisplayTabs } from "@/lib/main-menu/main-bottom-nav-split-layout";
import { BOTTOM_NAV_ITEMS } from "@/lib/main-menu/bottom-nav-config";

describe("composePhilifeBottomNavDisplayTabs", () => {
  it("5탭 순서 — 홈·거래·배달·디바톡·내정보", () => {
    const tabs = composePhilifeBottomNavDisplayTabs();
    expect(tabs.map((t) => t.id)).toEqual([
      "philife-home-hub",
      "philife-trade",
      "philife-delivery",
      "philife-messenger",
      "philife-my",
    ]);
    expect(tabs.find((t) => t.id === "philife-home-hub")?.href).toBe("/philife");
    expect(tabs.find((t) => t.id === "philife-home-hub")?.labelKey).toBe("nav.home");
    expect(tabs.find((t) => t.id === "philife-messenger")?.labelKey).toBe("nav.chat");
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
  it("/philife — admin main-bottom-nav 과 동일 5탭", () => {
    const tabs = composeMainBottomNavDisplayTabs("/philife", BOTTOM_NAV_ITEMS, null);
    expect(tabs.map((t) => t.id)).toEqual(BOTTOM_NAV_ITEMS.map((t) => t.id));
  });

  it("/community-messenger?from=community — 경로와 무관하게 admin 탭", () => {
    const tabs = composeMainBottomNavDisplayTabs("/community-messenger", BOTTOM_NAV_ITEMS, {
      get: (k) => (k === "from" ? "community" : k === "section" ? "chats" : null),
    });
    expect(tabs.map((t) => t.id)).toEqual(BOTTOM_NAV_ITEMS.map((t) => t.id));
  });
});
