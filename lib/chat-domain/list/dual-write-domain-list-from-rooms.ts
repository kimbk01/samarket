/**
 * QUARANTINED (Telegram list authority 2026-07-24).
 * CM hub rooms must NOT dual-write trade/store_order list paint truth.
 * Paint SSOT: Domain canary stores + domain-list-canary-realtime-patch.
 * Callers should be removed; this no-op remains only for dead-import safety during cutover.
 */

import type { ChatDomain } from "@/lib/chat-domain/four-domain-freeze";
import { logListAuthorityViolation } from "@/lib/chat-domain/list/domain-list-mutation-contract";
import type { DomainListItemDto } from "@/lib/chat-domain/list/domain-list-dto";
import type { CommunityMessengerRoomSummary } from "@/lib/community-messenger/types";

function isChatDomain(v: unknown): v is ChatDomain {
  return v === "general_direct" || v === "group" || v === "trade" || v === "store_order";
}

export function mapRoomSummaryToDomainListItem(
  room: CommunityMessengerRoomSummary,
): DomainListItemDto | null {
  const chatDomain = room.chatDomain;
  const domainIdentity = typeof room.domainIdentity === "string" ? room.domainIdentity.trim() : "";
  if (!isChatDomain(chatDomain) || !domainIdentity) return null;
  const roomId = typeof room.id === "string" ? room.id.trim() : "";
  if (!roomId) return null;
  return {
    roomId,
    chatDomain,
    domainIdentity,
    unreadCount: Math.max(0, Number(room.unreadCount ?? 0) || 0),
    lastMessageAt: typeof room.lastMessageAt === "string" ? room.lastMessageAt : null,
    title: typeof room.title === "string" ? room.title : "",
    lastMessagePreview: typeof room.lastMessage === "string" ? room.lastMessage : null,
  };
}

/**
 * @deprecated No-op — dual-write to Domain trade/SO list paint is forbidden.
 */
export function dualWriteDomainListProjectionsFromRooms(
  rooms: readonly CommunityMessengerRoomSummary[],
  _versionMs = Date.now(),
): { byDomain: Record<ChatDomain, number>; omitted: number } {
  if (rooms.length > 0) {
    logListAuthorityViolation("MULTI_WRITER_DETECTED", {
      writer: "dualWriteDomainListProjectionsFromRooms",
      roomCount: rooms.length,
    });
  }
  return {
    byDomain: {
      general_direct: 0,
      group: 0,
      trade: 0,
      store_order: 0,
    },
    omitted: rooms.length,
  };
}
