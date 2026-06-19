import type { GroupRoomRole } from "@/lib/community-messenger/group/group-room.types";
import { canEditGroupRoomMeta, type GroupRoomPermissionContext } from "@/lib/community-messenger/group/group-room-permissions";

export function canPinGroupMessage(ctx: GroupRoomPermissionContext): boolean {
  return canEditGroupRoomMeta(ctx);
}

export function canUnpinGroupMessage(ctx: GroupRoomPermissionContext): boolean {
  return canEditGroupRoomMeta(ctx);
}

export function canViewPinnedGroupMessage(_ctx: GroupRoomPermissionContext): boolean {
  return true;
}
