/**
 * Phase 3 S2-4 — Group Soft Delete (Tombstone).
 * CONTRACT:
 * - Soft delete only via deleted_at/deleted_by (never hard DELETE room row)
 * - Owner only — not leave / kick / ban / viewer archive / room archive
 * - Preserve participants, messages, bans, invite/request history, audits
 * - Do not modify Ban / Ghost / Online LOCK helpers
 */
import { appendAuditLog } from "@/lib/audit/append-audit-log";
import { GROUP_ROOM_ERROR } from "@/lib/community-messenger/group/group-room-errors";
import { publishGroupRoomListBump } from "@/lib/community-messenger/group/group-room-realtime";
import {
  fetchPrivateGroupRoom,
  resolveGroupRoomSupabase,
} from "@/lib/community-messenger/group/group-room-repository";
import { invalidateCmBootstrapSnapshotCache } from "@/lib/community-messenger/cm-bootstrap-snapshot-cache";
import { invalidateFullBootstrapSnapshotCache } from "@/lib/community-messenger/full-bootstrap-snapshot-cache";
import {
  invalidateRoomBootstrapSnapshotCache,
  invalidateRoomBootstrapSnapshotCacheForViewer,
} from "@/lib/community-messenger/room-bootstrap-snapshot-cache";

export const GROUP_DELETE_AUDIT_ACTION = "community_messenger.group_deleted";

function trimText(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

export function isGroupRoomTombstoned(room: {
  deleted_at?: string | null;
  deletedAt?: string | null;
}): boolean {
  return Boolean(trimText(room.deleted_at) || trimText(room.deletedAt));
}

export async function isPrivateGroupRoomDeleted(
  sb: NonNullable<ReturnType<typeof resolveGroupRoomSupabase>>,
  roomId: string
): Promise<boolean> {
  const rid = trimText(roomId);
  if (!rid) return false;
  const { data, error } = await (sb as any)
    .from("community_messenger_rooms")
    .select("deleted_at")
    .eq("id", rid)
    .maybeSingle();
  if (error) {
    if (/does not exist|column/i.test(String(error.message ?? ""))) return false;
    return false;
  }
  return Boolean(trimText((data as { deleted_at?: string | null } | null)?.deleted_at));
}

export async function assertPrivateGroupRoomNotDeleted(
  sb: NonNullable<ReturnType<typeof resolveGroupRoomSupabase>>,
  roomId: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (await isPrivateGroupRoomDeleted(sb, roomId)) {
    return { ok: false, error: GROUP_ROOM_ERROR.ROOM_DELETED };
  }
  return { ok: true };
}

export type DeletePrivateGroupResult =
  | { ok: true; alreadyDeleted?: boolean; deletedAt?: string; deletedBy?: string }
  | { ok: false; error: string };

export async function deletePrivateGroupRoomSoft(input: {
  userId: string;
  roomId: string;
}): Promise<DeletePrivateGroupResult> {
  const sb = resolveGroupRoomSupabase();
  if (!sb) return { ok: false, error: GROUP_ROOM_ERROR.MESSENGER_MIGRATION_REQUIRED };
  const userId = trimText(input.userId);
  const roomId = trimText(input.roomId);
  if (!roomId || !userId) return { ok: false, error: GROUP_ROOM_ERROR.ROOM_NOT_FOUND };

  const room = await fetchPrivateGroupRoom(sb, roomId);
  if (!room) return { ok: false, error: GROUP_ROOM_ERROR.ROOM_NOT_FOUND };

  const { data, error } = await (sb as any).rpc("community_messenger_delete_private_group", {
    p_room_id: roomId,
    p_actor_user_id: userId,
  });
  if (error) {
    return { ok: false, error: String(error.message ?? GROUP_ROOM_ERROR.DELETE_FAILED) };
  }
  const row = (Array.isArray(data) ? data[0] : data) as {
    ok?: boolean;
    error?: string;
    already_deleted?: boolean;
    deleted_at?: string;
    deleted_by?: string;
  } | null;
  if (!row?.ok) {
    const code = String(row?.error ?? GROUP_ROOM_ERROR.FORBIDDEN);
    if (code === "room_not_found") return { ok: false, error: GROUP_ROOM_ERROR.ROOM_NOT_FOUND };
    if (code === "forbidden") return { ok: false, error: GROUP_ROOM_ERROR.FORBIDDEN };
    return { ok: false, error: code };
  }

  const deletedAt = trimText(row.deleted_at) || new Date().toISOString();
  const deletedBy = trimText(row.deleted_by) || userId;

  if (!row.already_deleted) {
    await appendAuditLog(sb as any, {
      actor_type: "user",
      actor_id: userId,
      target_type: "community_messenger_room",
      target_id: roomId,
      action: GROUP_DELETE_AUDIT_ACTION,
      after_json: {
        roomId,
        deletedBy,
        deletedAt,
        actorRole: "owner",
      },
    });
  }

  try {
    invalidateCmBootstrapSnapshotCache(userId);
    invalidateFullBootstrapSnapshotCache(userId, "group_delete");
    invalidateRoomBootstrapSnapshotCacheForViewer(roomId, userId);
    invalidateRoomBootstrapSnapshotCache(roomId, [userId]);
  } catch {
    // cache best-effort
  }

  await publishGroupRoomListBump({
    roomId,
    fromUserId: userId,
    listAction: "remove",
    reason: "group_deleted",
    messageId: `group_deleted:${roomId}:${deletedAt}`,
  });

  return {
    ok: true,
    alreadyDeleted: row.already_deleted === true,
    deletedAt,
    deletedBy,
  };
}
