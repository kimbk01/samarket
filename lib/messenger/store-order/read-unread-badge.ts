/**
 * StoreOrder Read / Unread / BadgePort — nav_messenger 기여 금지.
 * 다른 Domain BadgePort 참조 금지.
 */
import type {
  MessengerBadgePort,
  MessengerReadPort,
  MessengerUnreadPort,
} from "@/lib/messenger/contracts/ports";
import { assertStoreOrderOwnedRoom } from "@/lib/messenger/store-order/identity";
import {
  assertStoreOrderBadgeContributionTargets,
  STORE_ORDER_BADGE_CONTRIBUTES_TO,
  STORE_ORDER_DOMAIN,
  STORE_ORDER_NAV_MESSENGER_CONTRIBUTION,
} from "@/lib/messenger/store-order/design-lock";
import type { StoreOrderListItem } from "@/lib/messenger/store-order/types";

export function assertStoreOrderReadAllowed(req: {
  roomId: string;
  chatDomain: string;
  domainIdentityKey: string;
}): void {
  if (req.chatDomain === "general_direct" || req.chatDomain === "group" || req.chatDomain === "trade") {
    throw new Error(`dibay_store_order_read_rejects:${req.chatDomain}`);
  }
  assertStoreOrderOwnedRoom({
    roomId: req.roomId,
    chatDomain: req.chatDomain as "store_order",
    domainIdentityKey: req.domainIdentityKey,
  });
}

export function buildStoreOrderMarkReadPayload(req: {
  roomId: string;
  chatDomain: string;
  domainIdentityKey: string;
}): {
  roomId: string;
  chatDomain: typeof STORE_ORDER_DOMAIN;
  domainIdentityKey: string;
  clearBadgeTargets: ReadonlyArray<"store_order">;
} {
  assertStoreOrderReadAllowed(req);
  return {
    roomId: req.roomId.trim(),
    chatDomain: STORE_ORDER_DOMAIN,
    domainIdentityKey: req.domainIdentityKey.trim(),
    clearBadgeTargets: ["store_order"],
  };
}

export function countStoreOrderUnreadRooms(rows: ReadonlyArray<StoreOrderListItem>): number {
  return rows.filter((r) => r.chatDomain === STORE_ORDER_DOMAIN && r.unreadCount > 0).length;
}

export type StoreOrderBadgeContribution = Readonly<{
  domain: typeof STORE_ORDER_DOMAIN;
  unreadRoomCount: number;
  contributesTo: typeof STORE_ORDER_BADGE_CONTRIBUTES_TO;
  navMessengerContribution: typeof STORE_ORDER_NAV_MESSENGER_CONTRIBUTION;
}>;

export function buildStoreOrderBadgeContribution(
  rows: ReadonlyArray<StoreOrderListItem>
): StoreOrderBadgeContribution {
  for (const r of rows) {
    if (r.chatDomain !== STORE_ORDER_DOMAIN) throw new Error("dibay_store_order_badge_foreign_row");
  }
  const contributesTo = STORE_ORDER_BADGE_CONTRIBUTES_TO;
  assertStoreOrderBadgeContributionTargets([...contributesTo]);
  return {
    domain: STORE_ORDER_DOMAIN,
    unreadRoomCount: countStoreOrderUnreadRooms(rows),
    contributesTo,
    navMessengerContribution: STORE_ORDER_NAV_MESSENGER_CONTRIBUTION,
  };
}

export const storeOrderReadPort: MessengerReadPort = {
  domain: STORE_ORDER_DOMAIN,
  authority: "order_domain",
};

export const storeOrderUnreadPort: MessengerUnreadPort = {
  domain: STORE_ORDER_DOMAIN,
  exclusiveOwnership: true,
};

/** StoreOrderBadgePort — trade/general badge port 미참조 */
export const storeOrderBadgePort: MessengerBadgePort = {
  domain: STORE_ORDER_DOMAIN,
  contributesTo: ["hub", "nav_delivery", "app_icon"],
};
