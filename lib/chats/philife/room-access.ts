import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * `insertMeetingMainChatRoomFlexible` 가 `room_type` 을 community/group 등으로 넣은 경우에도
 * `meetings.chat_room_id` 가 이 방이면 모임 메인 채팅으로 동일하게 접근 검사합니다.
 */
export async function resolvePhilifeMeetingAccessMeetingId(
  sb: SupabaseClient<any>,
  roomId: string,
  room: {
    room_type?: string | null;
    meeting_id?: string | null;
    related_group_id?: string | null;
  }
): Promise<string | null> {
  const rt = String(room.room_type ?? "");
  const fromCols = String(room.meeting_id ?? room.related_group_id ?? "").trim();
  if (rt === "group_meeting") {
    return fromCols || null;
  }
  if (!fromCols) return null;
  const { data: mch } = await sb
    .from("meetings")
    .select("chat_room_id")
    .eq("id", fromCols)
    .maybeSingle();
  const linked = String((mch as { chat_room_id?: string | null })?.chat_room_id ?? "");
  if (linked === roomId) return fromCols;
  return null;
}

export type PhilifeMeetingAccessState =
  | {
      ok: true;
      meetingId: string;
      title: string;
      status: string;
      unreadCount: number;
      memberCount: number;
      joined: true;
      canSend: boolean;
      /** 부가 채팅이며 chat_room_participants 행 없이 모임장·공동운영자로 입장 */
      isModeratorBypass?: boolean;
    }
  | {
      ok: false;
      statusCode: number;
      error: string;
    };

async function isMeetingModerator(
  sb: SupabaseClient<any>,
  meetingId: string,
  userId: string,
): Promise<boolean> {
  const { data: meetingRow } = await sb
    .from("meetings")
    .select("host_user_id, created_by")
    .eq("id", meetingId)
    .maybeSingle();
  const m = meetingRow as { host_user_id?: string | null; created_by?: string | null } | null;
  const host = String(m?.host_user_id ?? m?.created_by ?? "").trim();
  if (host && host === userId) return true;
  const { data: mm } = await sb
    .from("meeting_members")
    .select("role, status")
    .eq("meeting_id", meetingId)
    .eq("user_id", userId)
    .maybeSingle();
  const row = mm as { role?: string; status?: string } | null;
  return row?.status === "joined" && row?.role === "co_host";
}

/**
 * group_meeting 채팅 접근.
 * - 기본 방(meetings.chat_room_id, meeting_chat_rooms 미연결): 활성 chat_room_participants + 승인 멤버.
 * - 부가 방(meeting_chat_rooms.linked_chat_room_id 일치): 초대(참가자) 또는 모임장/공동운영자(검열 입장).
 */
