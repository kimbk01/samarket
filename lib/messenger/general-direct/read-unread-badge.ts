/**
 * general_direct ReadPort · UnreadPort · BadgePort adapters (Phase 2).
 * D1-1 원자성 OPEN — 신규 RPC 없음. CM mark_read 저수준 호출은 adapter 계약만.
 */
import type {
  MessengerBadgePort,
  MessengerReadPort,
  MessengerUnreadPort,
} from "@/lib/messenger/contracts/ports";
import { assertGeneralDirectOwnedRoom } from "@/lib/messenger/general-direct/identity";
import {
  GENERAL_DIRECT_DOMAIN,
  type GeneralDirectListItem,
} from "@/lib/messenger/general-direct/types";

export type GeneralDirectReadRequest = Readonly<{
  roomId: string;
  chatDomain: string;
  domainIdentityKey: string;
}>;

export function assertGeneralDirectReadAllowed(req: GeneralDirectReadRequest): void {
  if (req.chatDomain === "trade" || req.chatDomain === "store_order" || req.chatDomain === "group") {
    throw new Error(`dibay_general_direct_read_rejects:${req.chatDomain}`);
  }
  assertGeneralDirectOwnedRoom({
    roomId: req.roomId,
    chatDomain: req.chatDomain as "general_direct",
    domainIdentityKey: req.domainIdentityKey,
  });
}

/**
 * 저수준 CM read adapter 계약 — 실제 HTTP 는 cutover 시 wiring.
 * 여기서는 domain 검증 + payload shape 만.
 */
export type GeneralDirectMarkReadAdapterPayload = Readonly<{
  roomId: string;
  chatDomain: typeof GENERAL_DIRECT_DOMAIN;
  domainIdentityKey: string;
  /** trade/store_order badge target clear 금지 표시 */
  clearBadgeTargets: ReadonlyArray<"chat_room">;
}>;

export function buildGeneralDirectMarkReadPayload(req: GeneralDirectReadRequest): GeneralDirectMarkReadAdapterPayload {
  assertGeneralDirectReadAllowed(req);
  return {
    roomId: req.roomId.trim(),
    chatDomain: GENERAL_DIRECT_DOMAIN,
    domainIdentityKey: req.domainIdentityKey.trim(),
    clearBadgeTargets: ["chat_room"],
  };
}

export function sumGeneralDirectUnread(rows: ReadonlyArray<GeneralDirectListItem>): number {
  let n = 0;
  for (const r of rows) {
    if (r.chatDomain !== GENERAL_DIRECT_DOMAIN) {
      throw new Error("dibay_general_direct_unread_foreign_row");
    }
    n += Math.max(0, Math.floor(r.unreadCount));
  }
  return n;
}

/** unread room count (방 수) — 메시지 수와 혼용하지 않음 */
export function countGeneralDirectUnreadRooms(rows: ReadonlyArray<GeneralDirectListItem>): number {
  return rows.filter((r) => r.chatDomain === GENERAL_DIRECT_DOMAIN && r.unreadCount > 0).length;
}

export type GeneralDirectBadgeContribution = Readonly<{
  domain: typeof GENERAL_DIRECT_DOMAIN;
  unreadRoomCount: number;
  contributesTo: ReadonlyArray<"hub" | "nav_messenger" | "app_icon">;
}>;

export function buildGeneralDirectBadgeContribution(
  rows: ReadonlyArray<GeneralDirectListItem>
): GeneralDirectBadgeContribution {
  for (const r of rows) {
    if (r.chatDomain !== GENERAL_DIRECT_DOMAIN) {
      throw new Error("dibay_general_direct_badge_foreign_row");
    }
  }
  return {
    domain: GENERAL_DIRECT_DOMAIN,
    unreadRoomCount: countGeneralDirectUnreadRooms(rows),
    contributesTo: ["hub", "nav_messenger", "app_icon"],
  };
}

export const generalDirectReadPort: MessengerReadPort = {
  domain: GENERAL_DIRECT_DOMAIN,
  authority: "community_messenger",
};

export const generalDirectUnreadPort: MessengerUnreadPort = {
  domain: GENERAL_DIRECT_DOMAIN,
  exclusiveOwnership: true,
};

export const generalDirectBadgePort: MessengerBadgePort = {
  domain: GENERAL_DIRECT_DOMAIN,
  contributesTo: ["hub", "nav_messenger", "app_icon"],
};
