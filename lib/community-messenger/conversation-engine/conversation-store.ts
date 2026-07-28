import { applyConversationEvent } from "@/lib/community-messenger/conversation-engine/apply-conversation-event";
import { mapRoomSummariesToConversations } from "@/lib/community-messenger/conversation-engine/mapper-from-room-summary";
import { sortConversations } from "@/lib/community-messenger/conversation-engine/sort";
import type {
  ConversationDomain,
  ConversationEngineMetrics,
  ConversationEvent,
  ConversationSummary,
} from "@/lib/community-messenger/conversation-engine/types";
import type { CommunityMessengerRoomSummary } from "@/lib/community-messenger/types";

type Listener = () => void;

export type ConversationStoreSnapshot = Readonly<{
  conversations: readonly ConversationSummary[];
  hydrated: boolean;
  metrics: ConversationEngineMetrics;
}>;

const EMPTY_METRICS: ConversationEngineMetrics = {
  eventsApplied: 0,
  eventsDropped: 0,
  conversationsMutated: 0,
  arrayReplaces: 0,
};

/**
 * In-memory conversation list store. Sole mutation path: seedConversations / applyEvent / clear.
 */
export class ConversationStore {
  private conversations: readonly ConversationSummary[] = [];
  private hydrated = false;
  private seenEventIds = new Set<string>();
  private metrics: ConversationEngineMetrics = { ...EMPTY_METRICS };
  private listeners = new Set<Listener>();

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private emit() {
    for (const l of this.listeners) l();
  }

  getSnapshot(): ConversationStoreSnapshot {
    return {
      conversations: this.conversations,
      hydrated: this.hydrated,
      metrics: this.metrics,
    };
  }

  getConversations(): readonly ConversationSummary[] {
    return this.conversations;
  }

  isHydrated(): boolean {
    return this.hydrated;
  }

  getMetrics(): ConversationEngineMetrics {
    return this.metrics;
  }

  seedConversations(rows: readonly ConversationSummary[]): void {
    this.conversations = sortConversations([...rows]);
    this.hydrated = true;
    this.seenEventIds.clear();
    this.metrics = {
      ...this.metrics,
      arrayReplaces: this.metrics.arrayReplaces + 1,
    };
    this.emit();
  }

  seedFromRoomSummaries(rooms: readonly CommunityMessengerRoomSummary[]): void {
    this.seedConversations(mapRoomSummariesToConversations(rooms));
  }

  applyEvent(event: ConversationEvent): boolean {
    const result = applyConversationEvent(this.conversations, event, {
      seenEventIds: this.seenEventIds,
      log: (msg, extra) => {
        if (typeof console !== "undefined" && process.env.NODE_ENV !== "production") {
          console.debug(`[conversation-store] ${msg}`, extra);
        }
      },
    });
    this.seenEventIds.add(event.eventId);
    if (!result.applied) {
      this.metrics = {
        ...this.metrics,
        eventsDropped: this.metrics.eventsDropped + 1,
      };
      return false;
    }
    const sorted = sortConversations(result.next);
    const prevIds = this.conversations.map((c) => c.conversationId).join("|");
    const nextIds = sorted.map((c) => c.conversationId).join("|");
    const orderChanged = prevIds !== nextIds;
    this.conversations = sorted;
    this.metrics = {
      eventsApplied: this.metrics.eventsApplied + 1,
      eventsDropped: this.metrics.eventsDropped,
      conversationsMutated: this.metrics.conversationsMutated + 1,
      arrayReplaces: this.metrics.arrayReplaces + (orderChanged || !result.sameArrayRef ? 1 : 0),
    };
    this.emit();
    return true;
  }

  selectByDomain(domain: ConversationDomain): ConversationSummary[] {
    return this.conversations.filter((c) => c.domain === domain);
  }

  /** Hub scroll list: general_direct + group only (commerce never enters GD list). */
  selectHubConversations(): ConversationSummary[] {
    return this.conversations.filter((c) => c.domain === "general_direct" || c.domain === "group");
  }

  selectTrade(): ConversationSummary[] {
    return this.selectByDomain("trade");
  }

  selectStoreOrder(): ConversationSummary[] {
    return this.selectByDomain("store_order");
  }

  clear(): void {
    this.conversations = [];
    this.hydrated = false;
    this.seenEventIds.clear();
    this.metrics = { ...EMPTY_METRICS };
    this.emit();
  }
}

let singleton: ConversationStore | null = null;

export function getConversationStore(): ConversationStore {
  if (!singleton) singleton = new ConversationStore();
  return singleton;
}

/** Test helper — reset process singleton. */
export function __resetConversationStoreForTests(): void {
  singleton = null;
}
