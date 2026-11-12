import { resolveMemberAvatarStorageOrigin } from "@/lib/profile/member-avatar-url-policy";
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
  const current = await fetchGroupRoomProfileRow(sb, roomId);
  if (!current) return { ok: false, error: GROUP_ROOM_ERROR.ROOM_NOT_FOUND };
  const normalized = normalizeGroupRoomProfilePatch(input.patch, {
    editorUserId: userId,
    currentAvatarUrl: current.avatar_url,
    storageOrigin: resolveMemberAvatarStorageOrigin(),
  });
  if (!normalized.ok) return { ok: false, error: normalized.error };
  const updated = await patchGroupRoomProfile(sb, roomId, normalized.patch);
  if (!updated.ok) return { ok: false, error: updated.error ?? GROUP_ROOM_ERROR.UPDATE_FAILED };
  await notifyGroupRoomProfileChangedToMembersBestEffort({ roomId, actorUserId: userId });
  return { ok: true };
}

/**
 * 사진·제목 저장 후 다른 멤버 홈 목록 행 교체 (group-chat-full-fix-design G5).
 * - 받는 사람 기준 방 요약을 사용자 채널로 보낸다 → 클라이언트 `insert_room_summary` 가 행을 교체(안 읽음 증가 없음).
 * - `publishGroupRoomListBump` 는 쓰지 않는다: 멤버마다 안 읽음 대상·`message_created` 알림 엔진이 돌아 사진만 바꿔도 안 읽음이 생긴다.
 * - 서버 home-sync 스냅샷 무효화(다음 목록 요청이 새 스냅샷).
 * 실패해도 저장은 성공으로 둔다(이미 DB 반영 · 다음 목록 갱신에서 맞춰짐).
 */
async function notifyGroupRoomProfileChangedToMembersBestEffort(input: {
  roomId: string;
  actorUserId: string;
}): Promise<void> {
  try {
    const { listActiveGroupRecipientUserIds } = await import(
      "@/lib/community-messenger/group/group-active-membership-gate"
    );
    const memberIds = (await listActiveGroupRecipientUserIds({ roomId: input.roomId })) ?? [];
    if (memberIds.length === 0) return;
    const { invalidateHomeSyncSnapshotCache } = await import("@/lib/community-messenger/home-sync-snapshot-cache");
    for (const uid of memberIds) invalidateHomeSyncSnapshotCache(uid);
    const { publishHomeListRoomInsertForInviteesBestEffort } = await import(
      "@/lib/community-messenger/realtime/home-list-room-insert-broadcast-server"
    );
    await publishHomeListRoomInsertForInviteesBestEffort({
      fromUserId: input.actorUserId,
      roomId: input.roomId,
      inviteeUserIds: memberIds,
    });
  } catch {
    /* best-effort — 저장 결과에 영향 없음 */
  }
}
