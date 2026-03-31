import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * DB마다 `chat_rooms` CHECK·인덱스가 달라 insert 가 실패할 수 있음.
 * - `context_type`: 여러 허용 값 순차 시도
 * - `room_type`: 옛 스키마는 `group_meeting` 미포함일 수 있어 community/group/general_chat 도 시도
 * - `chat_rooms_meeting_id_unique` 가 남아 있으면 두 번째 방은 막히므로 마이그레이션으로 DROP 필요
 */
const MEETING_CHAT_CONTEXT_TRIES = ["neighborhood", "etc", "post", "group", "job", "support"] as const;
const MEETING_CHAT_ROOM_TYPE_TRIES = ["group_meeting", "community", "group", "general_chat"] as const;

function isChatRoomsContextTypeConstraintError(message: string): boolean {
  return /chat_rooms_context_type_check|context_type_check|check constraint.*context/i.test(message);
}

function isChatRoomsRoomTypeConstraintError(message: string): boolean {
  return /room_type_check|chat_rooms_room_type|check constraint.*room_type/i.test(message);
}

/** 모임당 chat_rooms 1개 유니크 인덱스(옛 마이그레이션) — 이미 행이 있으면 insert 대신 고아 연결 */
function isMeetingChatRoomDuplicateError(message: string): boolean {
  return (
    /duplicate key|23505|unique constraint/i.test(message) &&
    /meeting_id|chat_rooms_meeting/i.test(message)
  );
}

type MeetingChatRoomInsertBase = {
  meeting_id: string;
  /** 레거시 `posts` FK — 모임 원글은 `community_posts` 이므로 null 로 둠 */
  related_post_id: string | null;
  /** 필라이프 동네글 FK (`community_posts`). `related_post_id` 와 동시에 쓰지 않음 */
  related_community_post_id?: string | null;
  related_group_id: string;
  initiator_id: string;
  peer_id: string;
  request_status: "approved";
  participants_count: number;
  last_message_preview: string;
};

/** 삭제·불일치 시 chat_rooms FK 위반 방지 */
async function communityPostIdIfExists(
  sb: SupabaseClient<any>,
  postId: string | null | undefined
): Promise<string | null> {
  const id = typeof postId === "string" ? postId.trim() : "";
  if (!id) return null;
  const { data, error } = await sb.from("community_posts").select("id").eq("id", id).maybeSingle();
  if (error || !data || typeof (data as { id?: unknown }).id !== "string") return null;
  return id;
}

async function insertMeetingMainChatRoomFlexible(
  sb: SupabaseClient<any>,
  base: MeetingChatRoomInsertBase,
): Promise<{ roomId: string | null; lastError: string; duplicateMeetingRoom: boolean }> {
  let lastMsg = "";
  let duplicateMeetingRoom = false;

  for (const room_type of MEETING_CHAT_ROOM_TYPE_TRIES) {
    for (const context_type of MEETING_CHAT_CONTEXT_TRIES) {
      const { data, error } = await sb
        .from("chat_rooms")
        .insert({ ...base, room_type, context_type })
        .select("id")
        .single();
      const id = data && typeof (data as { id?: string }).id === "string" ? (data as { id: string }).id : null;
      if (!error && id) {
        return { roomId: id, lastError: "", duplicateMeetingRoom: false };
      }
      lastMsg = error?.message ?? "";
      if (isMeetingChatRoomDuplicateError(lastMsg)) {
        duplicateMeetingRoom = true;
        return { roomId: null, lastError: lastMsg, duplicateMeetingRoom: true };
      }
      if (isChatRoomsContextTypeConstraintError(lastMsg)) {
        continue;
      }
      if (isChatRoomsRoomTypeConstraintError(lastMsg)) {
        break;
      }
      return { roomId: null, lastError: lastMsg || "chat_rooms.insert failed", duplicateMeetingRoom: false };
    }
  }

  for (const room_type of MEETING_CHAT_ROOM_TYPE_TRIES) {
    const { data, error } = await sb
      .from("chat_rooms")
      .insert({ ...base, room_type, context_type: null })
      .select("id")
      .single();
    const id = data && typeof (data as { id?: string }).id === "string" ? (data as { id: string }).id : null;
    if (!error && id) {
      return { roomId: id, lastError: "", duplicateMeetingRoom: false };
    }
    lastMsg = error?.message ?? "";
    if (isMeetingChatRoomDuplicateError(lastMsg)) {
      return { roomId: null, lastError: lastMsg, duplicateMeetingRoom: true };
    }
    if (isChatRoomsRoomTypeConstraintError(lastMsg)) {
      continue;
    }
    if (!isChatRoomsContextTypeConstraintError(lastMsg) && lastMsg) {
      return { roomId: null, lastError: lastMsg, duplicateMeetingRoom: false };
    }
  }

  return {
    roomId: null,
    lastError: lastMsg || "chat_rooms.insert failed (room_type/context exhausted)",
    duplicateMeetingRoom,
  };
}

