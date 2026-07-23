/**
 * group PermissionPort — 서버 권위 계약 (route/RLS 변경 없음).
 * membership 필수. friend 관계로 접근 금지.
 */
import type { MessengerPermissionPort } from "@/lib/messenger/contracts/ports";
import { assertGroupOwnedRoom, parseGroupIdentityKey } from "@/lib/messenger/group/identity";
import { GROUP_DOMAIN, type GroupSubtype } from "@/lib/messenger/group/types";

export type GroupPermissionContext = Readonly<{
  viewerUserId: string;
  room: {
    roomId: string;
    chatDomain: string | null | undefined;
    domainIdentityKey: string | null | undefined;
    groupId: string;
    subtype: GroupSubtype;
    memberUserIds: ReadonlyArray<string>;
    /** open group 열람 정책 — Phase 5 테스트 adapter 플래그 */
    openBrowseAllowed?: boolean;
  };
}>;

export function assertGroupViewerPermission(ctx: GroupPermissionContext): void {
  const viewer = ctx.viewerUserId.trim();
  if (!viewer) throw new Error("dibay_group_viewer_required");
  assertGroupOwnedRoom({
    roomId: ctx.room.roomId,
    chatDomain: (ctx.room.chatDomain ?? "") as "group",
    domainIdentityKey: ctx.room.domainIdentityKey ?? "",
  });
  const { groupId } = parseGroupIdentityKey(ctx.room.domainIdentityKey ?? "");
  if (groupId !== ctx.room.groupId.trim()) {
    throw new Error("dibay_group_permission_group_mismatch");
  }
  const members = ctx.room.memberUserIds.map((id) => id.trim()).filter(Boolean);
  const isMember = members.includes(viewer);
  if (ctx.room.subtype === "private_group") {
    if (!isMember) throw new Error("dibay_group_private_membership_required");
    return;
  }
  // open_group
  if (!isMember && !ctx.room.openBrowseAllowed) {
    throw new Error("dibay_group_open_membership_or_browse_required");
  }
}

export type GroupListApiPlan = Readonly<{
  method: "GET";
  proposedPath: "/api/messenger/group/list";
  response: { domain: typeof GROUP_DOMAIN; generation: string; rows: "GroupListItem[]" };
  serverFilters: ReadonlyArray<string>;
}>;

export const GROUP_LIST_API_PLAN: GroupListApiPlan = {
  method: "GET",
  proposedPath: "/api/messenger/group/list",
  response: { domain: GROUP_DOMAIN, generation: "string", rows: "GroupListItem[]" },
  serverFilters: [
    "chat_domain = group",
    "viewer is member (private) or membership/browse policy (open)",
    "reject other domains",
  ],
};

export const groupPermissionPort: MessengerPermissionPort = {
  domain: GROUP_DOMAIN,
  serverAuthoritative: true,
};
