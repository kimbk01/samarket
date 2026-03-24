"use client";

import { getSupabaseClient } from "@/lib/supabase/client";

export interface FavoriteAuditRow {
  id: string;
  user_id: string;
  post_id: string;
  action: "add" | "remove";
  created_at: string;
}

/**
 * 비정상 찜 감지용: 최근 찜 추가/삭제 로그 (관리자)
 */
export async function getFavoriteAuditLog(limit = 200): Promise<FavoriteAuditRow[]> {
  const supabase = getSupabaseClient();
  if (!supabase) return [];

  try {
    const { data, error } = await (supabase as any)
      .from("favorite_audit_log")
      .select("id, user_id, post_id, action, created_at")
      .order("created_at", { ascending: false })
      .limit(limit);

    if (error || !Array.isArray(data)) return [];
    return data as FavoriteAuditRow[];
  } catch {
    return [];
  }
}
