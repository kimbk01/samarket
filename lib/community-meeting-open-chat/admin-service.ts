import type { SupabaseClient } from "@supabase/supabase-js";
import { hashCommunityChatJoinPassword } from "./join-password";
import type { CommunityChatJoinType, CommunityChatMemberRole } from "./types";
import { communityChatRoleCanManage } from "./room-access";

function isMissingCommunityChatSchemaError(message: string): boolean {
  return /42P01|community_chat_rooms|does not exist/i.test(message);
}

const ROOM_ROW_SELECT =
  "id, meeting_id, title, description, thumbnail_url, join_type, password_hash, max_members, is_searchable, status, owner_user_id, report_threshold, joined_count, pending_join_count, updated_at";

export type CommunityChatMemberListItem = {
  user_id: string;
  nickname: string;
  avatar_url: string | null;
  role: CommunityChatMemberRole;
  joined_at: string;
};

export async function listJoinedCommunityChatMembers(
  sb: SupabaseClient<any>,
  roomId: string
): Promise<
  | { ok: true; members: CommunityChatMemberListItem[] }
  | { ok: false; error: string; status: number }
> {
  const { data, error } = await sb
    .from("community_chat_room_members")
    .select("user_id, nickname, avatar_url, role, joined_at")
    .eq("room_id", roomId.trim())
    .eq("member_status", "joined")
    .order("joined_at", { ascending: true });

  if (error) {
    if (isMissingCommunityChatSchemaError(error.message)) {
      return { ok: false, error: "schema_missing", status: 503 };
    }
    return { ok: false, error: error.message, status: 500 };
  }

  const members = ((data ?? []) as Record<string, unknown>[]).map((r) => ({
    user_id: String(r.user_id ?? ""),
    nickname: String(r.nickname ?? "").trim() || "member",
    avatar_url: (r.avatar_url as string | null) ?? null,
    role: (r.role as CommunityChatMemberRole) ?? "member",
    joined_at: String(r.joined_at ?? ""),
  }));

  return { ok: true, members };
}

async function countJoinedMembers(sb: SupabaseClient<any>, roomId: string): Promise<number> {
  const { count, error } = await sb
    .from("community_chat_room_members")
    .select("id", { count: "exact", head: true })
    .eq("room_id", roomId.trim())
    .eq("member_status", "joined");
  if (error) return 0;
  return count ?? 0;
}

/** 강퇴·차단 등 이후 `community_chat_rooms.joined_count` 를 실제 참가자 수에 맞춤 */
export async function syncCommunityChatRoomJoinedCount(
  sb: SupabaseClient<any>,
  roomId: string
): Promise<{ ok: true } | { ok: false; error: string; status: number }> {
  const n = await countJoinedMembers(sb, roomId);
  const { error } = await sb
    .from("community_chat_rooms")
    .update({ joined_count: n, updated_at: new Date().toISOString() })
    .eq("id", roomId.trim());
  if (error) {
    if (isMissingCommunityChatSchemaError(error.message)) {
      return { ok: false, error: "schema_missing", status: 503 };
    }
    return { ok: false, error: error.message, status: 500 };
  }
  return { ok: true };
}

/** `pending` 입장 신청 수로 `community_chat_rooms.pending_join_count` 동기화 */
export async function syncCommunityChatPendingJoinCount(
  sb: SupabaseClient<any>,
  roomId: string
): Promise<{ ok: true } | { ok: false; error: string; status: number }> {
  const { count, error } = await sb
    .from("community_chat_join_requests")
    .select("id", { count: "exact", head: true })
    .eq("room_id", roomId.trim())
    .eq("status", "pending");
  if (error) {
    if (isMissingCommunityChatSchemaError(error.message)) {
      return { ok: false, error: "schema_missing", status: 503 };
    }
    return { ok: false, error: error.message, status: 500 };
  }
  const n = count ?? 0;
  const { error: upErr } = await sb
    .from("community_chat_rooms")
    .update({ pending_join_count: n, updated_at: new Date().toISOString() })
    .eq("id", roomId.trim());
  if (upErr) {
    if (isMissingCommunityChatSchemaError(upErr.message)) {
      return { ok: false, error: "schema_missing", status: 503 };
    }
    return { ok: false, error: upErr.message, status: 500 };
  }
  return { ok: true };
}

