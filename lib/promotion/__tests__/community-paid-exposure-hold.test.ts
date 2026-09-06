import { describe, expect, it, vi, beforeEach } from "vitest";
import {
  applyCommunityPaidExposurePending,
  approveCommunityPaidExposure,
  rejectCommunityPaidExposure,
  cancelCommunityPaidExposure,
} from "@/lib/promotion/apply-community-paid-exposure";
import { getMemberPromotionProduct } from "@/lib/points/promotion-products";

const holdPoints = vi.fn();
const captureHeld = vi.fn();
const releaseHeld = vi.fn();

vi.mock("@/lib/ads/post-ads-supabase", () => ({
  resolveCanonicalCommunityPostIdForAds: vi.fn(async () => "post-1"),
}));

vi.mock("@/lib/promotion/promotion-point-hold-flow", () => ({
  holdPointsForPromotionOrder: (...args: unknown[]) => holdPoints(...args),
  captureHeldPointsForPromotionOrder: (...args: unknown[]) => captureHeld(...args),
  releaseHeldPointsForPromotionOrder: (...args: unknown[]) => releaseHeld(...args),
}));

function pendingApplySb() {
  const chain = {
    select() {
      return chain;
    },
    eq() {
      return chain;
    },
    in() {
      return chain;
    },
    limit() {
      return chain;
    },
    delete() {
      return chain;
    },
    insert: async () => ({ error: null }),
    maybeSingle: async (): Promise<{ data: unknown; error: null }> => {
      // idempotency miss, then community_posts owned
      return {
        data: { id: "post-1", title: "Hello", user_id: "user-1", status: "active" },
        error: null,
      };
    },
    then(resolve: (v: { data: unknown[]; error: null }) => void) {
      resolve({ data: [], error: null });
    },
  };
  // First maybeSingle is idempotency on point_promotion_orders — return null
  let maybeN = 0;
  chain.maybeSingle = async (): Promise<{ data: unknown; error: null }> => {
    maybeN += 1;
    if (maybeN === 1) return { data: null, error: null };
    return {
      data: { id: "post-1", title: "Hello", user_id: "user-1", status: "active" },
      error: null,
    };
  };
  return {
    from() {
      return chain;
    },
  } as never;
}

describe("community Boost HOLD → CAPTURE / RELEASE", () => {
  beforeEach(() => {
    holdPoints.mockReset();
    captureHeld.mockReset();
    releaseHeld.mockReset();
    holdPoints.mockResolvedValue({ ok: true, holdId: "hold-1" });
    captureHeld.mockResolvedValue({ ok: true });
    releaseHeld.mockResolvedValue({ ok: true });
  });

  it("catalog SKUs require Admin approval (HOLD default path)", () => {
    expect(getMemberPromotionProduct("community_promote_3")?.requiresAdminApproval).toBe(true);
    expect(getMemberPromotionProduct("community_promote_7")?.requiresAdminApproval).toBe(true);
  });

  it("pending apply HOLDs points and returns pending_review", async () => {
    const sb = pendingApplySb();
    const res = await applyCommunityPaidExposurePending(sb, {
      userId: "user-1",
      postId: "post-1",
      productId: "community_promote_3",
      idempotencyKey: "idem-hold-1",
      targetTitle: "Hello",
    });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.status).toBe("pending_review");
    expect(res.pointCost).toBe(10000);
    expect(holdPoints).toHaveBeenCalledWith(
      sb,
      expect.objectContaining({
        userId: "user-1",
        pointCost: 10000,
        orderId: res.orderId,
      })
    );
  });

  it("approve CAPTUREs held points", async () => {
    let phase = 0;
    const sb = {
      from() {
        return {
          select() {
            return this;
          },
          eq() {
            return this;
          },
          update() {
            return this;
          },
          maybeSingle: async () => {
            phase += 1;
            if (phase === 1) {
              return {
                data: {
                  id: "ord-1",
                  order_status: "pending_review",
                  domain: "community",
                  user_id: "user-1",
                  point_cost: 10000,
                  duration_days: 3,
                },
                error: null,
              };
            }
            return { data: { id: "ord-1" }, error: null };
          },
        };
      },
    } as never;

    const res = await approveCommunityPaidExposure(sb, {
      orderId: "ord-1",
      adminUserId: "admin-1",
    });
    expect(res.ok).toBe(true);
    expect(captureHeld).toHaveBeenCalledWith(
      sb,
      expect.objectContaining({ orderId: "ord-1", userId: "user-1", pointCost: 10000 })
    );
  });

  it("reject RELEASEs held points", async () => {
    let phase = 0;
    const sb = {
      from() {
        return {
          select() {
            return this;
          },
          eq() {
            return this;
          },
          update() {
            return this;
          },
          maybeSingle: async () => {
            phase += 1;
            if (phase === 1) {
              return {
                data: { id: "ord-1", order_status: "pending_review", domain: "community" },
                error: null,
              };
            }
            return { data: { id: "ord-1" }, error: null };
          },
        };
      },
    } as never;

    const res = await rejectCommunityPaidExposure(sb, {
      orderId: "ord-1",
      reason: "creative quality",
    });
    expect(res.ok).toBe(true);
    expect(releaseHeld).toHaveBeenCalledWith(sb, { orderId: "ord-1" });
  });

  it("member cancel RELEASEs held points", async () => {
    let phase = 0;
    const sb = {
      from() {
        return {
          select() {
            return this;
          },
          eq() {
            return this;
          },
          update() {
            return this;
          },
          maybeSingle: async () => {
            phase += 1;
            if (phase === 1) {
              return {
                data: {
                  id: "ord-1",
                  order_status: "pending_review",
                  domain: "community",
                  user_id: "user-1",
                },
                error: null,
              };
            }
            return { data: { id: "ord-1" }, error: null };
          },
        };
      },
    } as never;

    const res = await cancelCommunityPaidExposure(sb, {
      orderId: "ord-1",
      userId: "user-1",
    });
    expect(res.ok).toBe(true);
    expect(releaseHeld).toHaveBeenCalledWith(sb, { orderId: "ord-1" });
  });
});
