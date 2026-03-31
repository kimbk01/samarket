import type { SupabaseClient } from "@supabase/supabase-js";
import type { MeetingOpenChatMemberRole, MeetingOpenChatParticipantPublic } from "./types";

function isMissingMeetingOpenChatSchemaError(message: string): boolean {
  return /42P01|meeting_open_chat_members|does not exist/i.test(message);
}

function roleSortKey(r: MeetingOpenChatMemberRole): number {
  if (r === "owner") return 0;
  if (r === "sub_admin") return 1;
  return 2;
}

export async function listActiveMeetingOpenChatMembers(
  sb: SupabaseClient<any>,
  roomId: string
): Promise<
  | { ok: true; members: MeetingOpenChatParticipantPublic[] }
  | { ok: false; error: string; status: number }
> {
  const rid = roomId.trim();
  const { data, error } = await sb
    .from("meeting_open_chat_members")
    .select("id, open_nickname, open_profile_image_url, intro_message, role, joined_at, last_seen_at")
    .eq("room_id", rid)
    .eq("status", "active");

  if (error) {
    if (isMissingMeetingOpenChatSchemaError(error.message)) {
      return { ok: false, error: "schema_missing", status: 503 };
    }
    return { ok: false, error: error.message, status: 500 };
  }

  const rows = (data ?? []) as {
    id: string;
    open_nickname: string;
    open_profile_image_url: string | null;
    intro_message: string;
    role: MeetingOpenChatMemberRole;
    joined_at: string;
    last_seen_at: string | null;
  }[];

  const members: MeetingOpenChatParticipantPublic[] = rows
    .map((r) => ({
      memberId: String(r.id),
      openNickname: String(r.open_nickname ?? "").trim() || "member",
      openProfileImageUrl: r.open_profile_image_url ?? null,
      introMessage: String(r.intro_message ?? "").trim(),
      role: r.role ?? "member",
      joinedAt: String(r.joined_at ?? ""),
      lastSeenAt: r.last_seen_at ? String(r.last_seen_at) : null,
    }))
    .sort((a, b) => {
      const rk = roleSortKey(a.role) - roleSortKey(b.role);
      if (rk !== 0) return rk;
      return a.joinedAt.localeCompare(b.joinedAt);
    });

  return { ok: true, members };
}

export async function getActiveMeetingOpenChatMemberById(
  sb: SupabaseClient<any>,
  roomId: string,
  memberId: string
): Promise<
  | { ok: true; member: MeetingOpenChatParticipantPublic }
  | { ok: false; error: string; status: number }
> {
  const rid = roomId.trim();
  const mid = memberId.trim();
  const { data, error } = await sb
    .from("meeting_open_chat_members")
    .select("id, open_nickname, open_profile_image_url, intro_message, role, joined_at, last_seen_at, status")
    .eq("room_id", rid)
    .eq("id", mid)
    .maybeSingle();

  if (error) {
    if (isMissingMeetingOpenChatSchemaError(error.message)) {
      return { ok: false, error: "schema_missing", status: 503 };
    }
    return { ok: false, error: error.message, status: 500 };
  }
  const row = data as {
    id?: string;
    open_nickname?: string;
    open_profile_image_url?: string | null;
    intro_message?: string;
    role?: MeetingOpenChatMemberRole;
    joined_at?: string;
    last_seen_at?: string | null;
    status?: string;
  } | null;
  if (!row || row.status !== "active") {
    return { ok: false, error: "not_found", status: 404 };
  }

  return {
    ok: true,
    member: {
      memberId: String(row.id),
      openNickname: String(row.open_nickname ?? "").trim() || "member",
      openProfileImageUrl: row.open_profile_image_url ?? null,
      introMessage: String(row.intro_message ?? "").trim(),
      role: row.role ?? "member",
      joinedAt: String(row.joined_at ?? ""),
      lastSeenAt: row.last_seen_at ? String(row.last_seen_at) : null,
    },
  };
}
