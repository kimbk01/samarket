import type { SupabaseClient } from "@supabase/supabase-js";
import { hashCommunityChatJoinPassword, verifyCommunityChatJoinPassword } from "@/lib/community-meeting-open-chat/join-password";
import { insertMeetingOpenChatSystemMessage } from "./messages-service";
import { getActiveMeetingOpenChatMember } from "./room-access";
import type { MeetingOpenChatJoinType, MeetingOpenChatRoomPublic } from "./types";

const ROOM_SELECT =
  "id, meeting_id, title, description, thumbnail_url, join_type, password_hash, max_members, is_active, is_searchable, allow_rejoin_after_kick, owner_user_id, last_message_preview, last_message_at, active_member_count, pending_join_count, created_at, updated_at";

export function meetingOpenChatRoomToPublic(row: Record<string, unknown>): MeetingOpenChatRoomPublic {
  const join_type = row.join_type as MeetingOpenChatJoinType;
  const hashStr = String((row as { password_hash?: unknown }).password_hash ?? "").trim();
  const has_password =
    join_type === "password" ||
    join_type === "password_approval" ||
    (join_type === "free" && hashStr.length > 0);
  const { password_hash: _p, ...rest } = row as Record<string, unknown> & { password_hash?: unknown };
  return {
    ...(rest as Omit<MeetingOpenChatRoomPublic, "has_password">),
    join_type,
    has_password,
  } as MeetingOpenChatRoomPublic;
}

function isMissingMeetingOpenChatSchemaError(message: string): boolean {
  return /42P01|meeting_open_chat_rooms|does not exist/i.test(message);
}

export async function listMeetingOpenChatRoomsForMeeting(
  sb: SupabaseClient<any>,
  meetingId: string,
  opts?: { search?: string | null }
): Promise<{ ok: true; rooms: MeetingOpenChatRoomPublic[] } | { ok: false; error: string; status: number }> {
  const mid = meetingId.trim();
  let q = sb.from("meeting_open_chat_rooms").select(ROOM_SELECT).eq("meeting_id", mid).eq("is_active", true);
  const s = opts?.search?.trim();
  if (s) {
    const safe = s.replace(/[%_\\]/g, "").slice(0, 80);
    if (safe.length > 0) {
      q = q.eq("is_searchable", true).ilike("title", `%${safe}%`);
    }
  }
  q = q.order("created_at", { ascending: false });
  const { data, error } = await q;
  if (error) {
    if (isMissingMeetingOpenChatSchemaError(error.message)) {
      return { ok: false, error: "schema_missing", status: 503 };
    }
    return { ok: false, error: error.message, status: 500 };
  }
  const rooms = (data ?? []).map((r) => meetingOpenChatRoomToPublic(r as Record<string, unknown>));
  return { ok: true, rooms };
}

export type CreateMeetingOpenChatRoomInput = {
  meetingId: string;
  creatorUserId: string;
  title: string;
  description?: string;
  thumbnailUrl?: string | null;
  joinType: MeetingOpenChatJoinType;
  joinPasswordPlain?: string | null;
  maxMembers: number;
  isSearchable: boolean;
  allowRejoinAfterKick?: boolean;
  ownerOpenNickname: string;
  ownerOpenProfileImageUrl?: string | null;
  ownerIntroMessage?: string;
};

