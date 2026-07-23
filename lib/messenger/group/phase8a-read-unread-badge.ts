/**
 * Phase 8A — group Read/Unread/Badge architecture ports.
 */
import { createDomainReadPortHarness } from "@/lib/messenger/contracts/domain-read-port-harness";
import type {
  GroupUnreadContribution,
  DomainAppIconContribution,
  DomainReadRequest,
} from "@/lib/messenger/contracts/domain-read-unread-badge";
import {
  D1_2_APP_ICON_UNIT,
  D1_2_APP_ICON_UNIT_OPEN,
} from "@/lib/messenger/contracts/badge-unit-policy-phase8b";
import { assertGroupOwnedRoom, parseGroupIdentityKey } from "@/lib/messenger/group/identity";
import { assertGroupViewerPermission } from "@/lib/messenger/group/permission";
import { GROUP_DOMAIN, type GroupListItem } from "@/lib/messenger/group/types";
import {
  buildGroupBadgeContribution,
  countGroupUnreadRooms,
  sumGroupUnread,
} from "@/lib/messenger/group/read-unread-badge";

export function createGroupReadPort() {
  return createDomainReadPortHarness({
    domain: GROUP_DOMAIN,
    assertIdentity: (req: DomainReadRequest) => {
      assertGroupOwnedRoom({
        roomId: req.roomId,
        chatDomain: req.chatDomain as "group",
        domainIdentityKey: req.domainIdentityKey,
      });
    },
    assertPermission: (req: DomainReadRequest) => {
      const { groupId } = parseGroupIdentityKey(req.domainIdentityKey);
      assertGroupViewerPermission({
        viewerUserId: req.viewerUserId,
        room: {
          roomId: req.roomId,
          chatDomain: req.chatDomain,
          domainIdentityKey: req.domainIdentityKey,
          groupId,
          subtype: "private_group",
          memberUserIds: [req.viewerUserId],
        },
      });
    },
  });
}

export type GroupReadPort = ReturnType<typeof createGroupReadPort>;

export function buildGroupUnreadContribution(input: {
  viewerUserId: string;
  rows: ReadonlyArray<GroupListItem>;
  generation: number;
}): GroupUnreadContribution {
  for (const r of input.rows) {
    if (r.chatDomain !== GROUP_DOMAIN) throw new Error("dibay_group_unread_foreign_row");
  }
  return {
    domain: GROUP_DOMAIN,
    viewerUserId: input.viewerUserId,
    unreadMessageCount: sumGroupUnread(input.rows),
    unreadRoomCount: countGroupUnreadRooms(input.rows),
    unreadIdentityKeys: input.rows.filter((r) => r.unreadCount > 0).map((r) => r.domainIdentityKey),
    latestUnreadGeneration: input.generation,
    generation: input.generation,
    sourceAuthority: "server_snapshot",
    computedAt: new Date().toISOString(),
  };
}

export function buildGroupAppIconContribution(
  unread: GroupUnreadContribution,
  notificationEventCount = 0
): DomainAppIconContribution {
  return {
    domain: GROUP_DOMAIN,
    viewerUserId: unread.viewerUserId,
    unreadMessageCount: unread.unreadMessageCount,
    unreadRoomCount: unread.unreadRoomCount,
    notificationEventCount,
    generation: unread.generation,
    d1_2UnitSelection: D1_2_APP_ICON_UNIT,
    d1_2Open: D1_2_APP_ICON_UNIT_OPEN,
  };
}

export function buildGroupRowBadge(row: GroupListItem): number {
  if (row.chatDomain !== GROUP_DOMAIN) throw new Error("dibay_group_row_badge_foreign");
  return Math.max(0, row.unreadCount);
}

export { buildGroupBadgeContribution };
