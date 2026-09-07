/**
 * Product chat notification → room open (CUT 1/3).
 * Always resolves to community_messenger room surface — never legacy `/group-chat`.
 */
import { isChatDomain, type ChatDomain } from "@/lib/chat-domain/chat-domain";
import { buildDomainRoomRoute } from "@/lib/chat-domain/push/domain-room-route";

export function buildCanonicalNotificationRoomHref(input: {
  roomId: string;
  chatDomain?: string | null;
}): string | null {
  const roomId = input.roomId.trim();
  if (!roomId) return null;
  const domain: ChatDomain | null = isChatDomain(input.chatDomain) ? input.chatDomain : null;
  if (domain) {
    return buildDomainRoomRoute({ chatDomain: domain, roomId });
  }
  // Domain unknown: still CM room by id (product GROUP/TRADE/ORDER/GENERAL share this surface).
  return buildDomainRoomRoute({ chatDomain: "general_direct", roomId });
}
