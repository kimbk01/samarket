/**
 * Dual-write CM room summaries → Domain list projection (slice-1).
 * Paint still uses applyHomeListPatch; this keeps Domain writers current for refresh/SSOT readers.
 * Fail-closed: rooms without chatDomain+domainIdentity are omitted.
 */

import type { ChatDomain } from "@/lib/chat-domain/four-domain-freeze";
import type { DomainListItemDto } from "@/lib/chat-domain/list/domain-list-dto";
import { applyDomainListProjection } from "@/lib/chat-domain/list/domain-list-writers";
import type { CommunityMessengerRoomSummary } from "@/lib/community-messenger/types";

const DOMAINS: ChatDomain[] = ["general_direct", "group", "trade", "store_order"];

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
 * Partition room list by Domain and apply each Domain writer.
 * Call after home bootstrap / home-sync settles (dual-write window).
 */
export function dualWriteDomainListProjectionsFromRooms(
  rooms: readonly CommunityMessengerRoomSummary[],
  versionMs = Date.now(),
): { byDomain: Record<ChatDomain, number>; omitted: number } {
  const buckets: Record<ChatDomain, DomainListItemDto[]> = {
    general_direct: [],
    group: [],
    trade: [],
    store_order: [],
  };
  let omitted = 0;
  for (const room of rooms) {
    const item = mapRoomSummaryToDomainListItem(room);
    if (!item) {
      omitted += 1;
      continue;
    }
    buckets[item.chatDomain].push(item);
  }
  const byDomain = {} as Record<ChatDomain, number>;
  for (const d of DOMAINS) {
    applyDomainListProjection({ chatDomain: d, items: buckets[d], versionMs });
    byDomain[d] = buckets[d].length;
  }
  return { byDomain, omitted };
}
