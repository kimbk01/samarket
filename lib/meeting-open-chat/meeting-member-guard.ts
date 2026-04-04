import type { SupabaseClient } from "@supabase/supabase-js";

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
