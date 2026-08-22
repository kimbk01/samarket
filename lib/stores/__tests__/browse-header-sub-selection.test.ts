import { describe, expect, it, beforeEach } from "vitest";
import { STORES_BROWSE_SUB_ALL } from "@/components/stores/browse/stores-browse-paths";
import {
  resolveBrowseListQuerySub,
  resolveBrowseMatchedSubSlug,
  resolveBrowseSubChipActiveSlug,
  shouldCanonicalizeBrowseSubToAll,
} from "@/lib/stores/browse-header-sub-selection";
import {
  beginBrowseSubPendingNav,
  clearBrowseSubPendingNav,
  getBrowseSubPendingNavSnapshot,
  resetBrowseSubPendingNavForTests,
  syncBrowseSubNavSettled,
} from "@/lib/stores/browse-sub-chip-navigation";

const subs = [
  { id: "1", slug: "korean", nameKo: "한식", primarySlug: "restaurant", sortOrder: 0, symbol: "" },
  { id: "2", slug: "chinese", nameKo: "중식", primarySlug: "restaurant", sortOrder: 1, symbol: "" },
  { id: "3", slug: "chicken", nameKo: "치킨", primarySlug: "restaurant", sortOrder: 2, symbol: "" },
];

describe("browse-header-sub-selection", () => {
  beforeEach(() => {
    resetBrowseSubPendingNavForTests();
  });

  it("resolveBrowseMatchedSubSlug — no chip for all or empty", () => {
    expect(resolveBrowseMatchedSubSlug("", subs)).toBeNull();
    expect(resolveBrowseMatchedSubSlug(STORES_BROWSE_SUB_ALL, subs)).toBeNull();
    expect(resolveBrowseMatchedSubSlug("korean", subs)).toBe("korean");
  });

  it("resolveBrowseSubChipActiveSlug — URL wins when no pending", () => {
    expect(resolveBrowseSubChipActiveSlug("", STORES_BROWSE_SUB_ALL, "restaurant", null)).toBeNull();
    expect(resolveBrowseSubChipActiveSlug("korean", null, "restaurant", null)).toBe("korean");
    expect(resolveBrowseSubChipActiveSlug("korean", "chinese", "restaurant", null)).toBe("chinese");
  });

  it("resolveBrowseSubChipActiveSlug — pending during transition only (B3)", () => {
    beginBrowseSubPendingNav("restaurant", "chicken");
    expect(
      resolveBrowseSubChipActiveSlug(
        "korean",
        "korean",
        "restaurant",
        getBrowseSubPendingNavSnapshot()
      )
    ).toBe("chicken");
    syncBrowseSubNavSettled("restaurant", "chicken");
    expect(resolveBrowseSubChipActiveSlug("chicken", "chicken", "restaurant", null)).toBe("chicken");
  });

  it("resolveBrowseListQuerySub defaults to all for list", () => {
    expect(resolveBrowseListQuerySub("", null, "restaurant", null)).toBe(STORES_BROWSE_SUB_ALL);
    expect(resolveBrowseListQuerySub("", STORES_BROWSE_SUB_ALL, "restaurant", null)).toBe(
      STORES_BROWSE_SUB_ALL
    );
    expect(resolveBrowseListQuerySub("", null, "restaurant", null)).toBe(STORES_BROWSE_SUB_ALL);
    expect(resolveBrowseListQuerySub("korean", null, "restaurant", null)).toBe(STORES_BROWSE_SUB_ALL);
    expect(resolveBrowseListQuerySub("unknown", null, "restaurant", null)).toBe(STORES_BROWSE_SUB_ALL);
  });

  it("resolveBrowseListQuerySub — pending sub during transition", () => {
    beginBrowseSubPendingNav("restaurant", "chicken");
    expect(
      resolveBrowseListQuerySub("korean", "korean", "restaurant", getBrowseSubPendingNavSnapshot())
    ).toBe("chicken");
    clearBrowseSubPendingNav();
    expect(resolveBrowseListQuerySub("chicken", "chicken", "restaurant", null)).toBe("chicken");
  });

  it("shouldCanonicalizeBrowseSubToAll", () => {
    expect(shouldCanonicalizeBrowseSubToAll("", subs)).toBe(true);
    expect(shouldCanonicalizeBrowseSubToAll(STORES_BROWSE_SUB_ALL, subs)).toBe(false);
    expect(shouldCanonicalizeBrowseSubToAll("korean", subs)).toBe(false);
    expect(shouldCanonicalizeBrowseSubToAll("unknown", subs)).toBe(true);
    expect(shouldCanonicalizeBrowseSubToAll("korean", [])).toBe(false);
  });
});
