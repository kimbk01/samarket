import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * 하단 「메신저」탭 배지용 — `community_messenger_participants.unread_count` 합.
 */
export async function sumCommunityMessengerParticipantUnread(
  sbAny: SupabaseClient<any>,
  userId: string
): Promise<number> {
  const uid = userId.trim();
  if (!uid) return 0;
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
