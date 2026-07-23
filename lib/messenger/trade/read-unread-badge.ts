/**
 * trade Read / Unread / Badge — nav_messenger contribution 금지.
 */
import type {
  MessengerBadgePort,
  MessengerReadPort,
  MessengerUnreadPort,
} from "@/lib/messenger/contracts/ports";
import { assertTradeOwnedRoom } from "@/lib/messenger/trade/identity";
import { TRADE_DOMAIN, type TradeListItem } from "@/lib/messenger/trade/types";

export function assertTradeReadAllowed(req: {
  roomId: string;
  chatDomain: string;
  domainIdentityKey: string;
}): void {
  if (req.chatDomain === "general_direct" || req.chatDomain === "group" || req.chatDomain === "store_order") {
    throw new Error(`dibay_trade_read_rejects:${req.chatDomain}`);
  }
  assertTradeOwnedRoom({
    roomId: req.roomId,
    chatDomain: req.chatDomain as "trade",
    domainIdentityKey: req.domainIdentityKey,
  });
}

export function buildTradeMarkReadPayload(req: {
  roomId: string;
  chatDomain: string;
  domainIdentityKey: string;
}): {
  roomId: string;
  chatDomain: typeof TRADE_DOMAIN;
  domainIdentityKey: string;
  clearBadgeTargets: ReadonlyArray<"trade">;
} {
  assertTradeReadAllowed(req);
  return {
    roomId: req.roomId.trim(),
    chatDomain: TRADE_DOMAIN,
    domainIdentityKey: req.domainIdentityKey.trim(),
    clearBadgeTargets: ["trade"],
  };
}

export function countTradeUnreadRooms(rows: ReadonlyArray<TradeListItem>): number {
  return rows.filter((r) => r.chatDomain === TRADE_DOMAIN && r.unreadCount > 0).length;
}

export type TradeBadgeContribution = Readonly<{
  domain: typeof TRADE_DOMAIN;
  unreadRoomCount: number;
  /** messenger nav 제외 */
  contributesTo: ReadonlyArray<"hub" | "nav_trade" | "app_icon">;
  navMessengerContribution: 0;
}>;

export function buildTradeBadgeContribution(rows: ReadonlyArray<TradeListItem>): TradeBadgeContribution {
  for (const r of rows) {
    if (r.chatDomain !== TRADE_DOMAIN) throw new Error("dibay_trade_badge_foreign_row");
  }
  return {
    domain: TRADE_DOMAIN,
    unreadRoomCount: countTradeUnreadRooms(rows),
    contributesTo: ["hub", "nav_trade", "app_icon"],
    navMessengerContribution: 0,
  };
}

export const tradeReadPort: MessengerReadPort = {
  domain: TRADE_DOMAIN,
  authority: "trade_domain",
};

export const tradeUnreadPort: MessengerUnreadPort = {
  domain: TRADE_DOMAIN,
  exclusiveOwnership: true,
};

export const tradeBadgePort: MessengerBadgePort = {
  domain: TRADE_DOMAIN,
  contributesTo: ["hub", "nav_trade", "app_icon"],
};
