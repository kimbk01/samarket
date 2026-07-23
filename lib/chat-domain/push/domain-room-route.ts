/**
 * Phase G — Domain room deep-link routes (contract).
 * DO NOT: change FCM dispatch / Native Call / sound SSOT registry.
 * docs/community-messenger/2026-07-23-four-domain-phase-g.md
 */

import type { ChatDomain, StoreOrderRole } from "@/lib/chat-domain/four-domain-freeze";

export type DomainRoomRouteInput = {
  chatDomain: ChatDomain;
  roomId: string;
  /** store_order list surfaces (optional). */
  storeOrderRole?: StoreOrderRole | null;
};

/**
 * Canonical in-app path for a Domain room.
 * Trade/SO keep CM room URL (same ledger entry); list hubs stay separate surfaces.
 */
export function buildDomainRoomRoute(input: DomainRoomRouteInput): string | null {
  const roomId = input.roomId.trim();
  if (!roomId) return null;
  const encoded = encodeURIComponent(roomId);
  switch (input.chatDomain) {
    case "general_direct":
    case "group":
    case "trade":
    case "store_order":
      return `/community-messenger/rooms/${encoded}`;
    default:
      return null;
  }
}

/** List hub paths — not room deep links. */
export function buildDomainListHubRoute(chatDomain: ChatDomain): string {
  switch (chatDomain) {
    case "general_direct":
      return "/community-messenger";
    case "group":
      return "/community-messenger?tab=groups";
    case "trade":
      return "/community-messenger/trade-chats";
    case "store_order":
      return "/community-messenger/delivery-chats";
    default:
      return "/community-messenger";
  }
}
