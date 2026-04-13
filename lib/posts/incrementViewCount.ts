"use client";

import { POSTS_TABLE_READ, POSTS_TABLE_WRITE } from "@/lib/posts/posts-db-tables";

import { getSupabaseClient } from "@/lib/supabase/client";

/**
 * 상세 조회 시 조회수 증가 (비동기, 실패해도 무시)
 */
export async function incrementPostViewCount(postId: string): Promise<void> {
  const supabase = getSupabaseClient();
  if (!supabase || !postId?.trim()) return;

  try {
    const { data } = await (supabase as any)
      .from(POSTS_TABLE_READ)
      .select("view_count")
      .eq("id", postId)
      .single();

    const next = ((data?.view_count ?? 0) | 0) + 1;
    await (supabase as any)
      .from(POSTS_TABLE_WRITE)
      .update({ view_count: next, updated_at: new Date().toISOString() })
      .eq("id", postId);
  } catch {
    // ignore
  }
}