export async function createMeetingOpenChatRoom(
  sb: SupabaseClient<any>,
  input: CreateMeetingOpenChatRoomInput
): Promise<{ ok: true; room: MeetingOpenChatRoomPublic } | { ok: false; error: string; status: number }> {
  const title = input.title.trim();
  if (!title) return { ok: false, error: "title_required", status: 400 };
  const maxMembers = Math.round(Number(input.maxMembers));
  if (!Number.isFinite(maxMembers) || maxMembers < 2 || maxMembers > 2000) {
    return { ok: false, error: "max_members_invalid", status: 400 };
  }
  const ownerOpenNickname = input.ownerOpenNickname.trim().slice(0, 40);
  if (!ownerOpenNickname) return { ok: false, error: "open_nickname_required", status: 400 };

  if (input.joinType === "password_approval") {
    return { ok: false, error: "join_type_not_implemented", status: 501 };
  }

  let password_hash: string | null = null;
  if (input.joinType === "password") {
    const pw = input.joinPasswordPlain?.trim() ?? "";
    if (pw.length < 4) return { ok: false, error: "password_too_short", status: 400 };
    password_hash = hashCommunityChatJoinPassword(pw);
  } else if (input.joinType !== "free" && input.joinType !== "approval") {
    return { ok: false, error: "join_type_invalid", status: 400 };
  }

  const now = new Date().toISOString();
  const roomInsert = {
    meeting_id: input.meetingId.trim(),
    title,
    description: (input.description ?? "").trim(),
    thumbnail_url: input.thumbnailUrl?.trim() || null,
    join_type: input.joinType,
    password_hash,
    max_members: maxMembers,
    is_active: true,
    is_searchable: input.isSearchable !== false,
    allow_rejoin_after_kick: input.allowRejoinAfterKick !== false,
    owner_user_id: input.creatorUserId,
    active_member_count: 1,
    pending_join_count: 0,
    updated_at: now,
  };

  const { data: roomRow, error: roomErr } = await sb
    .from("meeting_open_chat_rooms")
    .insert(roomInsert)
    .select(ROOM_SELECT)
    .single();

  if (roomErr || !roomRow) {
    if (roomErr && isMissingMeetingOpenChatSchemaError(roomErr.message)) {
      return { ok: false, error: "schema_missing", status: 503 };
    }
    return { ok: false, error: roomErr?.message ?? "insert_failed", status: 500 };
  }

  const roomId = String((roomRow as { id: string }).id);
  const { error: memErr } = await sb.from("meeting_open_chat_members").insert({
    room_id: roomId,
    user_id: input.creatorUserId,
    role: "owner",
    open_nickname: ownerOpenNickname,
    open_profile_image_url: input.ownerOpenProfileImageUrl?.trim() || null,
    intro_message: (input.ownerIntroMessage ?? "").trim().slice(0, 500),
    status: "active",
    joined_at: now,
    last_seen_at: now,
    updated_at: now,
  });

  if (memErr) {
    await sb.from("meeting_open_chat_rooms").delete().eq("id", roomId);
    if (isMissingMeetingOpenChatSchemaError(memErr.message)) {
      return { ok: false, error: "schema_missing", status: 503 };
    }
    return { ok: false, error: memErr.message, status: 500 };
  }

  await sb.from("meeting_open_chat_logs").insert({
    room_id: roomId,
    actor_user_id: input.creatorUserId,
    action_type: "room_created",
    action_detail: { title },
  });

  return { ok: true, room: meetingOpenChatRoomToPublic(roomRow as Record<string, unknown>) };
}

/**
 * 모임 신규 생성 직후: 활성 오픈채팅 방이 없으면 1개(무료 입장) 자동 생성.
 * `meeting_open_chat_*` 스키마가 없으면 조용히 건너뜀.
 */
function shouldFallbackEnsureDefaultToLegacyRpc(rpcErr: { message?: string } | null): boolean {
  if (!rpcErr) return false;
  const msg = String(rpcErr.message ?? "");
  return (
    /does not exist|Could not find the function|function .*|42883|PGRST202|404/i.test(msg) ||
    isMissingMeetingOpenChatSchemaError(msg)
  );
}

