import { describe, expect, it, vi } from "vitest";
import { applyCommunityPaidExposureImmediate } from "@/lib/promotion/apply-community-paid-exposure";

vi.mock("@/lib/ads/post-ads-supabase", () => ({
  resolveCanonicalCommunityPostIdForAds: vi.fn(async () => "post-1"),
}));

describe("applyCommunityPaidExposureImmediate (A2 atomic RPC)", () => {
  it("calls purchase_member_community_promotion and returns active", async () => {
    const rpc = vi.fn(async () => ({
      data: {
        ok: true,
        order_id: "ord-1",
        status: "active",
        start_at: "2026-08-10T00:00:00.000Z",
        end_at: "2026-08-13T00:00:00.000Z",
        point_cost: 10000,
        product_id: "community_promote_3",
      },
      error: null,
    }));
    const sb = {
      from(table: string) {
        return {
          select() {
            return this;
          },
          eq() {
            return this;
          },
          maybeSingle: async () => {
            if (table === "community_posts") {
              return {
                data: { id: "post-1", title: "Hello", user_id: "user-1", status: "active" },
                error: null,
              };
            }
            return { data: null, error: null };
          },
        };
      },
      rpc,
    } as never;

    const res = await applyCommunityPaidExposureImmediate(sb, {
      userId: "user-1",
      postId: "post-1",
      productId: "community_promote_3",
      idempotencyKey: "idem-1",
      targetTitle: "Hello",
    });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.status).toBe("active");
    expect(res.orderId).toBe("ord-1");
    expect(res.pointCost).toBe(10000);
    expect(rpc).toHaveBeenCalledWith(
      "purchase_member_community_promotion",
      expect.objectContaining({
        p_user_id: "user-1",
        p_target_id: "post-1",
        p_product_id: "community_promote_3",
        p_point_cost: 10000,
        p_idempotency_key: "idem-1",
      })
    );
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

  it("maps insufficient_balance from RPC", async () => {
    const sb = {
      from() {
        return {
          select() {
            return this;
          },
          eq() {
            return this;
          },
          maybeSingle: async () => ({
            data: { id: "post-1", title: "Hello", user_id: "user-1", status: "active" },
            error: null,
          }),
        };
      },
      rpc: async () => ({
        data: { ok: false, error: "insufficient_balance" },
        error: null,
      }),
    } as never;
    const res = await applyCommunityPaidExposureImmediate(sb, {
      userId: "user-1",
      postId: "post-1",
      productId: "community_promote_3",
      idempotencyKey: "idem-bal",
    });
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.error).toBe("insufficient_balance");
  });
});