/**
 * `meetings.chat_room_id` 와 `chat_room_participants`(방장) 를 맞춤.
 */
async function attachMainChatRoomToMeeting(
  sb: SupabaseClient<any>,
  meetingId: string,
  roomId: string,
  hostUserId: string
): Promise<{ ok: true } | { ok: false; message: string }> {
  const uid = hostUserId.trim();
  if (!uid) return { ok: false, message: "host_user_id_empty" };
  const now = new Date().toISOString();

  const { data: partEx } = await sb
    .from("chat_room_participants")
    .select("id")
    .eq("room_id", roomId)
    .eq("user_id", uid)
    .maybeSingle();
  if (!partEx) {
    const { error: pErr } = await sb.from("chat_room_participants").insert({
      room_id: roomId,
      user_id: uid,
      role_in_room: "member",
      is_active: true,
      hidden: false,
      joined_at: now,
      unread_count: 0,
    });
    if (pErr) {
      console.error("[attachMainChatRoomToMeeting] chat_room_participants:", pErr.message);
      return { ok: false, message: `chat_room_participants: ${pErr.message}` };
    }
  }

  const { error: uErr } = await sb.from("meetings").update({ chat_room_id: roomId }).eq("id", meetingId);
  if (uErr) {
    console.error("[attachMainChatRoomToMeeting] meetings.update:", uErr.message);
    return { ok: false, message: `meetings.update: ${uErr.message}` };
  }
  return { ok: true };
}

async function findExistingChatRoomIdForMeeting(
  sb: SupabaseClient<any>,
  meetingId: string
): Promise<string | null> {
  const { data: gm, error: e1 } = await sb
    .from("chat_rooms")
    .select("id")
    .eq("meeting_id", meetingId)
    .eq("room_type", "group_meeting")
    .order("created_at", { ascending: true })
    .limit(1);
  if (!e1 && gm?.length) {
    const id = (gm[0] as { id?: string }).id;
    if (id) return String(id);
  }
  const { data: anyRow, error: e2 } = await sb
    .from("chat_rooms")
    .select("id")
    .eq("meeting_id", meetingId)
    .order("created_at", { ascending: true })
    .limit(1);
  if (!e2 && anyRow?.length) {
    const id = (anyRow[0] as { id?: string }).id;
    if (id) return String(id);
  }
  return null;
}

export type EnsureMeetingGroupChatRoomOutcome =
  | { ok: true; roomId: string; created: boolean }
  | { ok: false; error: string };

/**
 * 모임 메인 `chat_rooms` 보장 — 실패 시 Postgres/Supabase 메시지 포함.
 */
