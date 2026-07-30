import type { SupabaseClient } from "@supabase/supabase-js";
import {
  cmMgmtMemberInviteContent,
  cmMgmtMemberKickContent,
  cmMgmtNoticeContent,
  cmMgmtPermissionsContent,
} from "@/lib/community-messenger/cm-home-list-copy";
import { cmServiceT } from "@/lib/community-messenger/cm-service-copy";
import type { MessageKey } from "@/lib/i18n/messages";
import { isAcceptedFriendPair } from "@/lib/community-messenger/friendship-resolver";
import { GROUP_ROOM_ERROR } from "@/lib/community-messenger/group/group-room-errors";
import {
  canEditGroupRoomMeta,
  canInviteToGroup,
  canKickGroupMember,
  type GroupRoomPermissionContext,
} from "@/lib/community-messenger/group/group-room-permissions";
import { publishGroupRoomListBump } from "@/lib/community-messenger/group/group-room-realtime";
import {
  countActiveParticipants,
  dedupeGroupMemberIds,
  deletePrivateGroupRoom,
  fetchActiveParticipant,
  fetchPrivateGroupRoom,
  fetchProfileLabels,
  insertGroupParticipants,
  insertGroupSystemMessage,
  insertPrivateGroupRoom,
  listMyPrivateGroupRooms,
  markParticipantLeft,
  patchGroupRoomSettings,
  profileIdsExist,
  resolveGroupRoomSupabase,
  upsertGroupMemberParticipants,
  type GroupRoomSupabase,
} from "@/lib/community-messenger/group/group-room-repository";
import type {
  CreateGroupRoomInput,
  CreateGroupRoomResult,
  GroupParticipantRow,
  GroupRoomListItem,
  GroupRoomRole,
  GroupRoomRow,
  GroupRoomSettingsPatch,
} from "@/lib/community-messenger/group/group-room.types";
import { isUserBannedFromGroup } from "@/lib/community-messenger/group/group-room-ban-service";
import { isBlockedEitherWayActive } from "@/lib/community-messenger/social-relations";
import { notifyCommunityMessengerGroupInviteReceived } from "@/lib/notifications/community-messenger-group-inapp-notify";

