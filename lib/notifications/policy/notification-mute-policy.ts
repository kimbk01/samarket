import type { SupabaseClient } from "@supabase/supabase-js";

export async function isRoomMutedForUser(
  sb: SupabaseClient<any>,
  userId: string,
  roomId: string
): Promise<boolean> {
  const uid = userId.trim();
  const rid = roomId.trim();
  if (!uid || !rid) return false;
  const { data } = await sb
    .from("community_messenger_participants")
    .select("is_muted")
    .eq("user_id", uid)
    .eq("room_id", rid)
    .maybeSingle();
  return (data as { is_muted?: boolean } | null)?.is_muted === true;
}
