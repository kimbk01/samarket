"use client";

import { getSupabaseClient } from "@/lib/supabase/client";

export interface SanctionRow {
  id: string;
  user_id: string;
  sanction_type: string;
  start_at: string;
  end_at: string | null;
  reason: string | null;
  created_by: string | null;
  created_at: string;
}

export async function getSanctionsByUserIdsFromDb(
  userIds: string[]
): Promise<SanctionRow[]> {
  if (!userIds.length) return [];
  const supabase = getSupabaseClient();
  if (!supabase) return [];
  const sb = supabase as any;
  const { data } = await sb
    .from("sanctions")
    .select("id, user_id, sanction_type, start_at, end_at, reason, created_by, created_at")
    .in("user_id", userIds)
    .order("created_at", { ascending: false });
  return (data ?? []) as SanctionRow[];
}
