import type { SupabaseClient } from "@supabase/supabase-js";

const CM_UNREAD_PAGE = 1000;

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

  let roomCount = 0;
  let from = 0;
  for (;;) {
    const to = from + CM_UNREAD_PAGE - 1;
    const { data, error } = await sbAny
      .from("community_messenger_participants")
      .select("unread_count")
      .eq("user_id", uid)
      .gt("unread_count", 0)
      .range(from, to);
    if (error) {
      if (from === 0) return 0;
      break;
    }
    const rows = (data ?? []) as { unread_count?: unknown }[];
    if (rows.length === 0) break;
    roomCount += rows.length;
    if (rows.length < CM_UNREAD_PAGE) break;
    from += CM_UNREAD_PAGE;
  }
  return roomCount;
}
