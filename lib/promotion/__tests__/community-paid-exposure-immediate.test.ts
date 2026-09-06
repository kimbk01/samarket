import { describe, expect, it, vi } from "vitest";
import { applyCommunityPaidExposureImmediate } from "@/lib/promotion/apply-community-paid-exposure";

vi.mock("@/lib/ads/post-ads-supabase", () => ({
  resolveCanonicalCommunityPostIdForAds: vi.fn(async () => "post-1"),
}));

describe("applyCommunityPaidExposureImmediate (legacy A2 — blocked for HOLD catalog)", () => {
  it("rejects active community catalog SKUs (requiresAdminApproval=true)", async () => {
    const rpc = vi.fn();
    const sb = { from: () => ({}), rpc } as never;
    const res = await applyCommunityPaidExposureImmediate(sb, {
      userId: "user-1",
      postId: "post-1",
      productId: "community_promote_3",
      idempotencyKey: "idem-1",
      targetTitle: "Hello",
    });
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.error).toBe("invalid_product");
    expect(rpc).not.toHaveBeenCalled();
  });

  it("rejects legacy post_ads product ids before RPC", async () => {
    const rpc = vi.fn();
    const sb = { from: () => ({}), rpc } as never;
    const res = await applyCommunityPaidExposureImmediate(sb, {
      userId: "user-1",
      postId: "post-1",
      productId: "a0000001-0000-4000-8000-000000000001",
      idempotencyKey: "idem-x",
    });
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.error).toBe("invalid_product");
    expect(rpc).not.toHaveBeenCalled();
  });
});
