import { GROUP_ROOM_ERROR } from "@/lib/community-messenger/group/group-room-errors";
import {
  canEditGroupRoomProfile,
  normalizeGroupRoomProfilePatch,
  type GroupRoomProfilePatch,
} from "@/lib/community-messenger/group/group-room-profile-policy";
import {
  fetchGroupRoomProfileRow,
  patchGroupRoomProfile,
} from "@/lib/community-messenger/group/group-room-profile-repository";
import type { GroupRoomPermissionContext } from "@/lib/community-messenger/group/group-room-permissions";
import {
  fetchActiveParticipant,
  fetchPrivateGroupRoom,
  resolveGroupRoomSupabase,
} from "@/lib/community-messenger/group/group-room-repository";
import type { GroupRoomRole } from "@/lib/community-messenger/group/group-room.types";

function trimText(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeRole(value: unknown): GroupRoomRole {
  const role = trimText(value);
  if (role === "owner" || role === "admin") return role;
  return "member";
}

function permissionContext(
  viewerUserId: string,
  viewerRole: GroupRoomRole,
  room: NonNullable<Awaited<ReturnType<typeof fetchPrivateGroupRoom>>>
): GroupRoomPermissionContext {
  return {
    viewerUserId,
    viewerRole,
    room,
  };
}

export async function getGroupRoomProfile(input: {
  userId: string;
  roomId: string;
}): Promise<
  | {
      ok: true;
      profile: {
        roomId: string;
        title: string;
        avatarUrl: string | null;
        ownerUserId: string | null;
        myRole: GroupRoomRole;
      };
    }
  | { ok: false; error: string }
> {
  const sb = resolveGroupRoomSupabase();
  if (!sb) return { ok: false, error: GROUP_ROOM_ERROR.MESSENGER_MIGRATION_REQUIRED };
  const roomId = trimText(input.roomId);
  const userId = trimText(input.userId);
  const room = await fetchPrivateGroupRoom(sb, roomId);
  if (!room) return { ok: false, error: GROUP_ROOM_ERROR.ROOM_NOT_FOUND };
  const participant = await fetchActiveParticipant(sb, roomId, userId);
  if (!participant) return { ok: false, error: GROUP_ROOM_ERROR.FORBIDDEN };
  const row = await fetchGroupRoomProfileRow(sb, roomId);
  if (!row) return { ok: false, error: GROUP_ROOM_ERROR.ROOM_NOT_FOUND };
  return {
    ok: true,
    profile: {
      roomId: row.id,
      title: row.title,
      avatarUrl: row.avatar_url,
      ownerUserId: row.owner_user_id,
      myRole: normalizeRole(participant.role),
    },
  };
}

export async function updateGroupRoomProfile(input: {
  userId: string;
  roomId: string;
  patch: GroupRoomProfilePatch;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const sb = resolveGroupRoomSupabase();
  if (!sb) return { ok: false, error: GROUP_ROOM_ERROR.MESSENGER_MIGRATION_REQUIRED };
  const roomId = trimText(input.roomId);
  const userId = trimText(input.userId);
  const room = await fetchPrivateGroupRoom(sb, roomId);
  if (!room) return { ok: false, error: GROUP_ROOM_ERROR.ROOM_NOT_FOUND };
  const participant = await fetchActiveParticipant(sb, roomId, userId);
  if (!participant) return { ok: false, error: GROUP_ROOM_ERROR.FORBIDDEN };
  const viewerRole = normalizeRole(participant.role);
  const ctx = permissionContext(userId, viewerRole, room);
  if (!canEditGroupRoomProfile(ctx)) return { ok: false, error: GROUP_ROOM_ERROR.FORBIDDEN };
  const normalized = normalizeGroupRoomProfilePatch(input.patch, viewerRole);
  if (!normalized) return { ok: false, error: GROUP_ROOM_ERROR.CONTENT_REQUIRED };
  const updated = await patchGroupRoomProfile(sb, roomId, normalized);
  if (!updated.ok) return { ok: false, error: updated.error ?? GROUP_ROOM_ERROR.UPDATE_FAILED };
  return { ok: true };
}
