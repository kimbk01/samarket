import { describe, expect, it } from "vitest";
import {
  isMarketplaceListSurfacePath,
  isTradePostDetailPath,
  marketplaceDetailStackDepth,
} from "@/lib/trade/marketplace/marketplace-detail-stack-slide";

describe("marketplaceDetailStackDepth", () => {
  it("trade post detail is depth 1", () => {
    expect(isTradePostDetailPath("/post/abc-1")).toBe(true);
    expect(marketplaceDetailStackDepth("/post/abc-1")).toBe(1);
  });

  it("market home and category browse are depth 0", () => {
    expect(isMarketplaceListSurfacePath("/market")).toBe(true);
    expect(isMarketplaceListSurfacePath("/market/jobs")).toBe(true);
    expect(marketplaceDetailStackDepth("/market")).toBe(0);
    expect(marketplaceDetailStackDepth("/market/jobs")).toBe(0);
  });

  it("search and seller hub list surfaces are depth 0", () => {
    expect(marketplaceDetailStackDepth("/search")).toBe(0);
    expect(marketplaceDetailStackDepth("/mypage/products")).toBe(0);
    expect(marketplaceDetailStackDepth("/market/sell")).toBe(0);
  });

  it("non-stack routes are -1", () => {
    expect(marketplaceDetailStackDepth("/philife")).toBe(-1);
    expect(marketplaceDetailStackDepth("/write")).toBe(-1);
  });
});
