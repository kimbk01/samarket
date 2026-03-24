"use client";

import { getSupabaseClient } from "@/lib/supabase/client";

export interface AdminCommentRow {
  id: string;
  post_id: string;
  user_id: string;
  content: string;
  created_at: string;
  hidden?: boolean;
}

export async function getAdminComments(): Promise<AdminCommentRow[]> {
  const supabase = getSupabaseClient();
  if (!supabase) return [];

  try {
    const { data, error } = await (supabase as any)
      .from("comments")
      .select("id, post_id, user_id, content, created_at")
      .order("created_at", { ascending: false })
      .limit(500);

    if (error || !Array.isArray(data)) return [];
    return data as AdminCommentRow[];
  } catch {
    return [];
  }
}
