import type { GroupRoomRole } from "@/lib/community-messenger/group/group-room.types";
import type { GroupRoomPermissionContext } from "@/lib/community-messenger/group/group-room-permissions";

function trimText(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

function isOwner(ctx: GroupRoomPermissionContext): boolean {
  const ownerId = trimText(ctx.room.owner_user_id);
  return ownerId === ctx.viewerUserId || ctx.viewerRole === "owner";
}

export function canAssignGroupAdmin(ctx: GroupRoomPermissionContext): boolean {
  return isOwner(ctx);
}

export function canRevokeGroupAdmin(ctx: GroupRoomPermissionContext): boolean {
  return isOwner(ctx);
}

export function canTransferGroupOwner(ctx: GroupRoomPermissionContext): boolean {
  return isOwner(ctx);
}

export function canChangeTargetRole(
  ctx: GroupRoomPermissionContext,
  nextRole: GroupRoomRole
): boolean {
  if (nextRole === "owner") return canTransferGroupOwner(ctx);
  if (nextRole === "admin") return canAssignGroupAdmin(ctx);
  if (nextRole === "member") return canRevokeGroupAdmin(ctx);
  return false;
}

export function isGroupAdminRole(role: GroupRoomRole | string | null | undefined): boolean {
  return trimText(role) === "admin";
}

export function isGroupOwnerRole(role: GroupRoomRole | string | null | undefined): boolean {
  return trimText(role) === "owner";
}

export function groupRoleBadgeLabel(role: GroupRoomRole | string): string | null {
  const r = trimText(role);
  if (r === "owner") return "방장";
  if (r === "admin") return "관리자";
  return null;
}
