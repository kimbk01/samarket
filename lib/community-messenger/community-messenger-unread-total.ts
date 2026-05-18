import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * 하단 「메신저」탭 배지용 — `community_messenger_participants.unread_count > 0` 인 방 개수.
 *
 * 사용자 UX 규칙:
 * - 방 A unread 5
 * - 방 B unread 1
 * => 하단 메신저 배지 2
 *
 * 즉, unread 메시지 총합이 아니라 unread 방 수만 센다.
 */
export async function sumCommunityMessengerParticipantUnread(
  sbAny: SupabaseClient<any>,
  userId: string
): Promise<number> {
  const uid = userId.trim();
  if (!uid) return 0;

  const { count, error } = await sbAny
    .from("community_messenger_participants")
    .select("id", { count: "exact", head: true })
    .eq("user_id", uid)
    .gt("unread_count", 0);
  if (error) return 0;
  return Math.max(0, Math.floor(Number(count) || 0));
}