export async function ensureMeetingGroupChatRoomResult(
  sb: SupabaseClient<any>,
  meetingId: string,
  organizerUserId: string,
  title: string
): Promise<EnsureMeetingGroupChatRoomOutcome> {
  const { data: meeting } = await sb
    .from("meetings")
    .select("id, post_id, chat_room_id, created_by, host_user_id")
    .eq("id", meetingId)
    .maybeSingle();
  const m = meeting as {
    id?: string;
    post_id?: string | null;
    chat_room_id?: string | null;
    created_by?: string;
    host_user_id?: string;
  } | null;
  if (!m?.id) return { ok: false, error: "meeting_not_found" };
  if (m.chat_room_id) return { ok: true, roomId: String(m.chat_room_id), created: false };

  const creator = String(m.host_user_id || m.created_by || organizerUserId);

  /** 이미 `chat_rooms` 행만 있고 `meetings.chat_room_id` 가 비어 있는 고아 연결 */
  const orphanId = await findExistingChatRoomIdForMeeting(sb, meetingId);
  if (orphanId) {
    const att = await attachMainChatRoomToMeeting(sb, meetingId, orphanId, creator);
    if (!att.ok) return { ok: false, error: att.message };
    return { ok: true, roomId: orphanId, created: false };
  }

  const relatedCommunityPostId = await communityPostIdIfExists(sb, m.post_id);
  const insertRes = await insertMeetingMainChatRoomFlexible(sb, {
    meeting_id: meetingId,
    related_post_id: null,
    related_community_post_id: relatedCommunityPostId,
    related_group_id: meetingId,
    initiator_id: creator,
    peer_id: creator,
    request_status: "approved",
    participants_count: 1,
    last_message_preview: `${title.slice(0, 40)} · 모임 채팅`,
  });
  const roomId = insertRes.roomId;

  if (!roomId) {
    if (insertRes.lastError) {
      console.error("[ensureMeetingGroupChatRoom] chat_rooms.insert:", insertRes.lastError);
    }
    const { data: again } = await sb.from("meetings").select("chat_room_id").eq("id", meetingId).maybeSingle();
    const existing = (again as { chat_room_id?: string | null } | null)?.chat_room_id;
    if (existing) {
      return { ok: true, roomId: String(existing), created: false };
    }
    const retryOrphan = await findExistingChatRoomIdForMeeting(sb, meetingId);
    if (retryOrphan) {
      const att = await attachMainChatRoomToMeeting(sb, meetingId, retryOrphan, creator);
      if (!att.ok) return { ok: false, error: att.message };
      return { ok: true, roomId: retryOrphan, created: false };
    }
    if (insertRes.duplicateMeetingRoom) {
      return {
        ok: false,
        error: `${insertRes.lastError} — Supabase에서 마이그레이션 \`20260331160000_meeting_chat_private_rls.sql\`(chat_rooms_meeting_id_unique DROP) 적용 여부를 확인하세요.`,
      };
    }
    return {
      ok: false,
      error: insertRes.lastError || "chat_rooms.insert failed",
    };
  }

  const attachRes = await attachMainChatRoomToMeeting(sb, meetingId, roomId, creator);
  if (!attachRes.ok) {
    console.error("[ensureMeetingGroupChatRoom] attach failed after insert roomId=", roomId);
    return { ok: false, error: attachRes.message };
  }

  const { error: msgErr } = await sb.from("chat_messages").insert({
    room_id: roomId,
    sender_id: null,
    message_type: "system",
    body: "모임 채팅방이 열렸습니다. 참여한 이웃만 대화에 참여할 수 있습니다.",
  });
  if (msgErr) {
    console.error("[ensureMeetingGroupChatRoom] chat_messages.insert:", msgErr.message);
  }

  return { ok: true, roomId, created: true };
}

/**
 * 모임 전용 그룹 채팅방 (구현 아님, 연결만).
 */
export async function ensureMeetingGroupChatRoom(
  sb: SupabaseClient<any>,
  meetingId: string,
  organizerUserId: string,
  title: string
): Promise<{ roomId: string; created: boolean } | null> {
  const r = await ensureMeetingGroupChatRoomResult(sb, meetingId, organizerUserId, title);
  return r.ok ? { roomId: r.roomId, created: r.created } : null;
}

export async function addMeetingChatParticipant(
  sb: SupabaseClient<any>,
  meetingId: string,
  userId: string
): Promise<boolean> {
  const { data: meeting } = await sb
    .from("meetings")
    .select("chat_room_id")
    .eq("id", meetingId)
    .maybeSingle();
  const roomId = (meeting as { chat_room_id?: string } | null)?.chat_room_id;
  if (!roomId) return false;

  const { data: ex } = await sb
    .from("chat_room_participants")
    .select("id")
    .eq("room_id", roomId)
    .eq("user_id", userId)
    .maybeSingle();
  if (ex) return true;

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
  return !error;
}

export type MeetingExtraChatRoomDTO = {
  id: string;
  title: string;
  description: string | null;
  room_type: "sub" | "private";
  is_private: boolean;
  linked_chat_room_id: string;
  created_at: string;
};

