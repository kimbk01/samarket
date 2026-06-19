import type { GroupRoomRole } from "@/lib/community-messenger/group/group-room.types";
import { canEditGroupRoomMeta, type GroupRoomPermissionContext } from "@/lib/community-messenger/group/group-room-permissions";

export type GroupRoomProfilePatch = {
  title?: string;
  avatarUrl?: string | null;
};

function trimText(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

export function canEditGroupRoomProfile(ctx: GroupRoomPermissionContext): boolean {
  return canEditGroupRoomMeta(ctx);
}

export function canViewGroupRoomProfile(_ctx: GroupRoomPermissionContext): boolean {
  return true;
}

export function normalizeGroupRoomProfilePatch(
  patch: GroupRoomProfilePatch,
  viewerRole: GroupRoomRole
): GroupRoomProfilePatch | null {
  const out: GroupRoomProfilePatch = {};
  if (typeof patch.title === "string") {
    const title = trimText(patch.title).slice(0, 120);
    if (!title && viewerRole !== "owner" && viewerRole !== "admin") return null;
    out.title = title;
  }
  if (patch.avatarUrl !== undefined) {
    const url = patch.avatarUrl == null ? null : trimText(patch.avatarUrl).slice(0, 2048);
    out.avatarUrl = url && url.length > 0 ? url : null;
  }
  return Object.keys(out).length ? out : null;
}
