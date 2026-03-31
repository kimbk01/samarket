import type { SupabaseClient } from "@supabase/supabase-js";
import type { MeetingOpenChatMemberAccess, MeetingOpenChatMemberRole } from "./types";

function isMissingMeetingOpenChatSchemaError(message: string): boolean {
  return /42P01|meeting_open_chat_rooms|does not exist/i.test(message);
}

export async function getMeetingOpenChatRoomMeetingId(
  sb: SupabaseClient<any>,
  roomId: string
): Promise<
  | { ok: true; meetingId: string; is_active: boolean }
  | { ok: false; error: string; status: number }
> {
  const { data, error } = await sb
    .from("meeting_open_chat_rooms")
    .select("meeting_id, is_active")
    .eq("id", roomId.trim())
    .maybeSingle();
  if (error) {
    if (isMissingMeetingOpenChatSchemaError(error.message)) {
      return { ok: false, error: "schema_missing", status: 503 };
    }
    return { ok: false, error: error.message, status: 500 };
  }
  if (!data) return { ok: false, error: "not_found", status: 404 };
  const row = data as { meeting_id: string; is_active: boolean };
  return { ok: true, meetingId: String(row.meeting_id), is_active: Boolean(row.is_active) };
}

/** `status = active` 인 멤버만 채팅·조회 허용 */
export async function getActiveMeetingOpenChatMember(
  sb: SupabaseClient<any>,
  roomId: string,
  userId: string
): Promise<
  | { ok: true; member: MeetingOpenChatMemberAccess }
  | { ok: false; error: string; status: number }
> {
  const { data, error } = await sb
    .from("meeting_open_chat_members")
    .select("id, role, open_nickname, open_profile_image_url, status")
    .eq("room_id", roomId.trim())
    .eq("user_id", userId.trim())
    .maybeSingle();
  if (error) {
    if (isMissingMeetingOpenChatSchemaError(error.message)) {
      return { ok: false, error: "schema_missing", status: 503 };
    }
    return { ok: false, error: error.message, status: 500 };
  }
  const row = data as {
    id?: string;
    role?: MeetingOpenChatMemberRole;
    open_nickname?: string;
    open_profile_image_url?: string | null;
    status?: string;
  } | null;
  if (!row || row.status !== "active") {
    return { ok: false, error: "not_a_member", status: 403 };
  }
  return {
    ok: true,
    member: {
      memberId: String(row.id),
      role: row.role ?? "member",
      open_nickname: String(row.open_nickname ?? "").trim() || "member",
      open_profile_image_url: row.open_profile_image_url ?? null,
    },
  };
}
