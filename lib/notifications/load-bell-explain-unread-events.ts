/**
 * Phase 3-1 — load unread notification_events for Bell Explain Matrix.
 * DO NOT: Badge room facts · Heal · Legacy merge
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { BellExplainEventRow } from "@/lib/notifications/bell-explain-matrix";

export async function loadBellExplainUnreadEventRows(
  sb: SupabaseClient,
  userId: string,
  opts?: { limit?: number }
): Promise<BellExplainEventRow[]> {
  const uid = userId.trim();
  if (!uid) return [];
  const limit = Math.max(1, Math.min(2000, Math.floor(Number(opts?.limit) || 500)));

  const { data, error } = await sb
    .from("notification_events")
    .select("id, type, category, display_payload, room_id, dedupe_key, unread, read_at, muted_snapshot")
    .eq("user_id", uid)
    .eq("unread", true)
    .is("read_at", null)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error || !data) return [];
  return data as BellExplainEventRow[];
}
