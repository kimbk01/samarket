import { describe, expect, it } from "vitest";
import {
  STORES_BROWSE_SUB_ALL,
  storesBrowseNavSubSlug,
  storesBrowsePath,
  storesBrowsePrimaryPath,
} from "@/components/stores/browse/stores-browse-paths";

describe("stores-browse-paths", () => {
  it("primary path canonicalizes to sub=all", () => {
    expect(storesBrowsePrimaryPath("restaurant")).toBe("/stores/browse/restaurant?sub=all");
  });

  it("topic path sets sub query", () => {
    expect(storesBrowsePath("restaurant", "chicken")).toContain("sub=chicken");
  });

  it("nav sub slug normalizes all", () => {
    expect(storesBrowseNavSubSlug("all")).toBe(STORES_BROWSE_SUB_ALL);
    expect(storesBrowseNavSubSlug("  ALL ")).toBe(STORES_BROWSE_SUB_ALL);
    expect(storesBrowseNavSubSlug("chicken")).toBe("chicken");
  });
});
