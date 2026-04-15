"use client";

import { POSTS_TABLE_READ } from "@/lib/posts/posts-db-tables";

import { getSupabaseClient } from "@/lib/supabase/client";
import type { PostWithMeta } from "@/lib/posts/schema";
import { POST_TRADE_DETAIL_SELECT } from "@/lib/posts/post-query-select";
import { runSingleFlight } from "@/lib/http/run-single-flight";

/** 관리자 거래 탭 목록 — `POST_TRADE_DETAIL_SELECT` 만 사용(select * 없음) */
const ADMIN_TRADE_POSTS_LIST_LIMIT = 500;

/**
 * 관리자 커뮤니티/거래 글 목록(거래 탭). 탭 전환·StrictMode 등으로 동시 호출되면 한 갈래로 합류.
 */
export async function getAdminPosts(): Promise<PostWithMeta[]> {
  return runSingleFlight("admin:getAdminPosts:v1", async () => {
    const supabase = getSupabaseClient();
    if (!supabase) return [];

    try {
      const { data, error } = await (supabase as any)
        .from(POSTS_TABLE_READ)
        .select(POST_TRADE_DETAIL_SELECT)
        .order("created_at", { ascending: false })
        .limit(ADMIN_TRADE_POSTS_LIST_LIMIT);

      if (error || !Array.isArray(data)) return [];
      return (data as Record<string, unknown>[]).map((row) => ({
        ...row,
        author_id: row.author_id ?? row.user_id,
        category_id: row.category_id ?? row.trade_category_id,
      })) as PostWithMeta[];
    } catch {
      return [];
    }
  });
}
