import { GROUP_ROOM_ERROR } from "@/lib/community-messenger/group/group-room-errors";
import { canPinGroupMessage, canUnpinGroupMessage } from "@/lib/community-messenger/group/group-room-pin-policy";
import {
  fetchMessageInRoom,
  fetchRoomPinnedMessageId,
  setRoomPinnedMessageId,
} from "@/lib/community-messenger/group/group-room-pin-repository";
import type { GroupRoomPermissionContext } from "@/lib/community-messenger/group/group-room-permissions";
import {
  fetchActiveParticipant,
  fetchPrivateGroupRoom,
  resolveGroupRoomSupabase,
} from "@/lib/community-messenger/group/group-room-repository";
import type { GroupRoomRole } from "@/lib/community-messenger/group/group-room.types";
import { notifyGroupPinMessage } from "@/lib/community-messenger/group/group-room-pin-notify";

function trimText(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeRole(value: unknown): GroupRoomRole {
  const role = trimText(value);
  if (role === "owner" || role === "admin") return role;
  return "member";
}

function ctx(
  viewerUserId: string,
  viewerRole: GroupRoomRole,
  room: NonNullable<Awaited<ReturnType<typeof fetchPrivateGroupRoom>>>
): GroupRoomPermissionContext {
  return { viewerUserId, viewerRole, room };
}

export async function pinGroupRoomMessage(input: {
  userId: string;
  roomId: string;
  messageId: string;
}): Promise<{ ok: true; messageId: string | null } | { ok: false; error: string }> {
  const sb = resolveGroupRoomSupabase();
  if (!sb) return { ok: false, error: GROUP_ROOM_ERROR.MESSENGER_MIGRATION_REQUIRED };
  const roomId = trimText(input.roomId);
  const userId = trimText(input.userId);
  const messageId = trimText(input.messageId);
  if (!messageId) return { ok: false, error: GROUP_ROOM_ERROR.CONTENT_REQUIRED };
  const room = await fetchPrivateGroupRoom(sb, roomId);
  if (!room) return { ok: false, error: GROUP_ROOM_ERROR.ROOM_NOT_FOUND };
  const participant = await fetchActiveParticipant(sb, roomId, userId);
  if (!participant) return { ok: false, error: GROUP_ROOM_ERROR.FORBIDDEN };
  const viewerRole = normalizeRole(participant.role);
  if (!canPinGroupMessage(ctx(userId, viewerRole, room))) {
    return { ok: false, error: GROUP_ROOM_ERROR.FORBIDDEN };
  }
  const message = await fetchMessageInRoom(sb, roomId, messageId);
  if (!message || message.message_type === "system") {
    return { ok: false, error: GROUP_ROOM_ERROR.CONTENT_REQUIRED };
  }
  const updated = await setRoomPinnedMessageId(sb, roomId, messageId);
  if (!updated.ok) return { ok: false, error: updated.error ?? GROUP_ROOM_ERROR.UPDATE_FAILED };
  void notifyGroupPinMessage(sb, { roomId, actorUserId: userId, messageId, pinned: true }).catch(() => {});
  return { ok: true, messageId };
}

export async function unpinGroupRoomMessage(input: {
  userId: string;
  roomId: string;
}): Promise<{ ok: true; messageId: null } | { ok: false; error: string }> {
  const sb = resolveGroupRoomSupabase();
  if (!sb) return { ok: false, error: GROUP_ROOM_ERROR.MESSENGER_MIGRATION_REQUIRED };
  const roomId = trimText(input.roomId);
  const userId = trimText(input.userId);
  const room = await fetchPrivateGroupRoom(sb, roomId);
  if (!room) return { ok: false, error: GROUP_ROOM_ERROR.ROOM_NOT_FOUND };
  const participant = await fetchActiveParticipant(sb, roomId, userId);
  if (!participant) return { ok: false, error: GROUP_ROOM_ERROR.FORBIDDEN };
  const viewerRole = normalizeRole(participant.role);
  if (!canUnpinGroupMessage(ctx(userId, viewerRole, room))) {
    return { ok: false, error: GROUP_ROOM_ERROR.FORBIDDEN };
  }
  const prev = await fetchRoomPinnedMessageId(sb, roomId);
  const updated = await setRoomPinnedMessageId(sb, roomId, null);
  if (!updated.ok) return { ok: false, error: updated.error ?? GROUP_ROOM_ERROR.UPDATE_FAILED };
  if (prev) {
    void notifyGroupPinMessage(sb, { roomId, actorUserId: userId, messageId: prev, pinned: false }).catch(
      () => {}
    );
  }
  return { ok: true, messageId: null };
}

export async function getGroupRoomPinnedMessage(input: {
  userId: string;
  roomId: string;
}): Promise<
  | { ok: true; messageId: string | null }
  | { ok: false; error: string }
> {
  const sb = resolveGroupRoomSupabase();
  if (!sb) return { ok: false, error: GROUP_ROOM_ERROR.MESSENGER_MIGRATION_REQUIRED };
  const roomId = trimText(input.roomId);
  const userId = trimText(input.userId);
  const participant = await fetchActiveParticipant(sb, roomId, userId);
  if (!participant) return { ok: false, error: GROUP_ROOM_ERROR.FORBIDDEN };
  const messageId = await fetchRoomPinnedMessageId(sb, roomId);
  return { ok: true, messageId };
}