function trimText(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeRole(value: unknown): GroupRoomRole {
  const role = trimText(value);
  if (role === "owner" || role === "admin") return role;
  return "member";
}

function roomUnavailable(room: GroupRoomRow): boolean {
  return (room.room_status ?? "active") !== "active" || room.is_readonly === true;
}

async function appendGroupMgmtSystemMessage(
  sb: GroupRoomSupabase,
  input: { actorUserId: string; roomId: string; content: string }
): Promise<void> {
  const inserted = await insertGroupSystemMessage(sb, { roomId: input.roomId, content: input.content });
  if (inserted.ok) {
    await publishGroupRoomListBump({
      roomId: input.roomId,
      fromUserId: input.actorUserId,
      messageCreatedAt: inserted.createdAt,
    });
  }
}

async function notifyGroupInvitesBestEffort(
  sb: GroupRoomSupabase,
  input: {
    inviterUserId: string;
    inviterLabel: string;
    roomId: string;
    roomTitle: string;
    memberIds: string[];
  }
): Promise<void> {
  await Promise.all(
    input.memberIds.map((memberId) =>
      notifyCommunityMessengerGroupInviteReceived(sb, {
        userId: memberId,
        roomId: input.roomId,
        roomTitle: input.roomTitle,
        inviterUserId: input.inviterUserId,
        inviterLabel: input.inviterLabel,
      })
    )
  );
}

async function resolveGroupTitle(userId: string, memberIds: string[], title: string): Promise<string> {
  const explicit = trimText(title);
  if (explicit) return explicit;
  const sb = resolveGroupRoomSupabase();
  if (!sb) return cmServiceT("cm_svc_group_members", { count: memberIds.length + 1 });
  const labels = await fetchProfileLabels(sb, memberIds.filter((id) => id !== userId));
  const names = [...labels.values()].filter(Boolean).slice(0, 3);
  if (!names.length) return cmServiceT("cm_svc_group_members", { count: memberIds.length + 1 });
  return names.join(", ");
}

export async function validateGroupInviteTargets(
  userId: string,
  memberIds: string[],
  supabase?: SupabaseClient<any> | null,
  options?: { roomId?: string | null }
): Promise<{ ok: true; memberIds: string[] } | { ok: false; error: string }> {
  const viewer = trimText(userId);
  const peerIds = dedupeGroupMemberIds(memberIds.filter((id) => id && id !== viewer));
  if (!peerIds.length) return { ok: false, error: GROUP_ROOM_ERROR.MEMBERS_REQUIRED };

  const sb = supabase ?? resolveGroupRoomSupabase();
  if (!sb) return { ok: false, error: GROUP_ROOM_ERROR.INVALID_TARGET };

  const roomId = trimText(options?.roomId);
  for (const peerId of peerIds) {
    if (roomId && (await isUserBannedFromGroup(sb, roomId, peerId))) {
      return { ok: false, error: GROUP_ROOM_ERROR.USER_BANNED };
    }
    if (await isBlockedEitherWayActive(viewer, peerId, sb)) {
      return { ok: false, error: GROUP_ROOM_ERROR.BLOCKED_TARGET };
    }
    if (!(await isAcceptedFriendPair(sb, viewer, peerId))) {
      return { ok: false, error: GROUP_ROOM_ERROR.FRIEND_REQUIRED };
    }
  }

  if (!(await profileIdsExist(sb, peerIds))) {
    return { ok: false, error: GROUP_ROOM_ERROR.INVALID_TARGET };
  }

  return { ok: true, memberIds: peerIds };
}

export async function createGroupRoom(input: CreateGroupRoomInput): Promise<CreateGroupRoomResult> {
  const userId = trimText(input.userId);
  if (!userId) return { ok: false, error: GROUP_ROOM_ERROR.FORBIDDEN };
  const memberIds = dedupeGroupMemberIds([userId, ...input.memberIds]);
  if (memberIds.length < 2) return { ok: false, error: GROUP_ROOM_ERROR.MEMBERS_REQUIRED };

  const memberValidation = await validateGroupInviteTargets(userId, memberIds);
  if (!memberValidation.ok) return memberValidation;

  const title = await resolveGroupTitle(userId, memberIds, input.title);
  const sb = resolveGroupRoomSupabase();
  if (!sb) return { ok: false, error: GROUP_ROOM_ERROR.MESSENGER_MIGRATION_REQUIRED };

  const roomInsert = await insertPrivateGroupRoom(sb, { userId, title });
  if (!roomInsert.ok) {
    return {
      ok: false,
      error: roomInsert.missingTable
        ? GROUP_ROOM_ERROR.MESSENGER_MIGRATION_REQUIRED
        : roomInsert.error,
    };
  }

  const participantsInsert = await insertGroupParticipants(sb, {
    roomId: roomInsert.roomId,
    ownerUserId: userId,
    memberIds,
  });
  if (!participantsInsert.ok) {
    await deletePrivateGroupRoom(sb, roomInsert.roomId);
    return { ok: false, error: GROUP_ROOM_ERROR.GROUP_PARTICIPANT_CREATE_FAILED };
  }

  const createdContent = cmServiceT("cm_svc_group_room_created" as MessageKey, { name: title });
  await appendGroupMgmtSystemMessage(sb, {
    actorUserId: userId,
    roomId: roomInsert.roomId,
    content: createdContent,
  });

  void (async () => {
    try {
      const labelMap = await fetchProfileLabels(sb, [userId]);
      const inviterLabel = labelMap.get(userId) ?? userId.slice(0, 6);
      await notifyGroupInvitesBestEffort(sb, {
        inviterUserId: userId,
        inviterLabel,
        roomId: roomInsert.roomId,
        roomTitle: title,
        memberIds: memberIds.filter((id) => id !== userId),
      });
    } catch (err) {
      console.warn("[group-room] create invite notify failed", err);
    }
  })();

  await publishGroupRoomListBump({ roomId: roomInsert.roomId, fromUserId: userId });
  return { ok: true, roomId: roomInsert.roomId };
}

export async function inviteGroupMembers(input: {
  userId: string;
  roomId: string;
  memberIds: string[];
}): Promise<{ ok: boolean; error?: string }> {
  const userId = trimText(input.userId);
  const roomId = trimText(input.roomId);
  const memberIds = dedupeGroupMemberIds(input.memberIds);
  if (!roomId || !memberIds.length) return { ok: false, error: GROUP_ROOM_ERROR.MEMBERS_REQUIRED };

  const sb = resolveGroupRoomSupabase();
  if (!sb) return { ok: false, error: GROUP_ROOM_ERROR.MESSENGER_MIGRATION_REQUIRED };

  const room = await fetchPrivateGroupRoom(sb, roomId);
  if (!room) return { ok: false, error: GROUP_ROOM_ERROR.NOT_GROUP_ROOM };
  if (roomUnavailable(room)) return { ok: false, error: GROUP_ROOM_ERROR.ROOM_UNAVAILABLE };

  const me = await fetchActiveParticipant(sb, roomId, userId);
  if (!me) return { ok: false, error: GROUP_ROOM_ERROR.FORBIDDEN };

  const myRole = normalizeRole(me.role);
  const permCtx: GroupRoomPermissionContext = { viewerUserId: userId, viewerRole: myRole, room };
  if (!canInviteToGroup(permCtx)) return { ok: false, error: GROUP_ROOM_ERROR.FORBIDDEN };

  const memberValidation = await validateGroupInviteTargets(userId, memberIds, sb, { roomId });
  if (!memberValidation.ok) return memberValidation;

  const upsert = await upsertGroupMemberParticipants(sb, roomId, memberValidation.memberIds);
  if (!upsert.ok) return { ok: false, error: upsert.error };

  const { closePendingJoinRequestsOnDirectAdd } = await import(
    "@/lib/community-messenger/group/group-room-join-request-service"
  );
  await closePendingJoinRequestsOnDirectAdd({
    sb,
    roomId,
    memberIds: memberValidation.memberIds,
    actorUserId: userId,
  });

  const labelMap = await fetchProfileLabels(sb, memberValidation.memberIds);
  const labels = memberValidation.memberIds
    .map((id) => labelMap.get(id))
    .filter(Boolean)
    .join(", ");
  await appendGroupMgmtSystemMessage(sb, {
    actorUserId: userId,
    roomId,
    content: cmMgmtMemberInviteContent(labels),
  });

  if (upsert.newlyInvitedMemberIds.length > 0) {
    void (async () => {
      try {
        const inviterMap = await fetchProfileLabels(sb, [userId]);
        const inviterLabel = inviterMap.get(userId) ?? userId.slice(0, 6);
        await notifyGroupInvitesBestEffort(sb, {
          inviterUserId: userId,
          inviterLabel,
          roomId,
          roomTitle: trimText(room.title),
          memberIds: upsert.newlyInvitedMemberIds,
        });
      } catch (err) {
        console.warn("[group-room] invite notify failed", err);
      }
    })();
  }

  return { ok: true };
}

export async function kickGroupMember(input: {
  userId: string;
  roomId: string;
  targetUserId: string;
}): Promise<{ ok: boolean; error?: string }> {
  const userId = trimText(input.userId);
  const roomId = trimText(input.roomId);
  const targetUserId = trimText(input.targetUserId);
  if (!roomId || !targetUserId) return { ok: false, error: GROUP_ROOM_ERROR.BAD_TARGET };

  const sb = resolveGroupRoomSupabase();
  if (!sb) return { ok: false, error: GROUP_ROOM_ERROR.MESSENGER_MIGRATION_REQUIRED };

  const room = await fetchPrivateGroupRoom(sb, roomId);
  if (!room) return { ok: false, error: GROUP_ROOM_ERROR.NOT_GROUP_ROOM };

  const me = await fetchActiveParticipant(sb, roomId, userId);
  const target = await fetchActiveParticipant(sb, roomId, targetUserId);
  if (!me || !target) return { ok: false, error: GROUP_ROOM_ERROR.TARGET_NOT_FOUND };

  const permCtx: GroupRoomPermissionContext = {
    viewerUserId: userId,
    viewerRole: normalizeRole(me.role),
    room,
    targetUserId,
    targetRole: normalizeRole(target.role),
  };
  if (!canKickGroupMember(permCtx)) return { ok: false, error: GROUP_ROOM_ERROR.FORBIDDEN };

  // P0: RPC `community_messenger_kick_group_member` is service_role-only — use gated participant update.
  const left = await markParticipantLeft(sb, roomId, targetUserId);
  if (!left.ok) return { ok: false, error: left.error ?? GROUP_ROOM_ERROR.KICK_FAILED };

  const targetMap = await fetchProfileLabels(sb, [targetUserId]);
  await appendGroupMgmtSystemMessage(sb, {
    actorUserId: userId,
    roomId,
    content: cmMgmtMemberKickContent(targetMap.get(targetUserId)),
  });
  return { ok: true };
}

export async function leaveGroupRoom(input: {
  userId: string;
  roomId: string;
}): Promise<{ ok: boolean; error?: string }> {
  const userId = trimText(input.userId);
  const roomId = trimText(input.roomId);
  if (!roomId || !userId) return { ok: false, error: GROUP_ROOM_ERROR.ROOM_NOT_FOUND };

  const sb = resolveGroupRoomSupabase();
  if (!sb) return { ok: false, error: GROUP_ROOM_ERROR.MESSENGER_MIGRATION_REQUIRED };

  const room = await fetchPrivateGroupRoom(sb, roomId);
  if (!room) return { ok: false, error: GROUP_ROOM_ERROR.ROOM_NOT_FOUND };

  const me = await fetchActiveParticipant(sb, roomId, userId);
  if (!me) return { ok: false, error: GROUP_ROOM_ERROR.ROOM_NOT_FOUND };

  const { data, error } = await (sb as any).rpc("community_messenger_leave_private_group", {
    p_room_id: roomId,
    p_user_id: userId,
  });
  if (!error) {
    const row = (Array.isArray(data) ? data[0] : data) as { ok?: boolean; error?: string } | null;
    if (row && row.ok === false) {
      return { ok: false, error: String(row.error ?? GROUP_ROOM_ERROR.LEAVE_FAILED) };
    }
    await publishGroupRoomListBump({ roomId, fromUserId: userId });
    return { ok: true };
  }

  const rpcMsg = String(error.message ?? "");
  const rpcMissing = /could not find the function|does not exist|PGRST202/i.test(rpcMsg);
  if (!rpcMissing) {
    return { ok: false, error: rpcMsg || GROUP_ROOM_ERROR.LEAVE_FAILED };
  }

  // Pre-migration fallback (non-atomic). Prefer applying 20261010120000_cm_group_membership_authority.
  const isOwner = trimText(room.owner_user_id) === userId || normalizeRole(me.role) === "owner";
  if (isOwner) {
    const { data: successors, error: succErr } = await (sb as any)
      .from("community_messenger_participants")
      .select("user_id")
      .eq("room_id", roomId)
      .neq("user_id", userId)
      .is("left_at", null)
      .is("blocked_hidden_at", null)
      .order("joined_at", { ascending: true, nullsFirst: false })
      .order("user_id", { ascending: true })
      .limit(1);
    if (succErr) return { ok: false, error: String(succErr.message ?? GROUP_ROOM_ERROR.LEAVE_FAILED) };
    const nextOwner = trimText((successors?.[0] as { user_id?: string } | undefined)?.user_id);
    if (nextOwner) {
      await (sb as any)
        .from("community_messenger_participants")
        .update({ left_at: new Date().toISOString(), role: "member" })
        .eq("room_id", roomId)
        .eq("user_id", userId)
        .is("left_at", null);
      await (sb as any)
        .from("community_messenger_participants")
        .update({ role: "owner" })
        .eq("room_id", roomId)
        .eq("user_id", nextOwner)
        .is("left_at", null);
      await (sb as any).from("community_messenger_rooms").update({ owner_user_id: nextOwner }).eq("id", roomId);
    } else {
      await (sb as any).from("community_messenger_rooms").update({ room_status: "archived" }).eq("id", roomId);
      const left = await markParticipantLeft(sb, roomId, userId);
      if (!left.ok) return { ok: false, error: left.error ?? GROUP_ROOM_ERROR.LEAVE_FAILED };
    }
  } else {
    const left = await markParticipantLeft(sb, roomId, userId);
    if (!left.ok) return { ok: false, error: left.error ?? GROUP_ROOM_ERROR.LEAVE_FAILED };
  }

  await publishGroupRoomListBump({ roomId, fromUserId: userId });
  return { ok: true };
}

export async function updateGroupRoomSettings(input: {
  userId: string;
  roomId: string;
  settings: GroupRoomSettingsPatch;
}): Promise<{ ok: boolean; error?: string }> {
  const userId = trimText(input.userId);
  const roomId = trimText(input.roomId);
  if (!roomId) return { ok: false, error: GROUP_ROOM_ERROR.ROOM_NOT_FOUND };

  const sb = resolveGroupRoomSupabase();
  if (!sb) return { ok: false, error: GROUP_ROOM_ERROR.MESSENGER_MIGRATION_REQUIRED };

  const room = await fetchPrivateGroupRoom(sb, roomId);
  if (!room) return { ok: false, error: GROUP_ROOM_ERROR.NOT_GROUP_ROOM };

  const me = await fetchActiveParticipant(sb, roomId, userId);
  if (!me) return { ok: false, error: GROUP_ROOM_ERROR.FORBIDDEN };

  const permCtx: GroupRoomPermissionContext = {
    viewerUserId: userId,
    viewerRole: normalizeRole(me.role),
    room,
  };

  const wantsNotice = typeof input.settings.noticeText === "string";
  const wantsPermissions =
    typeof input.settings.allowMemberInvite === "boolean" ||
    typeof input.settings.allowAdminInvite === "boolean" ||
    typeof input.settings.allowAdminKick === "boolean" ||
    typeof input.settings.allowAdminEditNotice === "boolean" ||
    typeof input.settings.allowMemberUpload === "boolean" ||
    typeof input.settings.allowMemberCall === "boolean";
  const wantsTitle = typeof input.settings.title === "string";

  if ((wantsNotice || wantsTitle) && !canEditGroupRoomMeta(permCtx)) {
    return { ok: false, error: GROUP_ROOM_ERROR.FORBIDDEN };
  }
  if (wantsPermissions && normalizeRole(me.role) !== "owner") {
    return { ok: false, error: GROUP_ROOM_ERROR.FORBIDDEN };
  }

  const patched = await patchGroupRoomSettings(sb, roomId, input.settings);
  if (!patched.ok) return patched;

  if (wantsNotice) {
    await appendGroupMgmtSystemMessage(sb, {
      actorUserId: userId,
      roomId,
      content: cmMgmtNoticeContent(trimText(input.settings.noticeText)),
    });
  } else if (wantsPermissions) {
    await appendGroupMgmtSystemMessage(sb, {
      actorUserId: userId,
      roomId,
      content: cmMgmtPermissionsContent(),
    });
  }

  await publishGroupRoomListBump({ roomId, fromUserId: userId });
  return { ok: true };
}

export async function listMyGroupRooms(
  userId: string,
  limit = 200
): Promise<{ ok: true; rooms: GroupRoomListItem[] } | { ok: false; error: string }> {
  const uid = trimText(userId);
  if (!uid) return { ok: false, error: GROUP_ROOM_ERROR.FORBIDDEN };
  const sb = resolveGroupRoomSupabase();
  if (!sb) return { ok: false, error: GROUP_ROOM_ERROR.MESSENGER_MIGRATION_REQUIRED };

  const rows = await listMyPrivateGroupRooms(sb, uid, limit);
  const rooms: GroupRoomListItem[] = [];
  for (const row of rows) {
    const memberCount = await countActiveParticipants(sb, row.id);
    rooms.push({
      id: row.id,
      roomType: "private_group",
      title: trimText(row.title) || cmServiceT("cm_svc_group_members", { count: memberCount }),
      memberCount,
      lastMessage: trimText(row.last_message),
      lastMessageAt: trimText(row.last_message_at) || new Date(0).toISOString(),
      lastMessageType: (trimText(row.last_message_type) || "text") as GroupRoomListItem["lastMessageType"],
      unreadCount: Math.max(0, Number(row.participant.unread_count ?? 0)),
      isMuted: row.participant.is_muted === true,
      isPinned: row.participant.is_pinned === true,
      ownerUserId: trimText(row.owner_user_id) || null,
    });
  }
  return { ok: true, rooms };
}

export async function assertActivePrivateGroupSender(input: {
  userId: string;
  roomId: string;
}): Promise<
  | { ok: true; room: GroupRoomRow; participant: GroupParticipantRow }
  | { ok: false; error: string }
> {
  const userId = trimText(input.userId);
  const roomId = trimText(input.roomId);
  if (!roomId) return { ok: false, error: GROUP_ROOM_ERROR.ROOM_NOT_FOUND };

  const sb = resolveGroupRoomSupabase();
  if (!sb) return { ok: false, error: GROUP_ROOM_ERROR.MESSENGER_MIGRATION_REQUIRED };

  const room = await fetchPrivateGroupRoom(sb, roomId);
  if (!room) return { ok: false, error: GROUP_ROOM_ERROR.NOT_GROUP_ROOM };
  if (roomUnavailable(room)) return { ok: false, error: GROUP_ROOM_ERROR.ROOM_UNAVAILABLE };

  const participant = await fetchActiveParticipant(sb, roomId, userId);
  if (!participant) return { ok: false, error: GROUP_ROOM_ERROR.FORBIDDEN };

  return { ok: true, room, participant };
}
