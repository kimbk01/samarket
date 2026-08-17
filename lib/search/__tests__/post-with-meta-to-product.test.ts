import { describe, expect, it } from "vitest";
import type { PostWithMeta } from "@/lib/posts/schema";
import { postWithMetaToSearchProduct } from "@/lib/search/post-with-meta-to-product";
import { TRADE_PROMOTION_PROJECTION } from "@/lib/promotion/trade-promotion-overlay";
import { resolveMarketplacePublicListingStatus } from "@/lib/trade/marketplace/public-listing-status";

function mk(partial: Partial<PostWithMeta> & Pick<PostWithMeta, "id">): PostWithMeta {
  return {
    title: "x",
    status: "active",
    created_at: "2026-01-01T00:00:00.000Z",
    ...partial,
  } as PostWithMeta;
}

describe("postWithMetaToSearchProduct promotion overlay", () => {
  it("copies promotion overlay without turning it into listing status or isBoosted", () => {
    const product = postWithMetaToSearchProduct(
      mk({
        id: "p1",
        status: "reserved",
        seller_listing_state: "reserved",
        meta: { promotion_projection: TRADE_PROMOTION_PROJECTION },
      })
    );
    expect(product.hasPromotionOverlay).toBe(true);
    expect(product.isBoosted).toBe(false);
    expect(
      resolveMarketplacePublicListingStatus({
        status: product.status,
        seller_listing_state: product.sellerListingState,
      })
    ).toBe("active");
    expect(product.status).not.toBe("sold");
  });

  it("does not invent overlay when projection is absent", () => {
    const product = postWithMetaToSearchProduct(mk({ id: "p2", status: "active" }));
    expect(product.hasPromotionOverlay).toBe(false);
    expect(product.isBoosted).toBe(false);
  });

  it("preserves overlay through search mapper without duplicating boost", () => {
    const product = postWithMetaToSearchProduct(
      mk({
        id: "p3",
        meta: { promotion_projection: TRADE_PROMOTION_PROJECTION },
      })
    );
    expect(product.hasPromotionOverlay).toBe(true);
    expect(product.isBoosted).toBe(false);
  });
});
