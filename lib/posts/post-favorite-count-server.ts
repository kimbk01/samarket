import type { SupabaseClient } from "@supabase/supabase-js";

/** 글에 연결된 찜 건수(구매자 기준). `posts.favorite_count` 없을 때 대비 */
export async function countFavoritesForPostId(sbAny: SupabaseClient, postId: string): Promise<number> {
  const id = typeof postId === "string" ? postId.trim() : "";
  if (!id) return 0;
  try {
    const { count, error } = await sbAny
      .from("favorites")
      .select("id", { count: "exact", head: true })
      .eq("post_id", id);
    if (error) return 0;
    return typeof count === "number" ? count : 0;
  } catch {
    return 0;
  }
}
