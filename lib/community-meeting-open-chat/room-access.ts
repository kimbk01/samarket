import type { SupabaseClient } from "@supabase/supabase-js";
import type { CommunityChatMemberRole } from "./types";

export type CommunityChatMemberAccess = {
  role: CommunityChatMemberRole;
  nickname: string;
  avatar_url: string | null;
};

function isMissingCommunityChatSchemaError(message: string): boolean {
  return /42P01|community_chat_rooms|does not exist/i.test(message);
}

/** 방이 해당 모임에 속하는지 */
export async function getCommunityChatRoomMeetingId(
  sb: SupabaseClient<any>,
  roomId: string
): Promise<{ ok: true; meetingId: string; status: string } | { ok: false; error: string; status: number }> {
  const { data, error } = await sb
    .from("community_chat_rooms")
    .select("meeting_id, status")
    .eq("id", roomId.trim())
    .maybeSingle();
  if (error) {
    if (isMissingCommunityChatSchemaError(error.message)) {
      return { ok: false, error: "schema_missing", status: 503 };
    }
    return { ok: false, error: error.message, status: 500 };
  }
  if (!data) return { ok: false, error: "not_found", status: 404 };
  const row = data as { meeting_id: string; status: string };
  return { ok: true, meetingId: String(row.meeting_id), status: String(row.status ?? "active") };
}

/** `member_status = joined` 인 멤버만 */
export async function getJoinedCommunityChatMember(
  sb: SupabaseClient<any>,
  roomId: string,
  userId: string
): Promise<
  | { ok: true; member: CommunityChatMemberAccess }
  | { ok: false; error: string; status: number }
> {
  const { data, error } = await sb
    .from("community_chat_room_members")
    .select("role, nickname, avatar_url, member_status")
    .eq("room_id", roomId.trim())
    .eq("user_id", userId.trim())
    .maybeSingle();
  if (error) {
    if (isMissingCommunityChatSchemaError(error.message)) {
      return { ok: false, error: "schema_missing", status: 503 };
    }
    return { ok: false, error: error.message, status: 500 };
  }
  const row = data as {
    role?: CommunityChatMemberRole;
    nickname?: string;
    avatar_url?: string | null;
    member_status?: string;
  } | null;
  if (!row || row.member_status !== "joined") {
    return { ok: false, error: "not_a_member", status: 403 };
  }
  return {
    ok: true,
    member: {
      role: row.role ?? "member",
      nickname: String(row.nickname ?? "").trim() || "member",
      avatar_url: row.avatar_url ?? null,
    },
  };
}

export function communityChatRoleCanManage(role: CommunityChatMemberRole): boolean {
  return role === "owner" || role === "sub_admin";
}
