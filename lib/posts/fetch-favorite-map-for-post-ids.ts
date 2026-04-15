/**
 * 목록용 찜 맵 — 홈 `resolveHomePostsGetData` 와 동일 테이블·필드 (서버 전용).
 */
import type { SupabaseClient } from "@supabase/supabase-js";

export async function fetchFavoriteMapForPostIds(
  favoritesSb: SupabaseClient<any>,
  userId: string,
  postIds: string[]
): Promise<Record<string, boolean>> {
  const ids = [...new Set(postIds.map((x) => String(x).trim()).filter(Boolean))].sort();
  const map: Record<string, boolean> = Object.fromEntries(ids.map((id) => [id, false]));
  const uid = userId.trim();
  if (!uid || ids.length === 0) return map;

  const { data: favorites } = await favoritesSb
    .from("favorites")
    .select("post_id")
    .eq("user_id", uid)
    .in("post_id", ids);

  for (const row of favorites ?? []) {
    const postId = typeof row.post_id === "string" ? row.post_id : "";
    if (postId) map[postId] = true;
  }
  return map;
}
