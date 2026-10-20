import type { SupabaseClient } from "@supabase/supabase-js";
import { POSTS_TABLE_READ } from "@/lib/posts/posts-db-tables";
import {
  mapPostRowsToTradeList,
  POST_TRADE_LIST_SELECT,
} from "@/lib/posts/trade-posts-range-query";
import type { PostWithMeta } from "@/lib/posts/schema";

export type FavoritePostListItem = PostWithMeta & { favorited_at: string };

/**
 * 찜한 게시글 목록(찜한 순) — `GET /api/favorites/list` 와 내정보 요약(`favoritesCount`)의 단일 서버 함수.
 * 조회 실패는 `ok:false` (「찜 없음」으로 바꾸지 않는다 — D10).
 */
export async function loadFavoritePostsServer(
  sb: SupabaseClient<any>,
  userId: string
): Promise<
  | { ok: true; items: FavoritePostListItem[] }
  | { ok: false; error: "favorites_load_failed"; phase: "favorites" | "posts"; message: string }
> {
  const { data: favs, error: favError } = await sb
    .from("favorites")
    .select("post_id, created_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });

  if (favError) {
    return { ok: false, error: "favorites_load_failed", phase: "favorites", message: favError.message };
  }
  if (!favs?.length) return { ok: true, items: [] };

  const postIds = favs.map((f: { post_id: string }) => f.post_id);
  /** 숨김(hidden) 글도 포함 — 찜 행은 남아 있는데 목록만 비는 현상 방지. UI는 「품절/삭제됨」탭으로 분류 */
  const { data: posts, error: postError } = await sb
    .from(POSTS_TABLE_READ)
    .select(POST_TRADE_LIST_SELECT)
    .in("id", postIds);

  if (postError) {
    return { ok: false, error: "favorites_load_failed", phase: "posts", message: postError.message };
  }
  if (!Array.isArray(posts)) return { ok: true, items: [] };

  const mapped = mapPostRowsToTradeList(posts as unknown[]);
  const byId = new Map(mapped.map((p) => [p.id, p]));
  const items: FavoritePostListItem[] = [];
  for (const f of favs as { post_id: string; created_at: string }[]) {
    const post = byId.get(f.post_id);
    if (!post) continue;
    items.push({ ...post, favorited_at: f.created_at });
  }
  return { ok: true, items };
}
