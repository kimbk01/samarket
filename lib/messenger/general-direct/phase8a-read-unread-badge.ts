/**
 * Phase 8A — general_direct Read/Unread/Badge architecture ports.
 */
import { createDomainReadPortHarness } from "@/lib/messenger/contracts/domain-read-port-harness";
import type {
  GeneralDirectUnreadContribution,
  DomainAppIconContribution,
  DomainReadRequest,
} from "@/lib/messenger/contracts/domain-read-unread-badge";
import {
  D1_2_APP_ICON_UNIT,
  D1_2_APP_ICON_UNIT_OPEN,
} from "@/lib/messenger/contracts/badge-unit-policy-phase8b";
import { assertGeneralDirectOwnedRoom } from "@/lib/messenger/general-direct/identity";
import { assertGeneralDirectViewerPermission } from "@/lib/messenger/general-direct/permission";
import { GENERAL_DIRECT_DOMAIN } from "@/lib/messenger/general-direct/types";
import { parseGeneralDirectIdentityKey } from "@/lib/messenger/general-direct/identity";
import {
  buildGeneralDirectBadgeContribution,
  countGeneralDirectUnreadRooms,
  sumGeneralDirectUnread,
} from "@/lib/messenger/general-direct/read-unread-badge";
import type { GeneralDirectListItem } from "@/lib/messenger/general-direct/types";

export function createGeneralDirectReadPort() {
  return createDomainReadPortHarness({
    domain: GENERAL_DIRECT_DOMAIN,
    assertIdentity: (req: DomainReadRequest) => {
      assertGeneralDirectOwnedRoom({
        roomId: req.roomId,
        chatDomain: req.chatDomain as "general_direct",
        domainIdentityKey: req.domainIdentityKey,
      });
    },
    assertPermission: (req: DomainReadRequest) => {
      const { userA, userB } = parseGeneralDirectIdentityKey(req.domainIdentityKey);
      assertGeneralDirectViewerPermission({
        viewerUserId: req.viewerUserId,
        room: {
          roomId: req.roomId,
          chatDomain: req.chatDomain,
          domainIdentityKey: req.domainIdentityKey,
          participantUserIds: [userA, userB],
        },
      });
    },
  });
}

export type GeneralDirectReadPort = ReturnType<typeof createGeneralDirectReadPort>;

export function buildGeneralDirectUnreadContribution(input: {
  viewerUserId: string;
  rows: ReadonlyArray<GeneralDirectListItem>;
  generation: number;
}): GeneralDirectUnreadContribution {
  for (const r of input.rows) {
    if (r.chatDomain !== GENERAL_DIRECT_DOMAIN) {
      throw new Error("dibay_general_direct_unread_foreign_row");
    }
  }
  const unreadIdentityKeys = input.rows
    .filter((r) => r.unreadCount > 0)
    .map((r) => r.domainIdentityKey);
  return {
    domain: GENERAL_DIRECT_DOMAIN,
    viewerUserId: input.viewerUserId,
    unreadMessageCount: sumGeneralDirectUnread(input.rows),
    unreadRoomCount: countGeneralDirectUnreadRooms(input.rows),
    unreadIdentityKeys,
    latestUnreadGeneration: input.generation,
    generation: input.generation,
    sourceAuthority: "server_snapshot",
    computedAt: new Date().toISOString(),
  };
}

export function buildGeneralDirectAppIconContribution(
  unread: GeneralDirectUnreadContribution,
  notificationEventCount = 0
): DomainAppIconContribution {
  return {
    domain: GENERAL_DIRECT_DOMAIN,
    viewerUserId: unread.viewerUserId,
    unreadMessageCount: unread.unreadMessageCount,
    unreadRoomCount: unread.unreadRoomCount,
    notificationEventCount,
    generation: unread.generation,
    d1_2UnitSelection: D1_2_APP_ICON_UNIT,
    d1_2Open: D1_2_APP_ICON_UNIT_OPEN,
  };
}

export function buildGeneralDirectRowBadge(row: GeneralDirectListItem): number {
  if (row.chatDomain !== GENERAL_DIRECT_DOMAIN) {
    throw new Error("dibay_general_direct_row_badge_foreign");
  }
  return Math.max(0, row.unreadCount);
}

/** 기존 BadgeContribution 과 Phase8A Unread contribution 연계 */
export { buildGeneralDirectBadgeContribution };
