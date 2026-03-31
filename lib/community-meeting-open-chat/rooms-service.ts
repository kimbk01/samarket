import type { SupabaseClient } from "@supabase/supabase-js";
import { hashCommunityChatJoinPassword, verifyCommunityChatJoinPassword } from "./join-password";
import type { CommunityChatJoinType, CommunityChatRoomPublic } from "./types";

const ROOM_SELECT =
  "id, meeting_id, title, description, thumbnail_url, join_type, password_hash, max_members, is_searchable, status, owner_user_id, report_threshold, joined_count, pending_join_count, closed_at, closed_by, created_at, updated_at";

export function communityChatRoomToPublic(row: Record<string, unknown>): CommunityChatRoomPublic {
  const join_type = row.join_type as CommunityChatJoinType;
  const has_password = join_type === "password";
  const { password_hash: _p, ...rest } = row as Record<string, unknown> & { password_hash?: unknown };
  return {
    ...(rest as Omit<CommunityChatRoomPublic, "has_password">),
    join_type,
    has_password,
  } as CommunityChatRoomPublic;
}

function isMissingCommunityChatSchemaError(message: string): boolean {
  return /42P01|community_chat_rooms|does not exist/i.test(message);
}

export async function listCommunityChatRoomsForMeeting(
  sb: SupabaseClient<any>,
  meetingId: string,
  opts?: { search?: string | null }
): Promise<{ ok: true; rooms: CommunityChatRoomPublic[] } | { ok: false; error: string; status: number }> {
  const mid = meetingId.trim();
  let q = sb.from("community_chat_rooms").select(ROOM_SELECT).eq("meeting_id", mid).eq("status", "active");
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
    if (isMissingCommunityChatSchemaError(error.message)) {
      return { ok: false, error: "schema_missing", status: 503 };
    }
    return { ok: false, error: error.message, status: 500 };
  }
  const rooms = (data ?? []).map((r) => communityChatRoomToPublic(r as Record<string, unknown>));
  return { ok: true, rooms };
}

export type CreateCommunityChatRoomServiceInput = {
  meetingId: string;
  creatorUserId: string;
  title: string;
  description?: string;
  thumbnailUrl?: string | null;
  joinType: CommunityChatJoinType;
  joinPasswordPlain?: string | null;
  maxMembers: number;
  isSearchable: boolean;
  reportThreshold?: number | null;
  ownerNickname: string;
  ownerAvatarUrl?: string | null;
};

export async function createCommunityChatRoom(
  sb: SupabaseClient<any>,
  input: CreateCommunityChatRoomServiceInput
): Promise<
  | { ok: true; room: CommunityChatRoomPublic }
  | { ok: false; error: string; status: number }
> {
  const title = input.title.trim();
  if (!title) return { ok: false, error: "title_required", status: 400 };
  const maxMembers = Math.round(Number(input.maxMembers));
  if (!Number.isFinite(maxMembers) || maxMembers < 2 || maxMembers > 2000) {
    return { ok: false, error: "max_members_invalid", status: 400 };
  }
  const ownerNickname = input.ownerNickname.trim().slice(0, 40);
  if (!ownerNickname) return { ok: false, error: "nickname_required", status: 400 };

  let password_hash: string | null = null;
  if (input.joinType === "password") {
    const pw = input.joinPasswordPlain?.trim() ?? "";
    if (pw.length < 4) return { ok: false, error: "password_too_short", status: 400 };
    password_hash = hashCommunityChatJoinPassword(pw);
  } else if (input.joinType !== "public" && input.joinType !== "approval") {
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
    is_searchable: input.isSearchable !== false,
    status: "active" as const,
    owner_user_id: input.creatorUserId,
    report_threshold:
      input.reportThreshold != null && Number.isFinite(Number(input.reportThreshold))
        ? Math.round(Number(input.reportThreshold))
        : null,
    joined_count: 1,
    pending_join_count: 0,
    updated_at: now,
  };

  const { data: roomRow, error: roomErr } = await sb
    .from("community_chat_rooms")
    .insert(roomInsert)
    .select(ROOM_SELECT)
    .single();

  if (roomErr || !roomRow) {
    if (roomErr && isMissingCommunityChatSchemaError(roomErr.message)) {
      return { ok: false, error: "schema_missing", status: 503 };
    }
    return { ok: false, error: roomErr?.message ?? "insert_failed", status: 500 };
  }

  const roomId = String((roomRow as { id: string }).id);
  const { error: memErr } = await sb.from("community_chat_room_members").insert({
    room_id: roomId,
    user_id: input.creatorUserId,
    role: "owner",
    nickname: ownerNickname,
    avatar_url: input.ownerAvatarUrl?.trim() || null,
    member_status: "joined",
    joined_at: now,
    updated_at: now,
  });

  if (memErr) {
    await sb.from("community_chat_rooms").delete().eq("id", roomId);
    if (isMissingCommunityChatSchemaError(memErr.message)) {
      return { ok: false, error: "schema_missing", status: 503 };
    }
    return { ok: false, error: memErr.message, status: 500 };
  }

  await sb.from("community_chat_logs").insert({
    room_id: roomId,
    actor_user_id: input.creatorUserId,
    action_type: "room_created",
    payload: { title },
  });

  return { ok: true, room: communityChatRoomToPublic(roomRow as Record<string, unknown>) };
}