export async function getPhilifeMeetingAccessState(
  sb: SupabaseClient<any>,
  roomId: string,
  userId: string,
  room: {
    meeting_id?: string | null;
    related_group_id?: string | null;
  },
): Promise<PhilifeMeetingAccessState> {
  const meetingId = String(room.meeting_id ?? room.related_group_id ?? "").trim();
  if (!meetingId) {
    return { ok: false, statusCode: 404, error: "모임 정보를 찾을 수 없습니다." };
  }

  const { data: mcrRow } = await sb
    .from("meeting_chat_rooms")
    .select("id, is_private")
    .eq("linked_chat_room_id", roomId)
    .maybeSingle();
  const mcr = mcrRow as { id?: string; is_private?: boolean } | null;
  const isExtraMeetingChat = !!mcr?.id;
  const isPrivateExtra = !!(mcr?.is_private && isExtraMeetingChat);

  const { data: partRow } = await sb
    .from("chat_room_participants")
    .select("unread_count, hidden, left_at, is_active")
    .eq("room_id", roomId)
    .eq("user_id", userId)
    .maybeSingle();

  const participant = partRow as {
    unread_count?: number;
    hidden?: boolean;
    left_at?: string | null;
    is_active?: boolean | null;
  } | null;

  const participantOk =
    !!participant &&
    !participant.hidden &&
    !participant.left_at &&
    participant.is_active !== false;

  type AccessVia = "participant" | "moderator";
  let accessVia: AccessVia | null = null;
  let unreadCount = 0;
  let isModeratorBypass = false;

  if (participantOk) {
    accessVia = "participant";
    unreadCount = Number(participant.unread_count ?? 0);
  } else if (isExtraMeetingChat) {
    const mod = await isMeetingModerator(sb, meetingId, userId);
    const { data: mem } = await sb
      .from("meeting_members")
      .select("id")
      .eq("meeting_id", meetingId)
      .eq("user_id", userId)
      .eq("status", "joined")
      .maybeSingle();
    if (mod && mem) {
      accessVia = "moderator";
      unreadCount = 0;
      isModeratorBypass = true;
    }
  } else {
    /** 메인 방: 참가자 행 누락·호스트만 개설된 경우에도 모임장·공동운영자는 입장 허용 */
    const modMain = await isMeetingModerator(sb, meetingId, userId);
    if (modMain) {
      accessVia = "participant";
      unreadCount = 0;
      isModeratorBypass = true;
    }
  }

  if (!accessVia) {
    return {
      ok: false,
      statusCode: 403,
      error: isPrivateExtra
        ? "비공개 채팅방에 초대되지 않았습니다."
        : isExtraMeetingChat
          ? "이 모임 부가 채팅에 초대되지 않았습니다."
          : "모임 채팅 참여자가 아닙니다.",
    };
  }

  const { data: meetingRow } = await sb
    .from("meetings")
    .select("id, title, status, host_user_id")
    .eq("id", meetingId)
    .maybeSingle();
  const meeting = meetingRow as {
    id?: string;
    title?: string | null;
    status?: string | null;
    host_user_id?: string | null;
  } | null;
  if (!meeting?.id) {
    return { ok: false, statusCode: 404, error: "모임 정보를 찾을 수 없습니다." };
  }

  if (accessVia === "participant" && !isModeratorBypass) {
    const { data: memberRow } = await sb
      .from("meeting_members")
      .select("id")
      .eq("meeting_id", meetingId)
      .eq("user_id", userId)
      .eq("status", "joined")
      .maybeSingle();
    if (!memberRow) {
      const mod = await isMeetingModerator(sb, meetingId, userId);
      if (!mod) {
        return { ok: false, statusCode: 403, error: "모임에 참여 중일 때만 채팅을 이용할 수 있습니다." };
      }
    }
  }

  const meetingStatus = String(meeting.status ?? "").trim();
  const canSend = !(meetingStatus === "ended" || meetingStatus === "cancelled" || meetingStatus === "closed");

  let memberCount: number;
  if (isExtraMeetingChat) {
    const { count } = await sb
      .from("chat_room_participants")
      .select("id", { count: "exact", head: true })
      .eq("room_id", roomId);
    memberCount = Number(count ?? 0);
  } else {
    const { count } = await sb
      .from("meeting_members")
      .select("id", { count: "exact", head: true })
      .eq("meeting_id", meetingId)
      .eq("status", "joined");
    memberCount = Number(count ?? 0);
  }

  return {
    ok: true,
    meetingId,
    title: String(meeting.title ?? "").trim() || "모임 채팅",
    status: meetingStatus,
    unreadCount,
    memberCount,
    joined: true,
    canSend,
    isModeratorBypass,
  };
}

/** 모임장 검열 입장 등 참가자 행이 없을 때 메시지 전송·읽음 후속을 위해 보강 */
export async function ensureChatParticipantRowIfMissing(
  sb: SupabaseClient<any>,
  roomId: string,
  userId: string
): Promise<void> {
  const { data: ex } = await sb
    .from("chat_room_participants")
    .select("id")
    .eq("room_id", roomId)
    .eq("user_id", userId)
    .maybeSingle();
  if (ex) return;
  const now = new Date().toISOString();
  const { error } = await sb.from("chat_room_participants").insert({
    room_id: roomId,
    user_id: userId,
    role_in_room: "member",
    is_active: true,
    hidden: false,
    joined_at: now,
    unread_count: 0,
  });
  if (error && !/duplicate|23505|unique constraint/i.test(String(error.message ?? ""))) {
    console.error("[ensureChatParticipantRowIfMissing]", error.message);
  }
}
