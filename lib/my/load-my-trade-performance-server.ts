import type { SupabaseClient } from "@supabase/supabase-js";
import { POSTS_TABLE_READ } from "@/lib/posts/posts-db-tables";

/**
 * 거래 E (Owner 2026-10-28) — 판매 탭 「성과」 = 내 거래 글의 조회수·찜·신고.
 * - 대상: 내가 올린 거래 글(`trade_category_id` 있음) 중 삭제하지 않은 글(숨김·판매완료 포함) — `loadMyPostsServer` 와 같은 조건.
 * - 조회수 = `posts.view_count` 합, 찜 = `posts.favorite_count` 합(트리거 `tr_favorites_sync_count` 관리),
 *   신고 = `reports(target_type='product')` 중 대상이 내 글인 건수.
 * `/api/my/posts` 무인자 응답 계약은 건드리지 않는다(별도 읽기 전용 API).
 */
export type MyTradePerformance = {
  views: number;
  favorites: number;
  reports: number;
};

export async function loadMyTradePerformanceServer(
  sb: SupabaseClient<any>,
  userId: string
): Promise<{ ok: true; performance: MyTradePerformance } | { ok: false }> {
  const { data: posts, error } = await sb
    .from(POSTS_TABLE_READ)
    .select("id, view_count, favorite_count")
    .eq("user_id", userId)
    .not("trade_category_id", "is", null)
    .neq("owner_state", "owner_deleted");
  if (error || !Array.isArray(posts)) return { ok: false };

  let views = 0;
  let favorites = 0;
  const ids: string[] = [];
  for (const row of posts as Array<{ id?: unknown; view_count?: unknown; favorite_count?: unknown }>) {
    const id = typeof row.id === "string" ? row.id : "";
    if (!id) continue;
    ids.push(id);
    views += Math.max(0, Number(row.view_count) || 0);
    favorites += Math.max(0, Number(row.favorite_count) || 0);
  }

  let reports = 0;
  if (ids.length > 0) {
    const { count, error: repErr } = await sb
      .from("reports")
      .select("id", { count: "exact", head: true })
      .eq("target_type", "product")
      .in("target_id", ids);
    if (repErr) return { ok: false };
    reports = count ?? 0;
  }

  return { ok: true, performance: { views, favorites, reports } };
}
