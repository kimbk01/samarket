import { conversationIdForRoom } from "@/lib/community-messenger/conversation-engine/identity";
import { mapRoomSummaryToConversation } from "@/lib/community-messenger/conversation-engine/mapper-from-room-summary";
import { getConversationStore } from "@/lib/community-messenger/conversation-engine/conversation-store";
import { sortConversations } from "@/lib/community-messenger/conversation-engine/sort";
import type { ConversationSummary } from "@/lib/community-messenger/conversation-engine/types";
import type { CommunityMessengerBootstrap, CommunityMessengerRoomSummary } from "@/lib/community-messenger/types";

function activityMs(iso: string): number {
  const ms = new Date(String(iso ?? "")).getTime();
  return Number.isFinite(ms) ? ms : 0;
}

/**
 * Structural reconcile: add missing rooms, remove departed hub rooms.
 * Existing tips kept unless bootstrap lastActivityAt is strictly newer.
 */
export function reconcileConversationStoreFromBootstrap(
  data: Pick<CommunityMessengerBootstrap, "chats" | "groups"> | null | undefined
): void {
  if (!data) return;
  const store = getConversationStore();
  const rooms: CommunityMessengerRoomSummary[] = [...(data.chats ?? []), ...(data.groups ?? [])];
  const byId = new Map(rooms.map((r) => [conversationIdForRoom(r.id), r]));
  const hubDomains = new Set(["general_direct", "group"]);

  if (!store.isHydrated()) {
    store.seedFromRoomSummaries(rooms);
    return;
  }

  const prev = store.getConversations();
  const next: ConversationSummary[] = [];
  const seen = new Set<string>();

  for (const conv of prev) {
    if (!hubDomains.has(conv.domain)) {
      next.push(conv);
      continue;
    }
    const room = byId.get(conv.conversationId);
    if (!room) continue; // removed from bootstrap hub
    seen.add(conv.conversationId);
    const mapped = mapRoomSummaryToConversation(room);
    const bootstrapNewer = activityMs(mapped.lastActivityAt) > activityMs(conv.lastActivityAt);
    next.push(bootstrapNewer ? { ...mapped, unreadCount: mapped.unreadCount } : {
      ...conv,
      unreadCount: mapped.unreadCount,
      isPinned: mapped.isPinned,
      isMuted: mapped.isMuted,
      isArchivedByViewer: mapped.isArchivedByViewer,
      isBlockedHiddenByViewer: mapped.isBlockedHiddenByViewer,
      title: mapped.title || conv.title,
      subtitle: mapped.subtitle || conv.subtitle,
      avatarUrl: mapped.avatarUrl ?? conv.avatarUrl,
    });
  }

  for (const [id, room] of byId) {
    if (seen.has(id)) continue;
    next.push(mapRoomSummaryToConversation(room));
  }

  store.seedConversations(sortConversations(next));
}

export function removeConversationFromStore(roomId: string, domainHint?: ConversationSummary["domain"]): void {
  const store = getConversationStore();
  const id = conversationIdForRoom(roomId);
  const existing = store.getConversations().find((c) => c.conversationId === id);
  if (!existing) return;
  store.applyEvent({
    type: "conversation_remove",
    eventId: `remove:${id}:${Date.now()}`,
    conversationId: id,
    roomId: existing.roomId,
    domain: domainHint ?? existing.domain,
  });
}
