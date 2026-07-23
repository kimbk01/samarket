/**
 * group Read / Unread / Badge — nav_messenger contribution 포함.
 * trade/store_order / nav_delivery / nav_trade 금지.
 */
import type {
  MessengerBadgePort,
  MessengerReadPort,
  MessengerUnreadPort,
} from "@/lib/messenger/contracts/ports";
import { assertGroupOwnedRoom } from "@/lib/messenger/group/identity";
import { GROUP_DOMAIN, type GroupListItem } from "@/lib/messenger/group/types";

export function assertGroupReadAllowed(req: {
  roomId: string;
  chatDomain: string;
  domainIdentityKey: string;
}): void {
  if (
    req.chatDomain === "general_direct" ||
    req.chatDomain === "trade" ||
    req.chatDomain === "store_order"
  ) {
    throw new Error(`dibay_group_read_rejects:${req.chatDomain}`);
  }
  assertGroupOwnedRoom({
    roomId: req.roomId,
    chatDomain: req.chatDomain as "group",
    domainIdentityKey: req.domainIdentityKey,
  });
}

export function buildGroupMarkReadPayload(req: {
  roomId: string;
  chatDomain: string;
  domainIdentityKey: string;
}): {
  roomId: string;
  chatDomain: typeof GROUP_DOMAIN;
  domainIdentityKey: string;
  clearBadgeTargets: ReadonlyArray<"group">;
} {
  assertGroupReadAllowed(req);
  return {
    roomId: req.roomId.trim(),
    chatDomain: GROUP_DOMAIN,
    domainIdentityKey: req.domainIdentityKey.trim(),
    clearBadgeTargets: ["group"],
  };
}

export function countGroupUnreadRooms(rows: ReadonlyArray<GroupListItem>): number {
  return rows.filter((r) => r.chatDomain === GROUP_DOMAIN && r.unreadCount > 0).length;
}

export function sumGroupUnread(rows: ReadonlyArray<GroupListItem>): number {
  let n = 0;
  for (const r of rows) {
    if (r.chatDomain !== GROUP_DOMAIN) throw new Error("dibay_group_unread_foreign_row");
    n += Math.max(0, Math.floor(r.unreadCount));
  }
  return n;
}

export type GroupBadgeContribution = Readonly<{
  domain: typeof GROUP_DOMAIN;
  unreadRoomCount: number;
  contributesTo: ReadonlyArray<"hub" | "nav_messenger" | "app_icon">;
  navMessengerContribution: number;
  navDeliveryContribution: 0;
  navTradeContribution: 0;
}>;

export function buildGroupBadgeContribution(rows: ReadonlyArray<GroupListItem>): GroupBadgeContribution {
  for (const r of rows) {
    if (r.chatDomain !== GROUP_DOMAIN) throw new Error("dibay_group_badge_foreign_row");
  }
  const unreadRoomCount = countGroupUnreadRooms(rows);
  return {
    domain: GROUP_DOMAIN,
    unreadRoomCount,
    contributesTo: ["hub", "nav_messenger", "app_icon"],
    navMessengerContribution: unreadRoomCount,
    navDeliveryContribution: 0,
    navTradeContribution: 0,
  };
}

export const groupReadPort: MessengerReadPort = {
  domain: GROUP_DOMAIN,
  authority: "community_messenger",
};

export const groupUnreadPort: MessengerUnreadPort = {
  domain: GROUP_DOMAIN,
  exclusiveOwnership: true,
};

export const groupBadgePort: MessengerBadgePort = {
  domain: GROUP_DOMAIN,
  contributesTo: ["hub", "nav_messenger", "app_icon"],
};