export type PatchCommunityChatRoomInput = {
  title?: string;
  description?: string;
  thumbnailUrl?: string | null;
  maxMembers?: number;
  isSearchable?: boolean;
  reportThreshold?: number | null;
  /** 방장만 */
  joinType?: CommunityChatJoinType;
  /** 방장만, 비밀번호방 설정·변경 시 */
  joinPasswordPlain?: string | null;
};

export async function patchCommunityChatRoom(
  sb: SupabaseClient<any>,
  roomId: string,
  actorUserId: string,
  actorRole: CommunityChatMemberRole,
  patch: PatchCommunityChatRoomInput
): Promise<
  | { ok: true }
  | { ok: false; error: string; status: number }
> {
  if (!communityChatRoleCanManage(actorRole)) {
    return { ok: false, error: "forbidden", status: 403 };
  }

  const rid = roomId.trim();
  const { data: row, error: fetchErr } = await sb
    .from("community_chat_rooms")
    .select(ROOM_ROW_SELECT)
    .eq("id", rid)
    .maybeSingle();

  if (fetchErr) {
    if (isMissingCommunityChatSchemaError(fetchErr.message)) {
      return { ok: false, error: "schema_missing", status: 503 };
    }
    return { ok: false, error: fetchErr.message, status: 500 };
  }
  if (!row) return { ok: false, error: "not_found", status: 404 };

  const room = row as Record<string, unknown>;
  const isOwner = actorRole === "owner" || String(room.owner_user_id) === actorUserId;

  const updates: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  };

  if (patch.title !== undefined) {
    const t = patch.title.trim();
    if (!t) return { ok: false, error: "title_empty", status: 400 };
    updates.title = t.slice(0, 200);
  }
  if (patch.description !== undefined) {
    updates.description = String(patch.description).trim().slice(0, 5000);
  }
  if (patch.thumbnailUrl !== undefined) {
    updates.thumbnail_url = patch.thumbnailUrl?.trim() || null;
  }
  if (patch.isSearchable !== undefined) {
    updates.is_searchable = patch.isSearchable === true;
  }
  if (patch.reportThreshold !== undefined) {
    updates.report_threshold =
      patch.reportThreshold == null || !Number.isFinite(Number(patch.reportThreshold))
        ? null
        : Math.round(Number(patch.reportThreshold));
  }
  if (patch.maxMembers !== undefined) {
    const n = Math.round(Number(patch.maxMembers));
    if (!Number.isFinite(n) || n < 2 || n > 2000) {
      return { ok: false, error: "max_members_invalid", status: 400 };
    }
    const joined = await countJoinedMembers(sb, rid);
    if (n < joined) {
      return { ok: false, error: "max_members_below_joined", status: 400 };
    }
    updates.max_members = n;
  }

  if (patch.joinType !== undefined || patch.joinPasswordPlain !== undefined) {
    if (!isOwner) {
      return { ok: false, error: "owner_only_join_settings", status: 403 };
    }
  }

  if (patch.joinType !== undefined) {
    const jt = patch.joinType;
    if (jt !== "public" && jt !== "password" && jt !== "approval") {
      return { ok: false, error: "join_type_invalid", status: 400 };
    }
    updates.join_type = jt;
    if (jt === "password") {
      const pw = patch.joinPasswordPlain?.trim() ?? "";
      if (pw.length < 4) {
        return { ok: false, error: "password_too_short", status: 400 };
      }
      updates.password_hash = hashCommunityChatJoinPassword(pw);
    } else {
      updates.password_hash = null;
    }
  } else if (
    patch.joinType === undefined &&
    patch.joinPasswordPlain !== undefined &&
    String(room.join_type) === "password"
  ) {
    const pw = patch.joinPasswordPlain?.trim() ?? "";
    if (pw.length < 4) {
      return { ok: false, error: "password_too_short", status: 400 };
    }
    updates.password_hash = hashCommunityChatJoinPassword(pw);
  }

  const keys = Object.keys(updates).filter((k) => k !== "updated_at");
  if (keys.length === 0) {
    return { ok: true };
  }

  const { error: upErr } = await sb.from("community_chat_rooms").update(updates).eq("id", rid);
  if (upErr) {
    if (isMissingCommunityChatSchemaError(upErr.message)) {
      return { ok: false, error: "schema_missing", status: 503 };
    }
    return { ok: false, error: upErr.message, status: 500 };
  }

  await sb.from("community_chat_logs").insert({
    room_id: rid,
    actor_user_id: actorUserId,
    action_type: "room_updated",
    payload: { fields: keys },
  });

  return { ok: true };
}

