import { GROUP_ROOM_ERROR } from "@/lib/community-messenger/group/group-room-errors";
import { canInviteToGroup, type GroupRoomPermissionContext } from "@/lib/community-messenger/group/group-room-permissions";
import {
  buildGroupInviteAbsoluteUrl,
  generateGroupInviteToken,
  normalizeGroupInviteToken,
} from "@/lib/community-messenger/group/group-room-invite-token";
import {
  ensureRoomInviteToken,
  fetchRoomInviteState,
  findRoomIdByInviteToken,
  patchRoomInviteToken,
} from "@/lib/community-messenger/group/group-room-invite-link-repository";
import {
  fetchActiveParticipant,
  fetchPrivateGroupRoom,
  resolveGroupRoomSupabase,
  upsertGroupMemberParticipants,
} from "@/lib/community-messenger/group/group-room-repository";
import type { GroupRoomRole } from "@/lib/community-messenger/group/group-room.types";
import { getSiteOrigin } from "@/lib/env/runtime";

function trimText(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

function normalizeRole(value: unknown): GroupRoomRole {
  const role = trimText(value);
  if (role === "owner" || role === "admin") return role;
  return "member";
}

function permissionCtx(
  viewerUserId: string,
  viewerRole: GroupRoomRole,
  room: NonNullable<Awaited<ReturnType<typeof fetchPrivateGroupRoom>>>
): GroupRoomPermissionContext {
  return { viewerUserId, viewerRole, room };
}

export async function getGroupInviteLink(input: {
  userId: string;
  roomId: string;
}): Promise<
  | { ok: true; inviteToken: string; inviteUrl: string; enabled: boolean }
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
  const viewerRole = normalizeRole(participant.role);
  if (!canInviteToGroup(permissionCtx(userId, viewerRole, room))) {
    return { ok: false, error: GROUP_ROOM_ERROR.FORBIDDEN };
  }
  const token = await ensureRoomInviteToken(sb, roomId);
  if (!token) return { ok: false, error: GROUP_ROOM_ERROR.UPDATE_FAILED };
  const state = await fetchRoomInviteState(sb, roomId);
  const origin = getSiteOrigin() || "https://dibay.app";
  return {
    ok: true,
    inviteToken: token,
    inviteUrl: buildGroupInviteAbsoluteUrl(token, origin),
    enabled: state?.inviteLinkEnabled !== false,
  };
}

export async function regenerateGroupInviteLink(input: {
  userId: string;
  roomId: string;
}): Promise<
  | { ok: true; inviteToken: string; inviteUrl: string }
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
  const viewerRole = normalizeRole(participant.role);
  if (!canInviteToGroup(permissionCtx(userId, viewerRole, room))) {
    return { ok: false, error: GROUP_ROOM_ERROR.FORBIDDEN };
  }
  const token = generateGroupInviteToken();
  const updated = await patchRoomInviteToken(sb, roomId, token, true);
  if (!updated.ok) return { ok: false, error: updated.error ?? GROUP_ROOM_ERROR.UPDATE_FAILED };
  const origin = getSiteOrigin() || "https://dibay.app";
  return { ok: true, inviteToken: token, inviteUrl: buildGroupInviteAbsoluteUrl(token, origin) };
}

export async function disableGroupInviteLink(input: {
  userId: string;
  roomId: string;
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
  if (viewerRole !== "owner" && viewerRole !== "admin") {
    return { ok: false, error: GROUP_ROOM_ERROR.FORBIDDEN };
  }
  const updated = await patchRoomInviteToken(sb, roomId, null, false);
  if (!updated.ok) return { ok: false, error: updated.error ?? GROUP_ROOM_ERROR.UPDATE_FAILED };
  return { ok: true };
}

export async function joinGroupRoomByInviteToken(input: {
  userId: string;
  inviteToken: string;
}): Promise<{ ok: true; roomId: string } | { ok: false; error: string }> {
  const sb = resolveGroupRoomSupabase();
  if (!sb) return { ok: false, error: GROUP_ROOM_ERROR.MESSENGER_MIGRATION_REQUIRED };
  const userId = trimText(input.userId);
  const token = normalizeGroupInviteToken(input.inviteToken);
  if (!token) return { ok: false, error: GROUP_ROOM_ERROR.CONTENT_REQUIRED };
  const roomId = await findRoomIdByInviteToken(sb, token);
  if (!roomId) return { ok: false, error: GROUP_ROOM_ERROR.ROOM_NOT_FOUND };
  const existing = await fetchActiveParticipant(sb, roomId, userId);
  if (existing) return { ok: true, roomId };
  const joined = await upsertGroupMemberParticipants(sb, roomId, [userId]);
  if (!joined.ok) return { ok: false, error: joined.error ?? GROUP_ROOM_ERROR.INVITE_FAILED };
  return { ok: true, roomId };
}
