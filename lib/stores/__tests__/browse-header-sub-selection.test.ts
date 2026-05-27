import { describe, expect, it } from "vitest";
import { STORES_BROWSE_SUB_ALL } from "@/components/stores/browse/stores-browse-paths";
import {
  resolveBrowseListQuerySub,
  resolveBrowseMatchedSubSlug,
  resolveBrowseSubChipActiveSlug,
  shouldCanonicalizeBrowseSubToAll,
} from "@/lib/stores/browse-header-sub-selection";

const subs = [
  { id: "1", slug: "korean", nameKo: "한식", primarySlug: "restaurant", sortOrder: 0, symbol: "" },
  { id: "2", slug: "chinese", nameKo: "중식", primarySlug: "restaurant", sortOrder: 1, symbol: "" },
];

describe("browse-header-sub-selection", () => {
  it("resolveBrowseMatchedSubSlug — no chip for all or empty", () => {
    expect(resolveBrowseMatchedSubSlug("", subs)).toBeNull();
    expect(resolveBrowseMatchedSubSlug(STORES_BROWSE_SUB_ALL, subs)).toBeNull();
    expect(resolveBrowseMatchedSubSlug("korean", subs)).toBe("korean");
  });

  it("resolveBrowseSubChipActiveSlug strips all", () => {
    expect(resolveBrowseSubChipActiveSlug(STORES_BROWSE_SUB_ALL, null)).toBeNull();
    expect(resolveBrowseSubChipActiveSlug("korean", null)).toBe("korean");
  });

  it("resolveBrowseListQuerySub defaults to all for list", () => {
    expect(resolveBrowseListQuerySub(null, null)).toBe(STORES_BROWSE_SUB_ALL);
    expect(resolveBrowseListQuerySub(STORES_BROWSE_SUB_ALL, null)).toBe(STORES_BROWSE_SUB_ALL);
    expect(resolveBrowseListQuerySub(null, "korean")).toBe("korean");
  });

  it("shouldCanonicalizeBrowseSubToAll", () => {
    expect(shouldCanonicalizeBrowseSubToAll("", subs)).toBe(true);
    expect(shouldCanonicalizeBrowseSubToAll(STORES_BROWSE_SUB_ALL, subs)).toBe(false);
    expect(shouldCanonicalizeBrowseSubToAll("korean", subs)).toBe(false);
    expect(shouldCanonicalizeBrowseSubToAll("unknown", subs)).toBe(true);
    expect(shouldCanonicalizeBrowseSubToAll("korean", [])).toBe(false);
  });
});
