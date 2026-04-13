import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * 하단 「메신저」탭 배지용 — `community_messenger_participants.unread_count` 합.
 * 가능하면 PostgREST 집계 한 방(행 전부 전송·합산 방지) → 실패 시 행 스캔 폴백.
 */
export async function sumCommunityMessengerParticipantUnread(
  sbAny: SupabaseClient<any>,
  userId: string
): Promise<number> {
  const uid = userId.trim();
  if (!uid) return 0;

  const { data: aggRow, error: aggErr } = await sbAny
    .from("community_messenger_participants")
    .select("unread_count.sum()")
    .eq("user_id", uid)
    .maybeSingle();

  if (!aggErr && aggRow && typeof aggRow === "object") {
    const raw = aggRow as Record<string, unknown>;
    const v = raw.sum ?? raw["unread_count.sum()"];
    const n = typeof v === "number" ? v : Number(v ?? 0);
    if (Number.isFinite(n)) return Math.max(0, n);
  }

  const { data, error } = await sbAny
    .from("community_messenger_participants")
    .select("unread_count")
    .eq("user_id", uid);
  if (error || !data?.length) return 0;
  let sum = 0;
  for (const row of data as { unread_count?: unknown }[]) {
    const n = Number(row.unread_count ?? 0);
    if (Number.isFinite(n)) sum += Math.max(0, n);
  }
  return sum;
}