export async function ensureDefaultMeetingOpenChatRoomForNewMeeting(
  sb: SupabaseClient<any>,
  input: {
    meetingId: string;
    hostUserId: string;
    title: string;
    maxMembers: number;
    description?: string;
  }
): Promise<{ ok: true; created: boolean } | { ok: false; error: string }> {
  const mid = input.meetingId.trim();
  const uid = input.hostUserId.trim();
  if (!mid || !uid) return { ok: false, error: "bad_request" };

  const meetTitle = input.title.trim();
  const roomTitle = meetTitle.slice(0, 200) || "모임 오픈채팅";
  let ownerNick = meetTitle.replace(/\s+/g, " ").trim().slice(0, 40);
  if (ownerNick.length < 2) ownerNick = "모임장";

  const maxMem = Math.min(Math.max(2, Math.round(Number(input.maxMembers)) || 300), 2000);
  const desc = (input.description ?? "").trim().slice(0, 500);

  const { data: rpcRaw, error: rpcErr } = await sb.rpc("ensure_default_meeting_open_chat_room_atomic", {
    p_meeting_id: mid,
    p_host_user_id: uid,
    p_title: roomTitle,
    p_max_members: maxMem,
    p_description: desc,
  });

  if (!rpcErr && rpcRaw != null) {
    let pack: { ok?: boolean; created?: boolean; error?: string };
    if (typeof rpcRaw === "string") {
      try {
        pack = JSON.parse(rpcRaw) as { ok?: boolean; created?: boolean; error?: string };
      } catch {
        pack = {};
      }
    } else {
      pack = rpcRaw as { ok?: boolean; created?: boolean; error?: string };
    }
    if (pack.ok === true) {
      return { ok: true, created: Boolean(pack.created) };
    }
    if (typeof pack.error === "string") {
      if (isMissingMeetingOpenChatSchemaError(pack.error)) {
        return { ok: true, created: false };
      }
      return { ok: false, error: pack.error };
    }
  }

  if (rpcErr && !shouldFallbackEnsureDefaultToLegacyRpc(rpcErr)) {
    const msg = String(rpcErr.message ?? "");
    if (isMissingMeetingOpenChatSchemaError(msg)) return { ok: true, created: false };
    return { ok: false, error: msg };
  }

  const { count, error: cErr } = await sb
    .from("meeting_open_chat_rooms")
    .select("id", { count: "exact", head: true })
    .eq("meeting_id", mid)
    .eq("is_active", true);

  if (cErr) {
    if (isMissingMeetingOpenChatSchemaError(cErr.message)) {
      return { ok: true, created: false };
    }
    return { ok: false, error: cErr.message };
  }
  if ((count ?? 0) > 0) return { ok: true, created: false };

  const created = await createMeetingOpenChatRoom(sb, {
    meetingId: mid,
    creatorUserId: uid,
    title: roomTitle,
    description: desc,
    thumbnailUrl: null,
    joinType: "free",
    maxMembers: maxMem,
    isSearchable: true,
    allowRejoinAfterKick: true,
    ownerOpenNickname: ownerNick,
  });

  if (!created.ok) {
    if (created.error === "schema_missing" || created.status === 503) {
      return { ok: true, created: false };
    }
    return { ok: false, error: created.error };
  }

  await insertMeetingOpenChatSystemMessage(sb, {
    roomId: created.room.id,
    content: "채팅방이 열렸습니다. 오픈 닉네임으로 대화해 주세요.",
  });

  return { ok: true, created: true };
}

/**
 * 활성 오픈채팅 방이 없으면 기본 방 1개를 만들고,
 * 메인으로 안내할 room id(가장 오래된 활성 방)를 반환합니다.
 */
export async function ensureAndGetDefaultMeetingOpenChatRoomId(
  sb: SupabaseClient<any>,
  meetingId: string
): Promise<{ ok: true; roomId: string | null } | { ok: false; error: string }> {
  const mid = meetingId.trim();
  if (!mid) return { ok: false, error: "bad_request" };

  const { data: meet, error: mErr } = await sb
    .from("meetings")
    .select("title, max_members, host_user_id, created_by, post_id, description")
    .eq("id", mid)
    .maybeSingle();

  if (mErr) {
    if (isMissingMeetingOpenChatSchemaError(mErr.message)) return { ok: true, roomId: null };
    return { ok: false, error: mErr.message };
  }

  const row = meet as {
    title?: string | null;
    max_members?: number | null;
    host_user_id?: string | null;
    created_by?: string | null;
    post_id?: string | null;
    description?: string | null;
  } | null;
  if (!row) return { ok: false, error: "meeting_not_found" };

  let hostUid = String(row.host_user_id ?? row.created_by ?? "").trim();
  if (!hostUid && row.post_id) {
    const { data: postAuthor } = await sb
      .from("community_posts")
      .select("user_id")
      .eq("id", String(row.post_id))
      .maybeSingle();
    hostUid = String((postAuthor as { user_id?: string } | null)?.user_id ?? "").trim();
  }
  if (!hostUid) return { ok: true, roomId: null };

  const ensured = await ensureDefaultMeetingOpenChatRoomForNewMeeting(sb, {
    meetingId: mid,
    hostUserId: hostUid,
    title: String(row.title ?? "").trim() || "모임",
    maxMembers: Number(row.max_members) || 300,
    description: String(row.description ?? "").trim(),
  });
  if (!ensured.ok) {
    return { ok: false, error: ensured.error };
  }

  const listed = await listMeetingOpenChatRoomsForMeeting(sb, mid);
  if (!listed.ok) {
    if (listed.error === "schema_missing") return { ok: true, roomId: null };
    return { ok: false, error: listed.error };
  }
  const rooms = listed.rooms;
  if (rooms.length === 0) return { ok: true, roomId: null };

  const sorted = [...rooms].sort((a, b) => {
    const ta = new Date(a.created_at ?? 0).getTime();
    const tb = new Date(b.created_at ?? 0).getTime();
    return ta - tb;
  });
  return { ok: true, roomId: sorted[0]?.id ?? null };
}

