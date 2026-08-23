import { describe, expect, it } from "vitest";
import {
  browseListSortScopeKey,
  shouldResetBrowseListSortOnScopeChange,
} from "@/lib/stores/browse-list-sort-scope";

describe("browse-list-sort-scope", () => {
  it("scope key joins primary and sub", () => {
    expect(browseListSortScopeKey("restaurant", "all")).toBe("restaurant|all");
  });

  it("does not reset sort on mount when scope unchanged (URL sort=popular preserved)", () => {
    const key = browseListSortScopeKey("restaurant", "all");
    expect(shouldResetBrowseListSortOnScopeChange(key, key)).toBe(false);
  });

  it("resets sort when sub tab changes", () => {
    const prev = browseListSortScopeKey("restaurant", "all");
    const next = browseListSortScopeKey("restaurant", "cafe");
    expect(shouldResetBrowseListSortOnScopeChange(prev, next)).toBe(true);
  });

  it("resets sort when primary industry changes", () => {
    const prev = browseListSortScopeKey("restaurant", "all");
    const next = browseListSortScopeKey("pet", "all");
    expect(shouldResetBrowseListSortOnScopeChange(prev, next)).toBe(true);
  });
});