export async function setCommunityChatMemberRole(
  sb: SupabaseClient<any>,
  roomId: string,
  actorUserId: string,
  targetUserId: string,
  newRole: "sub_admin" | "member"
): Promise<{ ok: true } | { ok: false; error: string; status: number }> {
  const rid = roomId.trim();
  const tid = targetUserId.trim();
  if (!tid) return { ok: false, error: "bad_request", status: 400 };
  if (tid === actorUserId && newRole === "member") {
    return { ok: false, error: "cannot_demote_self", status: 400 };
  }

  const { data: roomRow } = await sb
    .from("community_chat_rooms")
    .select("owner_user_id")
    .eq("id", rid)
    .maybeSingle();
  const ownerId = String((roomRow as { owner_user_id?: string } | null)?.owner_user_id ?? "");
  if (!ownerId) return { ok: false, error: "not_found", status: 404 };

  const actorIsOwner = ownerId === actorUserId;
  if (!actorIsOwner) {
    return { ok: false, error: "owner_only", status: 403 };
  }
  if (tid === ownerId) {
    return { ok: false, error: "cannot_change_owner", status: 400 };
  }

  const { data: target, error: tErr } = await sb
    .from("community_chat_room_members")
    .select("id, role, member_status")
    .eq("room_id", rid)
    .eq("user_id", tid)
    .maybeSingle();

  if (tErr) {
    if (isMissingCommunityChatSchemaError(tErr.message)) {
      return { ok: false, error: "schema_missing", status: 503 };
    }
    return { ok: false, error: tErr.message, status: 500 };
  }
  const tr = target as { id?: string; role?: string; member_status?: string } | null;
  if (!tr?.id || tr.member_status !== "joined") {
    return { ok: false, error: "target_not_joined", status: 400 };
  }
  if (tr.role === "owner") {
    return { ok: false, error: "cannot_change_owner", status: 400 };
  }

  if (newRole === "sub_admin") {
    if (tr.role === "sub_admin") return { ok: true };
  } else {
    if (tr.role === "member") return { ok: true };
    if (tr.role !== "sub_admin") {
      return { ok: false, error: "not_sub_admin", status: 400 };
    }
  }

  const nextRole: CommunityChatMemberRole = newRole;
  const { error: upErr } = await sb
    .from("community_chat_room_members")
    .update({ role: nextRole, updated_at: new Date().toISOString() })
    .eq("id", tr.id);

  if (upErr) {
    if (isMissingCommunityChatSchemaError(upErr.message)) {
      return { ok: false, error: "schema_missing", status: 503 };
    }
    return { ok: false, error: upErr.message, status: 500 };
  }

  await sb.from("community_chat_logs").insert({
    room_id: rid,
    actor_user_id: actorUserId,
    action_type: newRole === "sub_admin" ? "sub_admin_granted" : "sub_admin_revoked",
    target_user_id: tid,
    payload: {},
  });

  return { ok: true };
}
