/**
 * 광고 ② PB-21 (2026-11-04) — 커뮤니티 광고 중인 글 id 전체(20개 상한 없음 · 안전 상한 500).
 */
import { describe, expect, it, vi } from "vitest";
import {
  COMMUNITY_ACTIVE_PROMOTION_IDS_SAFETY_MAX,
  fetchActiveCommunityPromotedPostIds,
} from "@/lib/promotion/community-paid-exposure-feed";

type Row = Record<string, unknown>;

function fakeSb(orders: Row[], posts: Row[]) {
  const calls: { table: string; limit?: number; inIds?: string[] }[] = [];
  const sb = {
    from(table: string) {
      const call: { table: string; limit?: number; inIds?: string[] } = { table };
      calls.push(call);
      const chain = {
        select: () => chain,
        eq: () => chain,
        lte: () => chain,
        gte: () => chain,
        order: () => chain,
        limit: (n: number) => {
          call.limit = n;
          return chain;
        },
        in: (_c: string, ids: string[]) => {
          call.inIds = ids;
          return chain;
        },
        then: (resolve: (v: { data: Row[]; error: null }) => unknown) => {
          if (table === "point_promotion_orders") return resolve({ data: orders.slice(0, call.limit ?? orders.length), error: null });
          const set = new Set(call.inIds ?? []);
          return resolve({ data: posts.filter((p) => set.has(String(p.id))), error: null });
        },
      };
      return chain;
    },
  };
  return { sb: sb as never, calls };
}

const order = (i: number) => ({ target_id: `p${i}`, start_at: `2026-11-04T00:${String(60 - (i % 60)).padStart(2, "0")}:00Z` });
const post = (i: number, over: Row = {}) => ({ id: `p${i}`, topic_slug: "free", category: "free", is_hidden: false, status: "active", ...over });

describe("fetchActiveCommunityPromotedPostIds", () => {
  it("광고 21개 → 21개 모두 (예전 기본 20개 상한 없음), 결제 순서 유지", async () => {
    const orders = Array.from({ length: 21 }, (_, i) => order(i + 1));
    const posts = Array.from({ length: 21 }, (_, i) => post(i + 1));
    const { sb } = fakeSb(orders, posts);
    const r = await fetchActiveCommunityPromotedPostIds(sb);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.items.map((x) => x.postId)).toEqual(orders.map((o) => o.target_id));
    expect(r.truncated).toBe(false);
  });

  it("숨김·비공개·다른 주제 글은 빠지고, 같은 글 주문 2건은 1건으로", async () => {
    const orders = [order(1), order(2), order(3), order(4), { ...order(1) }];
    const posts = [post(1), post(2, { is_hidden: true }), post(3, { status: "deleted" }), post(4, { topic_slug: "travel" })];
    const { sb } = fakeSb(orders, posts);
    const all = await fetchActiveCommunityPromotedPostIds(sb);
    expect(all.ok && all.items.map((x) => x.postId)).toEqual(["p1", "p4"]);
    const free = await fetchActiveCommunityPromotedPostIds(sb, { topicFilter: "free" });
    expect(free.ok && free.items.map((x) => x.postId)).toEqual(["p1"]);
  });

  it("안전 상한 500 — 넘으면 기록하고 500개로 자른다 · 글 조회는 100개씩", async () => {
    expect(COMMUNITY_ACTIVE_PROMOTION_IDS_SAFETY_MAX).toBe(500);
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const orders = Array.from({ length: 520 }, (_, i) => order(i + 1));
    const posts = Array.from({ length: 520 }, (_, i) => post(i + 1));
    const { sb, calls } = fakeSb(orders, posts);
    const r = await fetchActiveCommunityPromotedPostIds(sb);
    expect(r.ok && r.items).toHaveLength(500);
    expect(r.ok && r.truncated).toBe(true);
    expect(warn).toHaveBeenCalledTimes(1);
    expect(calls[0]!.limit).toBe(501);
    const postCalls = calls.filter((c) => c.table === "community_posts");
    expect(postCalls).toHaveLength(5);
    for (const c of postCalls) expect(c.inIds!.length).toBeLessThanOrEqual(100);
    warn.mockRestore();
  });
});
