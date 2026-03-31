import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * 커뮤니티 모임 `meeting_members.status = joined` 여부 (오픈채팅 API 공통).
 */
export async function isUserJoinedMeetingMember(
  sb: SupabaseClient<any>,
  meetingId: string,
  userId: string
): Promise<boolean> {
  const mid = meetingId.trim();
  const uid = userId.trim();
  if (!mid || !uid) return false;
  const { data } = await sb
    .from("meeting_members")
    .select("id")
    .eq("meeting_id", mid)
    .eq("user_id", uid)
    .eq("status", "joined")
    .maybeSingle();
  return !!data?.id;
}
