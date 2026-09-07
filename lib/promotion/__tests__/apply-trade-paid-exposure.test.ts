import { describe, expect, it } from "vitest";
import { applyTradePaidExposurePending } from "@/lib/promotion/apply-trade-paid-exposure";
import { getMemberPromotionProduct } from "@/lib/points/promotion-products";

describe("trade paid exposure admin path", () => {
  it("trade/community products skip admin approval (OWNER auto-live)", () => {
    expect(getMemberPromotionProduct("trade_promote_7")?.requiresAdminApproval).toBe(false);
    expect(getMemberPromotionProduct("trade_promote_14")?.requiresAdminApproval).toBe(false);
    expect(getMemberPromotionProduct("community_promote_3")?.requiresAdminApproval).toBe(false);
  });

  it("pending writer rejects catalog SKUs (immediate path is default)", async () => {
    const res = await applyTradePaidExposurePending({} as never, {
      userId: "u1",
      postId: "p1",
      productId: "trade_promote_7",
      idempotencyKey: "k1",
    });
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.error).toBe("invalid_product");
  });

  it("rejects community product ids", async () => {
    const res = await applyTradePaidExposurePending({} as never, {
      userId: "u1",
      postId: "p1",
      productId: "community_promote_3",
      idempotencyKey: "k1",
    });
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.error).toBe("invalid_product");
  });
});
