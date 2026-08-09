import { describe, expect, it, vi } from "vitest";
import { applyCommunityPaidExposureImmediate } from "@/lib/promotion/apply-community-paid-exposure";

vi.mock("@/lib/ads/post-ads-supabase", () => ({
  resolveCanonicalCommunityPostIdForAds: vi.fn(async () => "post-1"),
}));

vi.mock("@/lib/points/user-point-ledger", () => ({
  spendUserPoints: vi.fn(async () => ({ ok: true, balanceAfter: 9000 })),
  creditUserPoints: vi.fn(async () => ({ ok: true, balanceAfter: 10000 })),
}));

type Row = Record<string, unknown>;

function makeSb(state: {
  orders: Row[];
  post: Row;
}) {
  return {
    from(table: string) {
      const filters: { col: string; val: unknown }[] = [];
      let mode: "select" | "insert" = "select";
      let payload: Row | null = null;
      const api: Record<string, unknown> = {
        select() {
          return api;
        },
        insert(row: Row) {
          mode = "insert";
          payload = row;
          return api;
        },
        eq(col: string, val: unknown) {
          filters.push({ col, val });
          return api;
        },
        in(col: string, vals: unknown[]) {
          filters.push({ col, val: vals });
          return api;
        },
        limit() {
          return api;
        },
        maybeSingle: async () => {
          if (table === "community_posts") {
            return { data: state.post, error: null };
          }
          if (table === "point_promotion_orders" && mode === "select") {
            const hit = state.orders.find((o) =>
              filters.every((f) => {
                if (Array.isArray(f.val)) return (f.val as unknown[]).includes(o[f.col]);
                return String(o[f.col]) === String(f.val);
              })
            );
            return { data: hit ?? null, error: null };
          }
          return { data: null, error: null };
        },
        then(resolve: (v: unknown) => void) {
          if (table === "point_promotion_orders" && mode === "insert" && payload) {
            state.orders.push(payload);
            resolve({ data: null, error: null });
            return;
          }
          if (table === "point_promotion_orders") {
            const rows = state.orders.filter((o) =>
              filters.every((f) => {
                if (Array.isArray(f.val)) return (f.val as unknown[]).includes(o[f.col]);
                return String(o[f.col]) === String(f.val);
              })
            );
            resolve({ data: rows, error: null });
            return;
          }
          resolve({ data: null, error: null });
        },
      };
      return api;
    },
  };
}

describe("applyCommunityPaidExposureImmediate (A2)", () => {
  it("spends points and inserts active community_post entitlement", async () => {
    const state = {
      orders: [] as Row[],
      post: { id: "post-1", title: "Hello", user_id: "user-1", status: "active" },
    };
    const sb = makeSb(state) as never;
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
    expect(res.pointCost).toBe(10000);
    expect(state.orders).toHaveLength(1);
    expect(state.orders[0]?.order_status).toBe("active");
    expect(state.orders[0]?.target_type).toBe("community_post");
    expect(state.orders[0]?.domain).toBe("community");
  });

  it("rejects legacy post_ads product ids", async () => {
    const state = {
      orders: [] as Row[],
      post: { id: "post-1", title: "Hello", user_id: "user-1", status: "active" },
    };
    const sb = makeSb(state) as never;
    const res = await applyCommunityPaidExposureImmediate(sb, {
      userId: "user-1",
      postId: "post-1",
      productId: "a0000001-0000-4000-8000-000000000001",
      idempotencyKey: "idem-x",
    });
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.error).toBe("invalid_product");
  });
});
