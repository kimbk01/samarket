import { GROUP_ROOM_ERROR } from "@/lib/community-messenger/group/group-room-errors";
import type { GroupRoomPermissionContext } from "@/lib/community-messenger/group/group-room-permissions";
import {
  canAssignGroupAdmin,
  canChangeTargetRole,
  canRevokeGroupAdmin,
} from "@/lib/community-messenger/group/group-room-role-policy";
import {
  fetchActiveParticipant,
  fetchPrivateGroupRoom,
  resolveGroupRoomSupabase,
} from "@/lib/community-messenger/group/group-room-repository";
import type { GroupRoomRole } from "@/lib/community-messenger/group/group-room.types";
import { setCommunityMessengerGroupMemberRole } from "@/lib/community-messenger/service";

function trimText(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

function normalizeRole(value: unknown): GroupRoomRole {
  const role = trimText(value);
  if (role === "owner" || role === "admin") return role;
  return "member";
}

function ctx(
  viewerUserId: string,
  viewerRole: GroupRoomRole,
  room: NonNullable<Awaited<ReturnType<typeof fetchPrivateGroupRoom>>>,
  targetUserId: string,
  targetRole: GroupRoomRole
): GroupRoomPermissionContext {
  return {
    viewerUserId,
    viewerRole,
    room,
    targetUserId,
    targetRole,
  };
}

export async function updateGroupMemberRole(input: {
  userId: string;
  roomId: string;
  targetUserId: string;
  nextRole: "admin" | "member";
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const sb = resolveGroupRoomSupabase();
  if (!sb) return { ok: false, error: GROUP_ROOM_ERROR.MESSENGER_MIGRATION_REQUIRED };
  const roomId = trimText(input.roomId);
  const userId = trimText(input.userId);
  const targetUserId = trimText(input.targetUserId);
  if (!targetUserId || targetUserId === userId) {
    return { ok: false, error: GROUP_ROOM_ERROR.BAD_TARGET };
  }
  const room = await fetchPrivateGroupRoom(sb, roomId);
  if (!room) return { ok: false, error: GROUP_ROOM_ERROR.ROOM_NOT_FOUND };
  const viewer = await fetchActiveParticipant(sb, roomId, userId);
  if (!viewer) return { ok: false, error: GROUP_ROOM_ERROR.FORBIDDEN };
  const target = await fetchActiveParticipant(sb, roomId, targetUserId);
  if (!target) return { ok: false, error: GROUP_ROOM_ERROR.TARGET_NOT_FOUND };
  const viewerRole = normalizeRole(viewer.role);
  const targetRole = normalizeRole(target.role);
  const nextRole = input.nextRole;
  const permission = ctx(userId, viewerRole, room, targetUserId, targetRole);
  if (nextRole === "admin" && !canAssignGroupAdmin(permission)) {
    return { ok: false, error: GROUP_ROOM_ERROR.FORBIDDEN };
  }
  if (nextRole === "member" && targetRole === "admin" && !canRevokeGroupAdmin(permission)) {
    return { ok: false, error: GROUP_ROOM_ERROR.FORBIDDEN };
  }
  if (!canChangeTargetRole(permission, nextRole)) {
    return { ok: false, error: GROUP_ROOM_ERROR.FORBIDDEN };
  }
  if (targetRole === "owner") return { ok: false, error: GROUP_ROOM_ERROR.FORBIDDEN };

  const result = await setCommunityMessengerGroupMemberRole({
    userId,
    roomId,
    targetUserId,
    nextRole,
  });
  if (!result.ok) return { ok: false, error: result.error ?? GROUP_ROOM_ERROR.UPDATE_FAILED };
  return { ok: true };
}
