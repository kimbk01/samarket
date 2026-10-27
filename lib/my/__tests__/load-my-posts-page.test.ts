import { describe, expect, it } from "vitest";
import { loadMyPostsPageServer, loadMyPostsServer } from "@/lib/my/load-my-posts-server";
import { filterMyProductsByListingAxis } from "@/lib/products/my-product-listing-filter";
import { parseMypageListCursor } from "@/lib/mypage/mypage-list-cursor";
import { POSTS_TABLE_READ } from "@/lib/posts/posts-db-tables";
import type { Product } from "@/lib/types/product";
import { createFakeSupabase } from "@/lib/mypage/__tests__/helpers/fake-postgrest";

/** S20 · A1 — `/api/my/posts` 페이지 모드(옵트인) */
function seed() {
  const statuses = ["active", "sold", "hidden", "active", "blinded", "active", "sold"];
  const rows = Array.from({ length: 230 }, (_, i) => ({
    id: `p${String(i).padStart(3, "0")}`,
    title: `t${i}`,
    content: "",
    price: i,
    status: statuses[i % statuses.length],
    seller_listing_state: i % statuses.length === 1 ? "completed" : null,
    images: [],
    thumbnail_url: null,
    view_count: 0,
    created_at: "2026-01-01T00:00:00Z",
    // 일부 같은 시각 — keyset 의 id 보조 정렬 확인
    updated_at: `2026-10-${String(1 + Math.floor(i / 10)).padStart(2, "0")}T00:00:00Z`,
    user_id: "u1",
    owner_state: "none",
    region: "",
    city: "",
  }));
  rows.push({ ...rows[0]!, id: "other", user_id: "u2" });
  /** 거래 계획 1단계 M-1: 판매자가 삭제한 글 — 어떤 목록에도 나오지 않아야 한다 */
  rows.push({ ...rows[0]!, id: "deleted-own", owner_state: "owner_deleted", status: "hidden" });
  return { [POSTS_TABLE_READ]: rows, point_promotion_orders: [] as Record<string, unknown>[] };
}

async function collectAll(db: ReturnType<typeof seed>, filter: "all" | "active" | "sold" | "hidden", promotedOnly = false) {
  const sb = createFakeSupabase(db);
  const ids: string[] = [];
  let cursor: string | null = null;
  for (let guard = 0; guard < 50; guard++) {
    const page = await loadMyPostsPageServer(sb as never, "u1", {
      limit: 20,
      cursor: parseMypageListCursor(cursor),
      filter,
      promotedOnly,
    });
    if (!page.ok) throw new Error(page.error);
    expect(page.posts.length).toBeLessThanOrEqual(20);
    ids.push(...page.posts.map((p) => String(p.id)));
    cursor = page.next_cursor;
    if (!cursor) break;
  }
  return ids;
}

describe("A1 /api/my/posts page mode", () => {
  it.each(["all", "active", "sold", "hidden"] as const)(
    "필터 %s: 페이지 합 = 전체 목록에 같은 술어 적용 결과(순서 포함)",
    async (filter) => {
      const db = seed();
      const full = await loadMyPostsServer(createFakeSupabase(db) as never, "u1");
      if (!full.ok) throw new Error("full failed");
      // 무인자 결과는 updated_at desc 만 → 페이지 모드(updated_at desc, id desc)와 비교하려고 같은 키로 정렬
      const sorted = [...full.posts].sort((a, b) =>
        a.updatedAt === b.updatedAt ? (String(a.id) < String(b.id) ? 1 : -1) : a.updatedAt < b.updatedAt ? 1 : -1
      );
      const expected = filterMyProductsByListingAxis(sorted as unknown as Product[], filter).map((p) => String(p.id));
      expect(await collectAll(db, filter)).toEqual(expected);
    }
  );

  it("promoted=1: 활성 홍보 대상만(같은 요청에서 point_promotion_orders 계산)", async () => {
    const db = seed();
    const now = Date.now();
    db.point_promotion_orders = [
      {
        id: "o1",
        user_id: "u1",
        target_id: "p000",
        target_type: "product",
        order_status: "active",
        start_at: new Date(now - 1000).toISOString(),
        end_at: new Date(now + 86_400_000).toISOString(),
        created_at: new Date(now).toISOString(),
      },
      {
        id: "o2",
        user_id: "u1",
        target_id: "p003",
        target_type: "product",
        order_status: "expired",
        created_at: new Date(now).toISOString(),
      },
    ];
    expect(await collectAll(db, "all", true)).toEqual(["p000"]);
  });

  it("M-1: 판매자가 삭제한 글은 무인자·페이지 모드 어디에도 없다", async () => {
    const db = seed();
    const full = await loadMyPostsServer(createFakeSupabase(db) as never, "u1");
    if (!full.ok) throw new Error("full failed");
    expect(full.posts.some((p) => String(p.id) === "deleted-own")).toBe(false);
    const hidden = await collectAll(db, "hidden");
    expect(hidden).not.toContain("deleted-own");
  });

  it("조회 실패는 ok:false (빈 목록 아님)", async () => {
    const sb = createFakeSupabase(seed(), { failTables: [POSTS_TABLE_READ] });
    const page = await loadMyPostsPageServer(sb as never, "u1", { limit: 20, cursor: null, filter: "all", promotedOnly: false });
    expect(page.ok).toBe(false);
  });
});