export async function getCommunityChatRoomInMeeting(
  sb: SupabaseClient<any>,
  meetingId: string,
  roomId: string
): Promise<
  | { ok: true; room: CommunityChatRoomPublic }
  | { ok: false; error: string; status: number }
> {
  const { data, error } = await sb
    .from("community_chat_rooms")
    .select(ROOM_SELECT)
    .eq("id", roomId.trim())
    .eq("meeting_id", meetingId.trim())
    .maybeSingle();

  if (error) {
    if (isMissingCommunityChatSchemaError(error.message)) {
      return { ok: false, error: "schema_missing", status: 503 };
    }
    return { ok: false, error: error.message, status: 500 };
  }
  if (!data) return { ok: false, error: "not_found", status: 404 };
  return { ok: true, room: communityChatRoomToPublic(data as Record<string, unknown>) };
}

async function hasActiveBan(
  sb: SupabaseClient<any>,
  roomId: string,
  userId: string
): Promise<boolean> {
  const { data } = await sb
    .from("community_chat_bans")
    .select("id, ban_until")
    .eq("room_id", roomId)
    .eq("user_id", userId)
    .is("released_at", null)
    .maybeSingle();
  if (!data) return false;
  const until = (data as { ban_until?: string | null }).ban_until;
  if (!until) return true;
  return new Date(until).getTime() > Date.now();
}

async function countJoinedMembers(sb: SupabaseClient<any>, roomId: string): Promise<number> {
  const { count, error } = await sb
    .from("community_chat_room_members")
    .select("id", { count: "exact", head: true })
    .eq("room_id", roomId)
    .eq("member_status", "joined");
  if (error) return 0;
  return count ?? 0;
}

export type JoinCommunityChatRoomInput = {
  meetingId: string;
  roomId: string;
  userId: string;
  nickname: string;
  avatarUrl?: string | null;
  passwordPlain?: string | null;
  requestMessage?: string | null;
};

export async function joinCommunityChatRoom(
  sb: SupabaseClient<any>,
  input: JoinCommunityChatRoomInput
): Promise<
  | { ok: true; joined: true }
  | { ok: true; joined: false; pendingApproval: true; requestId: string }
  | { ok: false; error: string; status: number }
