"use client";

import { getSupabaseClient } from "@/lib/supabase/client";

/**
 * 해당 카테고리 하위 게시물 수 (삭제 가능 여부 판단용)
 */
export async function getPostCountByCategory(categoryId: string): Promise<number> {
  const supabase = getSupabaseClient();
  if (!supabase || !categoryId?.trim()) return 0;

  const idTrim = categoryId.trim();
  try {
    let res = await (supabase as any)
      .from("posts")
      .select("id", { count: "exact", head: true })
      .eq("trade_category_id", idTrim);
    if (res.error && typeof res.error?.message === "string" && res.error.message.includes("trade_category_id")) {
      res = await (supabase as any)
        .from("posts")
        .select("id", { count: "exact", head: true })
        .eq("category_id", idTrim);
    }
    if (res.error) return 0;
    return typeof res.count === "number" ? res.count : 0;
  } catch {
    return 0;
  }
}