export async function getMeetingOpenChatRoomInMeeting(
  sb: SupabaseClient<any>,
  meetingId: string,
  roomId: string
): Promise<{ ok: true; room: MeetingOpenChatRoomPublic } | { ok: false; error: string; status: number }> {
  const { data, error } = await sb
    .from("meeting_open_chat_rooms")
    .select(ROOM_SELECT)
    .eq("id", roomId.trim())
    .eq("meeting_id", meetingId.trim())
    .maybeSingle();

  if (error) {
    if (isMissingMeetingOpenChatSchemaError(error.message)) {
      return { ok: false, error: "schema_missing", status: 503 };
    }
    return { ok: false, error: error.message, status: 500 };
  }
  if (!data) return { ok: false, error: "not_found", status: 404 };
  return { ok: true, room: meetingOpenChatRoomToPublic(data as Record<string, unknown>) };
}

export async function hasActiveMeetingOpenChatBan(
  sb: SupabaseClient<any>,
  roomId: string,
  userId: string
): Promise<boolean> {
  const { data } = await sb
    .from("meeting_open_chat_bans")
    .select("id, expires_at")
    .eq("room_id", roomId)
    .eq("user_id", userId)
    .eq("is_active", true)
    .maybeSingle();
  if (!data) return false;
  const until = (data as { expires_at?: string | null }).expires_at;
  if (!until) return true;
  return new Date(until).getTime() > Date.now();
}

async function countActiveMembers(sb: SupabaseClient<any>, roomId: string): Promise<number> {
  const { count, error } = await sb
    .from("meeting_open_chat_members")
    .select("id", { count: "exact", head: true })
    .eq("room_id", roomId)
    .eq("status", "active");
  if (error) return 0;
  return count ?? 0;
}

export async function syncMeetingOpenChatRoomCounts(
  sb: SupabaseClient<any>,
  roomId: string
): Promise<{ ok: true } | { ok: false; error: string; status: number }> {
  const active = await countActiveMembers(sb, roomId);
  const { count: pendingCount, error: pErr } = await sb
    .from("meeting_open_chat_join_requests")
    .select("id", { count: "exact", head: true })
    .eq("room_id", roomId.trim())
    .eq("status", "pending");
  if (pErr) {
    if (isMissingMeetingOpenChatSchemaError(pErr.message)) {
      return { ok: false, error: "schema_missing", status: 503 };
    }
    return { ok: false, error: pErr.message, status: 500 };
  }
  const pending = pendingCount ?? 0;
  const { error } = await sb
    .from("meeting_open_chat_rooms")
    .update({
      active_member_count: active,
      pending_join_count: pending,
      updated_at: new Date().toISOString(),
    })
    .eq("id", roomId.trim());
  if (error) {
    if (isMissingMeetingOpenChatSchemaError(error.message)) {
      return { ok: false, error: "schema_missing", status: 503 };
    }
    return { ok: false, error: error.message, status: 500 };
  }
  return { ok: true };
}

