"use client";

import { POSTS_TABLE_READ, POSTS_TABLE_WRITE } from "@/lib/posts/posts-db-tables";

import { getSupabaseClient } from "@/lib/supabase/client";
import type { PostWithMeta } from "@/lib/posts/schema";
import { POST_TRADE_DETAIL_SELECT } from "@/lib/posts/post-query-select";

export async function getAdminPosts(): Promise<PostWithMeta[]> {
  const supabase = getSupabaseClient();
  if (!supabase) return [];

  try {
    const { data, error } = await (supabase as any)
      .from(POSTS_TABLE_READ)
      .select(POST_TRADE_DETAIL_SELECT)
      .order("created_at", { ascending: false })
      .limit(500);

    if (error || !Array.isArray(data)) return [];
    return (data as Record<string, unknown>[]).map((row) => ({
      ...row,
      author_id: row.author_id ?? row.user_id,
      category_id: row.category_id ?? row.trade_category_id,
    })) as PostWithMeta[];
  } catch {
    return [];
  }
}
