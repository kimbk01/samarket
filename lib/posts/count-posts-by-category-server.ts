import type { SupabaseClient } from "@supabase/supabase-js";
import { POSTS_TABLE_READ } from "@/lib/posts/posts-db-tables";

/**
 * 카테고리별 posts 수 — 서버 전용 (`posts.trade_category_id`).
 */
export async function countPostsByCategoryServer(
  sb: SupabaseClient<any>,
  categoryId: string
): Promise<{ ok: true; count: number } | { ok: false; error: string }> {
  const idTrim = categoryId?.trim();
  if (!idTrim) {
    return { ok: false, error: "invalid_request" };
  }

  const res = await sb
    .from(POSTS_TABLE_READ)
    .select("id", { count: "exact", head: true })
    .eq("trade_category_id", idTrim);

  if (res.error) {
    console.error("[count-posts-by-category]", res.error.message);
    return { ok: false, error: "post_count_failed" };
  }

  return { ok: true, count: typeof res.count === "number" ? res.count : 0 };
}