/** 활성 멤버가 스스로 방을 나감 (`status=left`, 인원 수·시스템 메시지 반영) */
export async function leaveMeetingOpenChatRoom(
  sb: SupabaseClient<any>,
  input: { meetingId: string; roomId: string; userId: string }
): Promise<{ ok: true } | { ok: false; error: string; status: number }> {
  const mid = input.meetingId.trim();
  const rid = input.roomId.trim();
  const uid = input.userId.trim();
  if (!mid || !rid || !uid) return { ok: false, error: "bad_request", status: 400 };

  const room = await getMeetingOpenChatRoomInMeeting(sb, mid, rid);
  if (!room.ok) return room;

  const mem = await getActiveMeetingOpenChatMember(sb, rid, uid);
  if (!mem.ok) return mem;

  const now = new Date().toISOString();
  const { error: upErr } = await sb
    .from("meeting_open_chat_members")
    .update({ status: "left", updated_at: now })
    .eq("id", mem.member.memberId)
    .eq("room_id", rid)
    .eq("status", "active");
  if (upErr) {
    if (isMissingMeetingOpenChatSchemaError(upErr.message)) {
      return { ok: false, error: "schema_missing", status: 503 };
    }
    return { ok: false, error: upErr.message, status: 500 };
  }

  const sync = await syncMeetingOpenChatRoomCounts(sb, rid);
  if (!sync.ok) return sync;

  const nick = String(mem.member.open_nickname ?? "").trim() || "member";
  const sys = await insertMeetingOpenChatSystemMessage(sb, {
    roomId: rid,
    content: `${nick}님이 나갔습니다.`,
  });
  if (!sys.ok) return { ok: false, error: sys.error, status: sys.status };

  await sb.from("meeting_open_chat_logs").insert({
    room_id: rid,
    actor_user_id: uid,
    target_user_id: uid,
    action_type: "member_left_voluntary",
    action_detail: { member_id: mem.member.memberId },
  });

  return { ok: true };
}

export type JoinMeetingOpenChatRoomInput = {
  meetingId: string;
  roomId: string;
  userId: string;
  openNickname: string;
  openProfileImageUrl?: string | null;
  introMessage?: string | null;
  joinPasswordPlain?: string | null;
};

export async function joinMeetingOpenChatRoom(
  sb: SupabaseClient<any>,
  input: JoinMeetingOpenChatRoomInput
): Promise<
  | { ok: true; joined: true }
  | { ok: true; joined: false; pendingApproval: true; requestId: string }
  | { ok: false; error: string; status: number }