/** 모임장·공동운영자는 부가 방 전체 목록, 그 외는 초대된 방만 */
export async function listMeetingExtraChatRoomsForUser(
  sb: SupabaseClient<any>,
  meetingId: string,
  userId: string,
): Promise<MeetingExtraChatRoomDTO[]> {
  const { data: meeting } = await sb
    .from("meetings")
    .select("host_user_id, created_by")
    .eq("id", meetingId)
    .maybeSingle();
  const m = meeting as { host_user_id?: string | null; created_by?: string | null } | null;
  if (!m) return [];

  const host = String(m.host_user_id ?? m.created_by ?? "").trim();
  const { data: mem } = await sb
    .from("meeting_members")
    .select("role")
    .eq("meeting_id", meetingId)
    .eq("user_id", userId)
    .eq("status", "joined")
    .maybeSingle();
  const role = (mem as { role?: string } | null)?.role;
  const canSeeAll = userId === host || role === "co_host";

  if (canSeeAll) {
    const { data: rows, error } = await sb
      .from("meeting_chat_rooms")
      .select("id, title, description, room_type, is_private, linked_chat_room_id, created_at")
      .eq("meeting_id", meetingId)
      .order("created_at", { ascending: true });
    if (error) {
      const code = (error as { code?: string }).code;
      const msg = String(error.message ?? "");
      if (code === "42P01" || msg.includes("does not exist")) {
        throw new Error("SCHEMA_MISSING");
      }
      return [];
    }
    if (!rows?.length) return [];
    return rows.map((r) => ({
      id: String((r as { id: string }).id),
      title: String((r as { title?: string }).title ?? ""),
      description: ((r as { description?: string | null }).description ?? null) as string | null,
      room_type: (r as { room_type: string }).room_type as "sub" | "private",
      is_private: !!(r as { is_private?: boolean }).is_private,
      linked_chat_room_id: String((r as { linked_chat_room_id: string }).linked_chat_room_id),
      created_at: String((r as { created_at: string }).created_at),
    }));
  }

  const { data: parts, error: partsErr } = await sb
    .from("meeting_chat_participants")
    .select("room_id")
    .eq("user_id", userId);
  if (partsErr) {
    const code = (partsErr as { code?: string }).code;
    const msg = String(partsErr.message ?? "");
    if (code === "42P01" || msg.includes("does not exist")) {
      throw new Error("SCHEMA_MISSING");
    }
    return [];
  }
  const roomIds = (parts ?? [])
    .map((p) => String((p as { room_id: string }).room_id))
    .filter(Boolean);
  if (!roomIds.length) return [];

  const { data: rows, error } = await sb
    .from("meeting_chat_rooms")
    .select("id, title, description, room_type, is_private, linked_chat_room_id, created_at")
    .eq("meeting_id", meetingId)
    .in("id", roomIds)
    .order("created_at", { ascending: true });
  if (error) {
    const code = (error as { code?: string }).code;
    const msg = String(error.message ?? "");
    if (code === "42P01" || msg.includes("does not exist")) {
      throw new Error("SCHEMA_MISSING");
    }
    return [];
  }
  if (!rows?.length) return [];
  return rows.map((r) => ({
    id: String((r as { id: string }).id),
    title: String((r as { title?: string }).title ?? ""),
    description: ((r as { description?: string | null }).description ?? null) as string | null,
    room_type: (r as { room_type: string }).room_type as "sub" | "private",
    is_private: !!(r as { is_private?: boolean }).is_private,
    linked_chat_room_id: String((r as { linked_chat_room_id: string }).linked_chat_room_id),
    created_at: String((r as { created_at: string }).created_at),
  }));
}

export type CreateMeetingExtraChatResult =
  | { ok: true; meetingChatRoom: MeetingExtraChatRoomDTO }
  | { ok: false; error: "not_found" | "forbidden" | "bad_request" | "db_error"; message?: string };

/**
 * 서브/비공개 모임 채팅방 생성. meetings.chat_room_id 는 건드리지 않습니다.
 */
