"use client";

import { useEffect, useMemo, useRef, useSyncExternalStore } from "react";
import {
  CONVERSATION_ENGINE_ENABLED,
  CONVERSATION_ENGINE_PRODUCT_PAINT,
} from "@/lib/community-messenger/conversation-engine/flags";
import { getConversationStore } from "@/lib/community-messenger/conversation-engine/conversation-store";
import { partitionConversationsToHubLists } from "@/lib/community-messenger/conversation-engine/mapper-to-room-summary";
import { logConversationShadowCompare } from "@/lib/community-messenger/conversation-engine/shadow-compare";
import { useConversationEngineHomeLifecycle } from "@/lib/community-messenger/conversation-engine/use-conversation-engine-home-lifecycle";
import type { CommunityMessengerBootstrap } from "@/lib/community-messenger/types";

function subscribeStore(onStoreChange: () => void): () => void {
  return getConversationStore().subscribe(onStoreChange);
}

function getStoreSnapshot() {
  return getConversationStore().getSnapshot();
}

/**
 * Overlay hub chats/groups from ConversationStore when product paint is on.
 * Also runs shadow compare (compare does not drive paint).
 */
export function useConversationEngineHomePaint(args: {
  legacyData: CommunityMessengerBootstrap | null;
  listAwaitingCritical: boolean;
  roomIds: string[];
}): CommunityMessengerBootstrap | null {
  const { legacyData, listAwaitingCritical, roomIds } = args;
  const snapshot = useSyncExternalStore(subscribeStore, getStoreSnapshot, getStoreSnapshot);

  useConversationEngineHomeLifecycle({
    enabled: CONVERSATION_ENGINE_ENABLED,
    bootstrap: legacyData,
    roomIds,
    listAwaitingCritical,
  });

  const lastShadowAtRef = useRef(0);

  useEffect(() => {
    if (!CONVERSATION_ENGINE_ENABLED || !legacyData || listAwaitingCritical) return;
    const now = Date.now();
    if (now - lastShadowAtRef.current < 2_000) return;
    lastShadowAtRef.current = now;
    logConversationShadowCompare(legacyData);
  }, [legacyData, listAwaitingCritical, snapshot.metrics.eventsApplied, snapshot.conversations]);

  return useMemo(() => {
    if (!legacyData) return null;
    if (!CONVERSATION_ENGINE_PRODUCT_PAINT || !snapshot.hydrated) {
      return legacyData;
    }
    const { chats, groups } = partitionConversationsToHubLists(
      snapshot.conversations,
      legacyData.chats ?? [],
      legacyData.groups ?? []
    );
    return { ...legacyData, chats, groups };
  }, [legacyData, snapshot]);
}
