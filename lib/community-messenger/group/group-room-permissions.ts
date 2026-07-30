import type { GroupRoomRole, GroupRoomRow } from "@/lib/community-messenger/group/group-room.types";

export type GroupRoomPermissionContext = {
  viewerUserId: string;
  viewerRole: GroupRoomRole;
  room: Pick<
    GroupRoomRow,
    | "owner_user_id"
    | "allow_member_invite"
    | "allow_admin_invite"
    | "allow_admin_kick"
    | "allow_admin_edit_notice"
  >;
  targetUserId?: string | null;
  targetRole?: GroupRoomRole | null;
};

/** Owner always; admin when room flag allows. */
export const GROUP_ADMIN_CAN_EDIT_ROOM_META = true;

export type GroupRoomCapabilities = {
  canInviteMembers: boolean;
  canEditGroupInfo: boolean;
  canEditNotice: boolean;
  /** Viewer may kick some members (target still checked via canKickGroupMember). */
  canKickMembers: boolean;
  canPromoteMember: boolean;
  canDemoteAdmin: boolean;
  canUpdatePermissions: boolean;
};

function trimText(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function isRoomOwner(ctx: GroupRoomPermissionContext): boolean {
  const ownerId = trimText(ctx.room.owner_user_id);
  return ownerId === ctx.viewerUserId || ctx.viewerRole === "owner";
}

function targetIsOwner(ctx: GroupRoomPermissionContext): boolean {
  const ownerId = trimText(ctx.room.owner_user_id);
  const targetId = trimText(ctx.targetUserId);
  if (ownerId && targetId && ownerId === targetId) return true;
  return ctx.targetRole === "owner";
}

export function canInviteToGroup(ctx: GroupRoomPermissionContext): boolean {
  if (isRoomOwner(ctx)) return true;
  if (ctx.viewerRole === "admin") return ctx.room.allow_admin_invite !== false;
  return ctx.room.allow_member_invite !== false;
}

export function canKickGroupMember(ctx: GroupRoomPermissionContext): boolean {
  if (targetIsOwner(ctx)) return false;
  if (trimText(ctx.targetUserId) === ctx.viewerUserId) return false;
  if (isRoomOwner(ctx)) return true;
  if (ctx.viewerRole !== "admin") return false;
  if (ctx.room.allow_admin_kick === false) return false;
  return (ctx.targetRole ?? "member") === "member";
}

export function canEditGroupRoomMeta(ctx: GroupRoomPermissionContext): boolean {
  if (isRoomOwner(ctx)) return true;
  if (!GROUP_ADMIN_CAN_EDIT_ROOM_META) return false;
  if (ctx.viewerRole !== "admin") return false;
  return ctx.room.allow_admin_edit_notice !== false;
}

/** Canonical UI+server capability snapshot (invite/meta/roles). Target-specific kick uses canKickGroupMember. */
export function resolveGroupRoomCapabilities(ctx: GroupRoomPermissionContext): GroupRoomCapabilities {
  const owner = isRoomOwner(ctx);
  const canEditMeta = canEditGroupRoomMeta(ctx);
  return {
    canInviteMembers: canInviteToGroup(ctx),
    canEditGroupInfo: canEditMeta,
    canEditNotice: canEditMeta,
    canKickMembers:
      owner || (ctx.viewerRole === "admin" && ctx.room.allow_admin_kick !== false),
    canPromoteMember: owner,
    canDemoteAdmin: owner,
    canUpdatePermissions: owner,
  };
}