> {
  const roomId = input.roomId.trim();
  const userId = input.userId.trim();
  const nickname = input.nickname.trim().slice(0, 40);
  if (!nickname) return { ok: false, error: "nickname_required", status: 400 };

  const raw = await sb
    .from("community_chat_rooms")
    .select(ROOM_SELECT)
    .eq("id", roomId)
    .eq("meeting_id", input.meetingId.trim())
    .maybeSingle();
  if (raw.error) {
    if (isMissingCommunityChatSchemaError(raw.error.message)) {
      return { ok: false, error: "schema_missing", status: 503 };
    }
    return { ok: false, error: raw.error.message, status: 500 };
  }
  const fullRow = raw.data as Record<string, unknown> | null;
  if (!fullRow) return { ok: false, error: "not_found", status: 404 };

  const status = String(fullRow.status ?? "");
  if (status !== "active") {
    return { ok: false, error: "room_not_active", status: 403 };
  }

  if (await hasActiveBan(sb, roomId, userId)) {
    return { ok: false, error: "banned", status: 403 };
  }

  const joinType = fullRow.join_type as CommunityChatJoinType;
  const maxMembers = Number(fullRow.max_members ?? 300);

  const { data: existingMember } = await sb
    .from("community_chat_room_members")
    .select("id, member_status")
    .eq("room_id", roomId)
    .eq("user_id", userId)
    .maybeSingle();

  const em = existingMember as { id?: string; member_status?: string } | null;
  if (em?.member_status === "joined") {
    return { ok: true, joined: true };
  }

  if (joinType === "password") {
    const okPw = verifyCommunityChatJoinPassword(
      input.passwordPlain ?? "",
      fullRow.password_hash as string | null
    );
    if (!okPw) return { ok: false, error: "invalid_password", status: 403 };
  }

  const joinedCount = await countJoinedMembers(sb, roomId);
  if (joinedCount >= maxMembers) {
    return { ok: false, error: "room_full", status: 409 };
  }

  const now = new Date().toISOString();

  if (joinType === "approval") {
    const { data: dup } = await sb
      .from("community_chat_join_requests")
      .select("id")
      .eq("room_id", roomId)
      .eq("user_id", userId)
      .eq("status", "pending")
      .maybeSingle();
    if (dup?.id) {
      return { ok: true, joined: false, pendingApproval: true, requestId: String((dup as { id: string }).id) };
    }

    const { data: reqRow, error: reqErr } = await sb
      .from("community_chat_join_requests")
      .insert({
        room_id: roomId,
        user_id: userId,
        nickname,
        request_message: (input.requestMessage ?? "").trim().slice(0, 500),
        status: "pending",
        updated_at: now,
      })
      .select("id")
      .single();

    if (reqErr || !reqRow) {
      if (reqErr?.code === "23505") {
        const { data: again } = await sb
          .from("community_chat_join_requests")
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
      if (reqErr && isMissingCommunityChatSchemaError(reqErr.message)) {
        return { ok: false, error: "schema_missing", status: 503 };
      }
      return { ok: false, error: reqErr?.message ?? "request_failed", status: 500 };
    }

    const pending = Number(fullRow.pending_join_count ?? 0) + 1;
    await sb.from("community_chat_rooms").update({ pending_join_count: pending, updated_at: now }).eq("id", roomId);

    await sb.from("community_chat_logs").insert({
      room_id: roomId,
      actor_user_id: userId,
      action_type: "join_request_submitted",
      target_user_id: userId,
      payload: { nickname },
    });

    return {
      ok: true,
      joined: false,
      pendingApproval: true,
      requestId: String((reqRow as { id: string }).id),
    };
  }

  /** public | password: 즉시 멤버 */
  if (em?.id && typeof em.id === "string") {
    const { error: upErr } = await sb
      .from("community_chat_room_members")
      .update({
        member_status: "joined",
        nickname,
        avatar_url: input.avatarUrl?.trim() || null,
        left_at: null,
        kicked_at: null,
        kicked_by: null,
        joined_at: now,
        updated_at: now,
      })
      .eq("id", em.id);
    if (upErr) {
      if (isMissingCommunityChatSchemaError(upErr.message)) {
        return { ok: false, error: "schema_missing", status: 503 };
      }
      return { ok: false, error: upErr.message, status: 500 };
    }
  } else {
    const { error: insErr } = await sb.from("community_chat_room_members").insert({
      room_id: roomId,
      user_id: userId,
      role: "member",
      nickname,
      avatar_url: input.avatarUrl?.trim() || null,
      member_status: "joined",
      joined_at: now,
      updated_at: now,
    });
    if (insErr) {
      if (insErr.code === "23505") {
        const { error: up2 } = await sb
          .from("community_chat_room_members")
          .update({
            member_status: "joined",
            nickname,
            avatar_url: input.avatarUrl?.trim() || null,
            left_at: null,
            kicked_at: null,
            kicked_by: null,
            joined_at: now,
            updated_at: now,
          })
          .eq("room_id", roomId)
          .eq("user_id", userId);
        if (up2) return { ok: false, error: up2.message, status: 500 };
      } else {
        if (isMissingCommunityChatSchemaError(insErr.message)) {
          return { ok: false, error: "schema_missing", status: 503 };
        }
        return { ok: false, error: insErr.message, status: 500 };
      }
    }
  }

  const newJoined = joinedCount + 1;
  await sb
    .from("community_chat_rooms")
    .update({ joined_count: newJoined, updated_at: now })
    .eq("id", roomId);

  await sb.from("community_chat_logs").insert({
    room_id: roomId,
    actor_user_id: userId,
    action_type: "member_joined",
    target_user_id: userId,
    payload: { nickname },
  });

  return { ok: true, joined: true };
}
