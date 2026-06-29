import { describe, expect, it, vi, beforeEach } from "vitest";
import { BOTTOM_NAV_ITEMS } from "@/lib/main-menu/bottom-nav-config";
import {
  collectBottomNavBootPrewarmHrefs,
  resetBottomNavBootIdlePrewarmForTests,
  shouldBootPrewarmBottomNavHref,
} from "@/lib/main-menu/bottom-nav-boot-idle-prewarm";

vi.mock("@/lib/platform/capacitor-native", () => ({
  isCapacitorNativePlatform: vi.fn(() => true),
}));

vi.mock("@/lib/auth/get-current-user", () => ({
  getCurrentUser: vi.fn(() => null),
}));

describe("bottom-nav-boot-idle-prewarm", () => {
  beforeEach(() => {
    resetBottomNavBootIdlePrewarmForTests();
  });

  it("collects inactive tab hrefs excluding current philife shell and guest-only tabs", () => {
    const hrefs = collectBottomNavBootPrewarmHrefs("/philife", BOTTOM_NAV_ITEMS);
    expect(hrefs).not.toContain("/philife");
    expect(hrefs).toContain("/market");
    expect(hrefs).toContain("/stores");
    expect(hrefs).not.toContain("/mypage");
    expect(hrefs.some((h) => h.startsWith("/community-messenger"))).toBe(false);
    expect(hrefs.length).toBe(2);
  });

  it("skips mypage prewarm for guest", () => {
    expect(shouldBootPrewarmBottomNavHref("/mypage")).toBe(false);
  });

  it("skips messenger prewarm for guest", () => {
    expect(shouldBootPrewarmBottomNavHref("/community-messenger?section=chats")).toBe(false);
  });
});