export async function createMeetingExtraChatRoom(
  sb: SupabaseClient<any>,
  opts: {
    meetingId: string;
    createdByUserId: string;
    title: string;
    description: string | null;
    kind: "sub_all" | "sub_selected" | "private_selected";
    selectedUserIds: string[];
  },
): Promise<CreateMeetingExtraChatResult> {
  const { meetingId, createdByUserId, kind } = opts;
  const title = opts.title.trim().slice(0, 80);
  const description =
    opts.description == null ? null : String(opts.description).trim().slice(0, 500) || null;

  if (!title) return { ok: false, error: "bad_request", message: "title_required" };

  const { data: meeting } = await sb
    .from("meetings")
    .select("id, post_id, host_user_id, created_by, title")
    .eq("id", meetingId)
    .maybeSingle();
  const meet = meeting as {
    id?: string;
    post_id?: string | null;
    host_user_id?: string | null;
    created_by?: string | null;
    title?: string | null;
  } | null;
  if (!meet?.id) return { ok: false, error: "not_found" };

  const host = String(meet.host_user_id ?? meet.created_by ?? "").trim();
  const { data: creatorMem } = await sb
    .from("meeting_members")
    .select("role")
    .eq("meeting_id", meetingId)
    .eq("user_id", createdByUserId)
    .eq("status", "joined")
    .maybeSingle();
  const cr = creatorMem as { role?: string } | null;
  const canCreate = createdByUserId === host || cr?.role === "co_host";
  if (!canCreate) return { ok: false, error: "forbidden" };

  const { data: joinedRows } = await sb
    .from("meeting_members")
    .select("user_id")
    .eq("meeting_id", meetingId)
    .eq("status", "joined");
  const joinedSet = new Set(
    (joinedRows ?? []).map((r) => String((r as { user_id: string }).user_id)),
  );
  if (!joinedSet.has(createdByUserId)) return { ok: false, error: "forbidden" };

  let participantIds: string[] = [];
  if (kind === "sub_all") {
    participantIds = [...joinedSet];
  } else {
    const picked = [...new Set(opts.selectedUserIds.map((u) => String(u).trim()).filter(Boolean))].filter(
      (u) => joinedSet.has(u),
    );
    if (kind === "private_selected") {
      if (picked.length < 1) {
        return { ok: false, error: "bad_request", message: "private_needs_invitees" };
      }
    } else if (picked.length < 1) {
      return { ok: false, error: "bad_request", message: "sub_selected_needs_members" };
    }
    participantIds = [...new Set([createdByUserId, ...picked])];
  }

  const isPrivate = kind === "private_selected";
  const roomType = isPrivate ? "private" : "sub";
  const preview = `${title.slice(0, 36)} · 모임 채팅`;

  const relatedCommunityPostIdExtra = await communityPostIdIfExists(sb, meet.post_id);
  const insertExtra = await insertMeetingMainChatRoomFlexible(sb, {
    meeting_id: meetingId,
    related_post_id: null,
    related_community_post_id: relatedCommunityPostIdExtra,
    related_group_id: meetingId,
    initiator_id: createdByUserId,
    peer_id: createdByUserId,
    request_status: "approved",
    participants_count: participantIds.length,
    last_message_preview: preview,
  });
  const linkedId = insertExtra.roomId;
  if (!linkedId) {
    return { ok: false, error: "db_error", message: insertExtra.lastError };
  }

  const now = new Date().toISOString();
  const chatParts = participantIds.map((user_id) => ({
    room_id: linkedId,
    user_id,
    role_in_room: "member" as const,
    is_active: true,
    hidden: false,
    joined_at: now,
    unread_count: 0,
  }));
  const { error: cpErr } = await sb.from("chat_room_participants").insert(chatParts);
  if (cpErr) {
    await sb.from("chat_rooms").delete().eq("id", linkedId);
    return { ok: false, error: "db_error", message: cpErr.message };
  }

  const { data: metaRow, error: metaErr } = await sb
    .from("meeting_chat_rooms")
    .insert({
      meeting_id: meetingId,
      title,
      description,
      room_type: roomType,
      is_private: isPrivate,
      linked_chat_room_id: linkedId,
      created_by: createdByUserId,
    })
    .select("id, title, description, room_type, is_private, linked_chat_room_id, created_at")
    .single();

  if (metaErr || !metaRow) {
    await sb.from("chat_rooms").delete().eq("id", linkedId);
    return { ok: false, error: "db_error", message: metaErr?.message };
  }

  const mcrId = String((metaRow as { id: string }).id);
  const mcpRows = participantIds.map((user_id) => ({
    room_id: mcrId,
    user_id,
    role: user_id === createdByUserId ? ("owner" as const) : ("member" as const),
    joined_at: now,
  }));
  const { error: mcpErr } = await sb.from("meeting_chat_participants").insert(mcpRows);
  if (mcpErr) {
    await sb.from("meeting_chat_rooms").delete().eq("id", mcrId);
    await sb.from("chat_room_participants").delete().eq("room_id", linkedId);
    await sb.from("chat_rooms").delete().eq("id", linkedId);
    return { ok: false, error: "db_error", message: mcpErr.message };
  }

  await sb.from("chat_messages").insert({
    room_id: linkedId,
    sender_id: null,
    message_type: "system",
    body: "채팅방이 생성되었습니다.",
  });

  const dto: MeetingExtraChatRoomDTO = {
    id: mcrId,
    title,
    description,
    room_type: roomType,
    is_private: isPrivate,
    linked_chat_room_id: linkedId,
    created_at: String((metaRow as { created_at: string }).created_at),
  };
  return { ok: true, meetingChatRoom: dto };
}