> {
  const roomId = input.roomId.trim();
  const userId = input.userId.trim();
  const openNickname = input.openNickname.trim().slice(0, 40);
  if (!openNickname) return { ok: false, error: "open_nickname_required", status: 400 };

  const raw = await sb
    .from("meeting_open_chat_rooms")
    .select(ROOM_SELECT)
    .eq("id", roomId)
    .eq("meeting_id", input.meetingId.trim())
    .maybeSingle();
  if (raw.error) {
    if (isMissingMeetingOpenChatSchemaError(raw.error.message)) {
      return { ok: false, error: "schema_missing", status: 503 };
    }
    return { ok: false, error: raw.error.message, status: 500 };
  }
  const fullRow = raw.data as Record<string, unknown> | null;
  if (!fullRow) return { ok: false, error: "not_found", status: 404 };

  if (!Boolean(fullRow.is_active)) {
    return { ok: false, error: "room_not_active", status: 403 };
  }

  if (await hasActiveMeetingOpenChatBan(sb, roomId, userId)) {
    return { ok: false, error: "banned", status: 403 };
  }

  const joinType = fullRow.join_type as MeetingOpenChatJoinType;
  if (joinType === "password_approval") {
    return { ok: false, error: "join_type_not_implemented", status: 501 };
  }

  const maxMembers = Number(fullRow.max_members ?? 300);
  const allowRejoinAfterKick = Boolean(fullRow.allow_rejoin_after_kick);

  const { data: existingMember } = await sb
    .from("meeting_open_chat_members")
    .select("id, status")
    .eq("room_id", roomId)
    .eq("user_id", userId)
    .maybeSingle();

  const em = existingMember as { id?: string; status?: string } | null;
  if (em?.status === "active") {
    return { ok: true, joined: true };
  }

  const pwHash = fullRow.password_hash as string | null;
  const mustVerifyRoomPassword =
    joinType === "password" ||
    (joinType === "free" && Boolean(String(pwHash ?? "").trim()));
  if (mustVerifyRoomPassword) {
    const okPw = verifyCommunityChatJoinPassword(input.joinPasswordPlain ?? "", pwHash);
    if (!okPw) return { ok: false, error: "invalid_password", status: 403 };
  }

  const activeCount = await countActiveMembers(sb, roomId);

  if (joinType === "approval") {
    const { data: dup } = await sb
      .from("meeting_open_chat_join_requests")
      .select("id")
      .eq("room_id", roomId)
      .eq("user_id", userId)
      .eq("status", "pending")
      .maybeSingle();
    if (dup?.id) {
      return {
        ok: true,
        joined: false,
        pendingApproval: true,
        requestId: String((dup as { id: string }).id),
      };
    }

    const now = new Date().toISOString();
    const { data: reqRow, error: reqErr } = await sb
      .from("meeting_open_chat_join_requests")
      .insert({
        room_id: roomId,
        user_id: userId,
        intro_message: (input.introMessage ?? "").trim().slice(0, 500),
        open_nickname: openNickname,
        open_profile_image_url: input.openProfileImageUrl?.trim() || null,
        status: "pending",
      })
      .select("id")
      .single();

    if (reqErr || !reqRow) {
      if (reqErr?.code === "23505") {
        const { data: again } = await sb
          .from("meeting_open_chat_join_requests")
          .select("id")
          .eq("room_id", roomId)
          .eq("user_id", userId)
          .eq("status", "pending")
          .maybeSingle();
        if (again?.id) {
          return {
            ok: true,
            joined: false,
            pendingApproval: true,
            requestId: String((again as { id: string }).id),
          };
        }
      }
      if (reqErr && isMissingMeetingOpenChatSchemaError(reqErr.message)) {
        return { ok: false, error: "schema_missing", status: 503 };
      }
      return { ok: false, error: reqErr?.message ?? "request_failed", status: 500 };
    }

    await syncMeetingOpenChatRoomCounts(sb, roomId);
    await sb.from("meeting_open_chat_logs").insert({
      room_id: roomId,
      actor_user_id: userId,
      target_user_id: userId,
      action_type: "join_request_submitted",
      action_detail: { open_nickname: openNickname },
    });

    return {
      ok: true,
      joined: false,
      pendingApproval: true,
      requestId: String((reqRow as { id: string }).id),
    };
  }

  if (em?.status === "kicked" && !allowRejoinAfterKick) {
    return { ok: false, error: "kicked_cannot_rejoin", status: 403 };
  }

  if (activeCount >= maxMembers) {
    return { ok: false, error: "room_full", status: 409 };
  }

  const now = new Date().toISOString();

  if (em?.id && typeof em.id === "string") {
    const { error: upErr } = await sb
      .from("meeting_open_chat_members")
      .update({
        status: "active",
        open_nickname: openNickname,
        open_profile_image_url: input.openProfileImageUrl?.trim() || null,
        intro_message: (input.introMessage ?? "").trim().slice(0, 500),
        kicked_at: null,
        banned_at: null,
        joined_at: now,
        last_seen_at: now,
        updated_at: now,
      })
      .eq("id", em.id);
    if (upErr) {
      if (upErr.code === "23505") {
        return { ok: false, error: "open_nickname_taken", status: 409 };
      }
      if (isMissingMeetingOpenChatSchemaError(upErr.message)) {
        return { ok: false, error: "schema_missing", status: 503 };
      }
      return { ok: false, error: upErr.message, status: 500 };
    }
  } else {
    const { error: insErr } = await sb.from("meeting_open_chat_members").insert({
      room_id: roomId,
      user_id: userId,
      role: "member",
      open_nickname: openNickname,
      open_profile_image_url: input.openProfileImageUrl?.trim() || null,
      intro_message: (input.introMessage ?? "").trim().slice(0, 500),
      status: "active",
      joined_at: now,
      last_seen_at: now,
      updated_at: now,
    });
    if (insErr) {
      if (insErr.code === "23505") {
        const msg = insErr.message?.includes("meeting_open_chat_members_room_nickname") ? "open_nickname_taken" : insErr.message;
        return { ok: false, error: msg.includes("open_nickname") ? "open_nickname_taken" : msg, status: 409 };
      }
      if (isMissingMeetingOpenChatSchemaError(insErr.message)) {
        return { ok: false, error: "schema_missing", status: 503 };
      }
      return { ok: false, error: insErr.message, status: 500 };
    }
  }

  await syncMeetingOpenChatRoomCounts(sb, roomId);
  await sb.from("meeting_open_chat_logs").insert({
    room_id: roomId,
    actor_user_id: userId,
    target_user_id: userId,
    action_type: "member_joined",
    action_detail: { open_nickname: openNickname },
  });

  await insertMeetingOpenChatSystemMessage(sb, {
    roomId,
    content: `${openNickname}님이 입장했습니다.`,
  });

  return { ok: true, joined: true };
}

