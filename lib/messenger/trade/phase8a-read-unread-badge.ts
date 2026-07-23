/**
 * Phase 8A — trade Read/Unread/Badge architecture ports.
 * Hub only · nav_messenger contribution 0.
 */
import { createDomainReadPortHarness } from "@/lib/messenger/contracts/domain-read-port-harness";
import type {
  TradeUnreadContribution,
  DomainAppIconContribution,
  DomainReadRequest,
} from "@/lib/messenger/contracts/domain-read-unread-badge";
import {
  D1_2_APP_ICON_UNIT,
  D1_2_APP_ICON_UNIT_OPEN,
} from "@/lib/messenger/contracts/badge-unit-policy-phase8b";
import { assertTradeOwnedRoom, parseTradeIdentityKey } from "@/lib/messenger/trade/identity";
import { assertTradeViewerPermission } from "@/lib/messenger/trade/permission";
import { TRADE_DOMAIN, type TradeListItem } from "@/lib/messenger/trade/types";
import {
  buildTradeBadgeContribution,
  countTradeUnreadRooms,
} from "@/lib/messenger/trade/read-unread-badge";

export function createTradeReadPort() {
  return createDomainReadPortHarness({
    domain: TRADE_DOMAIN,
    assertIdentity: (req: DomainReadRequest) => {
      assertTradeOwnedRoom({
        roomId: req.roomId,
        chatDomain: req.chatDomain as "trade",
        domainIdentityKey: req.domainIdentityKey,
      });
    },
    assertPermission: (req: DomainReadRequest) => {
      const parts = parseTradeIdentityKey(req.domainIdentityKey);
      assertTradeViewerPermission({
        viewerUserId: req.viewerUserId,
        room: {
          roomId: req.roomId,
          chatDomain: req.chatDomain,
          domainIdentityKey: req.domainIdentityKey,
          sellerUserId: parts.sellerUserId,
          counterpartyUserId: parts.counterpartyUserId,
          participantUserIds: [parts.sellerUserId, parts.counterpartyUserId],
        },
      });
    },
  });
}

export type TradeReadPort = ReturnType<typeof createTradeReadPort>;

export function buildTradeUnreadContribution(input: {
  viewerUserId: string;
  rows: ReadonlyArray<TradeListItem>;
  generation: number;
}): TradeUnreadContribution {
  for (const r of input.rows) {
    if (r.chatDomain !== TRADE_DOMAIN) throw new Error("dibay_trade_unread_foreign_row");
  }
  let messageCount = 0;
  for (const r of input.rows) messageCount += Math.max(0, r.unreadCount);
  return {
    domain: TRADE_DOMAIN,
    viewerUserId: input.viewerUserId,
    unreadMessageCount: messageCount,
    unreadRoomCount: countTradeUnreadRooms(input.rows),
    unreadIdentityKeys: input.rows.filter((r) => r.unreadCount > 0).map((r) => r.domainIdentityKey),
    latestUnreadGeneration: input.generation,
    generation: input.generation,
    sourceAuthority: "server_snapshot",
    computedAt: new Date().toISOString(),
  };
}

export function buildTradeHubBadgeFromUnread(unread: TradeUnreadContribution): number {
  if (unread.domain !== TRADE_DOMAIN) throw new Error("dibay_trade_hub_badge_foreign");
  return unread.unreadRoomCount;
}

export function buildTradeAppIconContribution(
  unread: TradeUnreadContribution,
  notificationEventCount = 0
): DomainAppIconContribution {
  return {
    domain: TRADE_DOMAIN,
    viewerUserId: unread.viewerUserId,
    unreadMessageCount: unread.unreadMessageCount,
    unreadRoomCount: unread.unreadRoomCount,
    notificationEventCount,
    generation: unread.generation,
    d1_2UnitSelection: D1_2_APP_ICON_UNIT,
    d1_2Open: D1_2_APP_ICON_UNIT_OPEN,
  };
}

export function buildTradeRowBadge(row: TradeListItem): number {
  if (row.chatDomain !== TRADE_DOMAIN) throw new Error("dibay_trade_row_badge_foreign");
  return Math.max(0, row.unreadCount);
}

export { buildTradeBadgeContribution };
