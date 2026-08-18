import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Live 찜 건수 — `favorites` COUNT.
 * CUT G CASE B: `posts.favorite_count` is a stale snapshot (no trigger / no app writer).
 * Do not treat the column as write authority.
 */
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
