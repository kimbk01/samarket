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

  if (error) {
    return { ok: false, status: 500, error: error.message };
  }
  const row = data as { id?: string; role?: string; last_read_seq?: number } | null;
  if (!row?.id) {
    return { ok: false, status: 403, error: "멤버만 접근할 수 있습니다." };
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
