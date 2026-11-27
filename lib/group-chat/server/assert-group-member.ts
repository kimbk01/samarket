import type { SupabaseClient } from "@supabase/supabase-js";

export type GroupMemberRow = {
  id: string;
  role: string;
  last_read_seq: number;
};

export async function getActiveGroupMembership(
  sb: SupabaseClient<any>,
  roomId: string,
  userId: string
): Promise<{ ok: true; member: GroupMemberRow } | { ok: false; status: number; error: string }> {
  const { data, error } = await sb
    .from("group_room_members")
    .select("id, role, last_read_seq")
    .eq("room_id", roomId)
    .eq("user_id", userId)
    .is("left_at", null)
    .maybeSingle();

  /** `error` 는 화면 문장·DB 원문이 아니라 오류 코드(`GROUP_CHAT_API_ERROR_CODE_MAP`) — DB 원문은 로그로만 */
  if (error) {
    console.error("[group-chat] membership lookup failed", error.message);
    return { ok: false, status: 500, error: "group_chat_load_failed" };
  }
  const row = data as { id?: string; role?: string; last_read_seq?: number } | null;
  if (!row?.id) {
    return { ok: false, status: 403, error: "group_chat_members_only" };
  }
  return {
    ok: true,
    member: {
      id: row.id,
      role: String(row.role ?? "member"),
      last_read_seq: Number(row.last_read_seq ?? 0),
    },
  };
}
