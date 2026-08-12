import { describe, expect, it } from "vitest";
import { writeCategoryCache } from "@/lib/categories/category-memory-cache";
import { primeTradeFeedCache } from "@/lib/posts/getPostsByCategory";
import {
  hydrateTradeMarketCategoryPeekCache,
  peekTradeMarketClientShell,
} from "@/lib/market/peek-trade-market-client-shell";
import type { CategoryWithSettings } from "@/lib/categories/types";

describe("peekTradeMarketClientShell", () => {
  it("returns null when category cache is missing", () => {
    expect(peekTradeMarketClientShell("unknown-slug-xyz")).toBeNull();
  });

  it("returns category and feed when caches are primed", () => {
    const category = {
      id: "cat-trade-1",
      slug: "trade-test",
      type: "trade",
      name_ko: "Trade",
    } as unknown as CategoryWithSettings;
    writeCategoryCache("cat:trade-test:trade-test", category);
    writeCategoryCache("children:cat-trade-1", []);
    primeTradeFeedCache(
      [],
      { page: 1, sort: "latest", tradeMarketParent: "cat-trade-1", topic: "" },
      { posts: [], hasMore: false, favoriteMap: {} }
    );

    const shell = peekTradeMarketClientShell("trade-test");
    expect(shell?.category.id).toBe("cat-trade-1");
    expect(shell?.tradeBootstrapFeed?.posts).toEqual([]);
  });

  it("hydrate writes cat keys so peek hits without bootstrap", () => {
    const category = {
      id: "50feae02-9fb9-4b59-8ab7-7e43a0f5c407",
      slug: "vehicle",
      type: "trade",
      name: "중고차",
    } as unknown as CategoryWithSettings;
    hydrateTradeMarketCategoryPeekCache(category, []);
    const shell = peekTradeMarketClientShell("50feae02-9fb9-4b59-8ab7-7e43a0f5c407");
    expect(shell?.category.id).toBe(category.id);
  });
});
