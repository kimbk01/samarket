import { describe, expect, it, beforeEach } from "vitest";
import {
  beginBrowsePrimaryPendingNav,
  clearBrowsePrimaryPendingNav,
  getBrowsePrimaryPendingNavSnapshot,
  resetBrowsePrimaryPendingNavForTests,
  resolveBrowsePrimaryTabActiveSlug,
  syncBrowsePrimaryNavSettled,
} from "@/lib/stores/browse-primary-tab-navigation";

describe("browse-primary-tab-navigation", () => {
  beforeEach(() => {
    resetBrowsePrimaryPendingNavForTests();
  });

  it("returns pathname when no pending navigation", () => {
    expect(resolveBrowsePrimaryTabActiveSlug("restaurant", null)).toBe("restaurant");
    expect(resolveBrowsePrimaryTabActiveSlug(null, null)).toBeNull();
  });

  it("shows pending target only during transition", () => {
    beginBrowsePrimaryPendingNav("cafe");
    expect(resolveBrowsePrimaryTabActiveSlug("restaurant", getBrowsePrimaryPendingNavSnapshot())).toBe(
      "cafe"
    );
    syncBrowsePrimaryNavSettled("cafe");
    expect(resolveBrowsePrimaryTabActiveSlug("cafe", null)).toBe("cafe");
  });

  it("clears pending on browse exit (B2 stale prevention)", () => {
    beginBrowsePrimaryPendingNav("restaurant");
    clearBrowsePrimaryPendingNav();
    expect(resolveBrowsePrimaryTabActiveSlug("cafe", null)).toBe("cafe");
  });
});
