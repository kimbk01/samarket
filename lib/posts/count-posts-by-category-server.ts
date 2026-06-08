import type { SupabaseClient } from "@supabase/supabase-js";
import { POSTS_TABLE_READ } from "@/lib/posts/posts-db-tables";

/**
 * 카테고리별 posts 수 — 서버 전용 (`trade_category_id` → 레거시 `category_id` 폴백).
 */
export async function countPostsByCategoryServer(
  sb: SupabaseClient<any>,
  categoryId: string
): Promise<{ ok: true; count: number } | { ok: false; error: string }> {
  const idTrim = categoryId?.trim();
  if (!idTrim) {
    return { ok: false, error: "categoryId 필요" };
  }

  let res = await sb
    .from(POSTS_TABLE_READ)
    .select("id", { count: "exact", head: true })
    .eq("trade_category_id", idTrim);

  if (res.error && typeof res.error.message === "string" && res.error.message.includes("trade_category_id")) {
    res = await sb
      .from(POSTS_TABLE_READ)
      .select("id", { count: "exact", head: true })
      .eq("category_id", idTrim);
  }

  if (res.error) {
    return { ok: false, error: res.error.message ?? "게시물 수 조회에 실패했습니다." };
  }

  return { ok: true, count: typeof res.count === "number" ? res.count : 0 };
}
