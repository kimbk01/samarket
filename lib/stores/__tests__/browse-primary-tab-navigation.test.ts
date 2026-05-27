import { describe, expect, it } from "vitest";
import { resolveBrowsePrimaryTabActiveSlug } from "@/lib/stores/browse-primary-tab-navigation";

describe("resolveBrowsePrimaryTabActiveSlug", () => {
  it("prefers optimistic slug over pathname", () => {
    expect(resolveBrowsePrimaryTabActiveSlug("restaurant", "cafe")).toBe("cafe");
  });

  it("falls back to pathname when optimistic is null", () => {
    expect(resolveBrowsePrimaryTabActiveSlug("restaurant", null)).toBe("restaurant");
  });

  it("returns null when both are null", () => {
    expect(resolveBrowsePrimaryTabActiveSlug(null, null)).toBeNull();
  });
});