export type PatchMeetingOpenChatRoomInput = {
  title?: string;
  description?: string;
  thumbnailUrl?: string | null;
  maxMembers?: number;
  isSearchable?: boolean;
  allowRejoinAfterKick?: boolean;
  isActive?: boolean;
};

export async function patchMeetingOpenChatRoom(
  sb: SupabaseClient<any>,
  meetingId: string,
  roomId: string,
  ownerUserId: string,
  patch: PatchMeetingOpenChatRoomInput
): Promise<{ ok: true; room: MeetingOpenChatRoomPublic } | { ok: false; error: string; status: number }> {
  const mid = meetingId.trim();
  const rid = roomId.trim();
  const { data: row, error } = await sb
    .from("meeting_open_chat_rooms")
    .select(`${ROOM_SELECT}`)
    .eq("id", rid)
    .eq("meeting_id", mid)
    .maybeSingle();
  if (error) {
    if (isMissingMeetingOpenChatSchemaError(error.message)) {
      return { ok: false, error: "schema_missing", status: 503 };
    }
    return { ok: false, error: error.message, status: 500 };
  }
  if (!row) return { ok: false, error: "not_found", status: 404 };
  const owner = String((row as { owner_user_id: string }).owner_user_id);
  if (owner !== ownerUserId.trim()) {
    return { ok: false, error: "forbidden", status: 403 };
  }

  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (patch.title !== undefined) {
    const t = patch.title.trim();
    if (!t) return { ok: false, error: "title_required", status: 400 };
    updates.title = t;
  }
  if (patch.description !== undefined) updates.description = patch.description.trim();
  if (patch.thumbnailUrl !== undefined) {
    updates.thumbnail_url = patch.thumbnailUrl === null ? null : patch.thumbnailUrl.trim() || null;
  }
  if (patch.maxMembers !== undefined) {
    const m = Math.round(Number(patch.maxMembers));
    if (!Number.isFinite(m) || m < 2 || m > 2000) {
      return { ok: false, error: "max_members_invalid", status: 400 };
    }
    updates.max_members = m;
  }
  if (patch.isSearchable !== undefined) updates.is_searchable = patch.isSearchable;
  if (patch.allowRejoinAfterKick !== undefined) {
    updates.allow_rejoin_after_kick = patch.allowRejoinAfterKick;
  }
  if (patch.isActive !== undefined) updates.is_active = patch.isActive;

  if (Object.keys(updates).length <= 1) {
    const reread = await getMeetingOpenChatRoomInMeeting(sb, mid, rid);
    if (!reread.ok) return reread;
    return { ok: true, room: reread.room };
  }

  const { data: updated, error: upErr } = await sb
    .from("meeting_open_chat_rooms")
    .update(updates)
    .eq("id", rid)
    .eq("meeting_id", mid)
    .select(ROOM_SELECT)
    .single();
  if (upErr || !updated) {
    if (upErr && isMissingMeetingOpenChatSchemaError(upErr.message)) {
      return { ok: false, error: "schema_missing", status: 503 };
    }
    return { ok: false, error: upErr?.message ?? "update_failed", status: 500 };
  }
  return { ok: true, room: meetingOpenChatRoomToPublic(updated as Record<string, unknown>) };
}
