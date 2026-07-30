import { appendAuditLog } from "@/lib/audit/append-audit-log";
import { cmMgmtMemberKickContent } from "@/lib/community-messenger/cm-home-list-copy";
import { GROUP_ROOM_ERROR } from "@/lib/community-messenger/group/group-room-errors";
import { publishGroupRoomListBump } from "@/lib/community-messenger/group/group-room-realtime";
import {
  fetchActiveParticipant,
  fetchPrivateGroupRoom,
  fetchProfileLabels,
  insertGroupSystemMessage,
  resolveGroupRoomSupabase,
} from "@/lib/community-messenger/group/group-room-repository";
import type { GroupRoomRole } from "@/lib/community-messenger/group/group-room.types";

function trimText(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

function normalizeRole(value: unknown): GroupRoomRole {
  const role = trimText(value);
  if (role === "owner" || role === "admin") return role;
  return "member";
}

export type GroupBanRow = {
  id: string;
  roomId: string;
  userId: string;
  bannedBy: string | null;
  bannedAt: string;
  reason: string | null;
  userLabel?: string | null;
  username?: string | null;
  bannedByLabel?: string | null;
};

export async function isUserBannedFromGroup(
  sb: NonNullable<ReturnType<typeof resolveGroupRoomSupabase>>,
  roomId: string,
  userId: string
): Promise<boolean> {
  const rid = trimText(roomId);
  const uid = trimText(userId);
  if (!rid || !uid) return false;
  const { data, error } = await (sb as any)
    .from("community_messenger_group_bans")
    .select("id")
    .eq("room_id", rid)
    .eq("user_id", uid)
    .is("unbanned_at", null)
    .maybeSingle();
  if (error) {
    // Pre-migration: treat as not banned
    if (/does not exist|relation/i.test(String(error.message ?? ""))) return false;
    return false;
  }
  return Boolean(data?.id);
}

export async function assertNotBannedFromGroup(
  sb: NonNullable<ReturnType<typeof resolveGroupRoomSupabase>>,
  roomId: string,
  userId: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (await isUserBannedFromGroup(sb, roomId, userId)) {
    return { ok: false, error: GROUP_ROOM_ERROR.USER_BANNED };
  }
  return { ok: true };
}

export async function banGroupMember(input: {
  userId: string;
  roomId: string;
  targetUserId: string;
  reason?: string | null;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const sb = resolveGroupRoomSupabase();
  if (!sb) return { ok: false, error: GROUP_ROOM_ERROR.MESSENGER_MIGRATION_REQUIRED };
  const userId = trimText(input.userId);
  const roomId = trimText(input.roomId);
  const targetUserId = trimText(input.targetUserId);
  if (!roomId || !targetUserId) return { ok: false, error: GROUP_ROOM_ERROR.BAD_TARGET };

  const { data, error } = await (sb as any).rpc("community_messenger_ban_group_member", {
    p_room_id: roomId,
    p_actor_user_id: userId,
    p_target_user_id: targetUserId,
    p_reason: trimText(input.reason) || null,
  });
  if (error) {
    return { ok: false, error: String(error.message ?? GROUP_ROOM_ERROR.KICK_FAILED) };
  }
  const row = (Array.isArray(data) ? data[0] : data) as { ok?: boolean; error?: string; already_banned?: boolean } | null;
  if (!row?.ok) return { ok: false, error: String(row?.error ?? GROUP_ROOM_ERROR.FORBIDDEN) };

  if (!row.already_banned) {
    const labels = await fetchProfileLabels(sb, [targetUserId]);
    await insertGroupSystemMessage(sb, {
      roomId,
      content: cmMgmtMemberKickContent(labels.get(targetUserId)),
    });
    await publishGroupRoomListBump({ roomId, fromUserId: userId });
    await appendAuditLog(sb as any, {
      actor_type: "user",
      actor_id: userId,
      target_type: "community_messenger_group_ban",
      target_id: `${roomId}:${targetUserId}`,
      action: "community_messenger.group_ban",
      after_json: { roomId, targetUserId, reason: trimText(input.reason) || null },
    });
  }
  return { ok: true };
}

export async function unbanGroupMember(input: {
  userId: string;
  roomId: string;
  targetUserId: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const sb = resolveGroupRoomSupabase();
  if (!sb) return { ok: false, error: GROUP_ROOM_ERROR.MESSENGER_MIGRATION_REQUIRED };
  const userId = trimText(input.userId);
  const roomId = trimText(input.roomId);
  const targetUserId = trimText(input.targetUserId);
  if (!roomId || !targetUserId) return { ok: false, error: GROUP_ROOM_ERROR.BAD_TARGET };

  const { data, error } = await (sb as any).rpc("community_messenger_unban_group_member", {
    p_room_id: roomId,
    p_actor_user_id: userId,
    p_target_user_id: targetUserId,
  });
  if (error) {
    return { ok: false, error: String(error.message ?? GROUP_ROOM_ERROR.UPDATE_FAILED) };
  }
  const row = (Array.isArray(data) ? data[0] : data) as { ok?: boolean; error?: string } | null;
  if (!row?.ok) return { ok: false, error: String(row?.error ?? GROUP_ROOM_ERROR.FORBIDDEN) };

  await appendAuditLog(sb as any, {
    actor_type: "user",
    actor_id: userId,
    target_type: "community_messenger_group_ban",
    target_id: `${roomId}:${targetUserId}`,
    action: "community_messenger.group_unban",
    after_json: { roomId, targetUserId },
  });
  return { ok: true };
}

export async function listActiveGroupBans(input: {
  userId: string;
  roomId: string;
}): Promise<{ ok: true; bans: GroupBanRow[] } | { ok: false; error: string }> {
  const sb = resolveGroupRoomSupabase();
  if (!sb) return { ok: false, error: GROUP_ROOM_ERROR.MESSENGER_MIGRATION_REQUIRED };
  const roomId = trimText(input.roomId);
  const userId = trimText(input.userId);
  const room = await fetchPrivateGroupRoom(sb, roomId);
  if (!room) return { ok: false, error: GROUP_ROOM_ERROR.ROOM_NOT_FOUND };
  const me = await fetchActiveParticipant(sb, roomId, userId);
  if (!me) return { ok: false, error: GROUP_ROOM_ERROR.FORBIDDEN };
  const role = normalizeRole(me.role);
  if (role !== "owner" && role !== "admin") {
    return { ok: false, error: GROUP_ROOM_ERROR.FORBIDDEN };
  }

  const { data, error } = await (sb as any)
    .from("community_messenger_group_bans")
    .select("id, room_id, user_id, banned_by, banned_at, reason")
    .eq("room_id", roomId)
    .is("unbanned_at", null)
    .order("banned_at", { ascending: false });
  if (error) {
    if (/does not exist|relation/i.test(String(error.message ?? ""))) {
      return { ok: true, bans: [] };
    }
    return { ok: false, error: String(error.message ?? GROUP_ROOM_ERROR.UPDATE_FAILED) };
  }

  const rows = (data ?? []) as Array<Record<string, unknown>>;
  const userIds = rows
    .flatMap((r) => [trimText(r.user_id), trimText(r.banned_by)])
    .filter(Boolean);
  const labelMap = await fetchProfileLabels(sb, userIds);
  const { data: profiles } = await (sb as any).from("profiles").select("id, username").in("id", userIds);
  const usernameMap = new Map<string, string>();
  for (const p of (profiles ?? []) as Array<{ id?: string; username?: string | null }>) {
    if (p.id && p.username) usernameMap.set(String(p.id), String(p.username));
  }

  const bans: GroupBanRow[] = rows.map((r) => {
    const uid = trimText(r.user_id);
    const by = trimText(r.banned_by) || null;
    return {
      id: trimText(r.id),
      roomId: trimText(r.room_id),
      userId: uid,
      bannedBy: by,
      bannedAt: trimText(r.banned_at),
      reason: trimText(r.reason) || null,
      userLabel: labelMap.get(uid) ?? null,
      username: usernameMap.get(uid) ?? null,
      bannedByLabel: by ? labelMap.get(by) ?? null : null,
    };
  });
  return { ok: true, bans };
}
