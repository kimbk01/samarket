"use client";

import { getSupabaseClient } from "@/lib/supabase/client";

export interface CommentRow {
  id: string;
  post_id: string;
  user_id: string;
  content: string;
  created_at: string;
  hidden?: boolean;
}

export interface CommentWithAuthor extends CommentRow {
  author_nickname?: string;
  author_avatar_url?: string;
}

/**
 * 게시글 댓글 목록 (최신순)
 */
export async function getComments(postId: string): Promise<CommentWithAuthor[]> {
  const supabase = getSupabaseClient();
  if (!supabase || !postId?.trim()) return [];

  try {
    const { data, error } = await (supabase as any)
      .from("comments")
      .select("id, post_id, user_id, content, created_at")
      .eq("post_id", postId)
      .order("created_at", { ascending: true });

    if (error || !Array.isArray(data)) return [];
    return data as CommentWithAuthor[];
  } catch {
    return [];
  }
}
