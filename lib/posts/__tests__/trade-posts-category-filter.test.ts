import { describe, expect, it } from "vitest";
import {
  buildTradePostsStatusAndCategoryAndFilter,
  buildTradePostsStatusAndTradeCategoryOnlyAndFilter,
} from "@/lib/posts/trade-posts-category-filter";

describe("buildTradePostsStatusAndCategoryAndFilter", () => {
  it("uses trade_category_id only — never posts.category_id", () => {
    const and = buildTradePostsStatusAndCategoryAndFilter(["vehicle-root"]);
    expect(and).toContain("trade_category_id.in.(vehicle-root)");
    expect(and).not.toMatch(/(?:^|[,()])category_id\.in/);
    expect(and).toBe(buildTradePostsStatusAndTradeCategoryOnlyAndFilter(["vehicle-root"]));
  });
});
