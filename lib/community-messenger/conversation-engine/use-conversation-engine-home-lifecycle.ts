/**
 * Client bridge: seed/reconcile + cm_conversation_upsert broadcast → ConversationStore.
 * DO NOT import quarantined legacy list writers.
 */
"use client";

import { useEffect, useRef } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseClient } from "@/lib/supabase/client";
import {
  CM_CONVERSATION_UPSERT_BROADCAST_EVENT,
  communityMessengerConversationUpsertChannelName,
  type ConversationUpsertBroadcastPayload,
} from "@/lib/community-messenger/conversation-engine/conversation-upsert-channel";
import {
  conversationEventFromUpsertBroadcast,
  conversationReadFromParticipant,
  conversationUpsertFromMessageRow,
  conversationUpsertFromRoomTip,
} from "@/lib/community-messenger/conversation-engine/event-from-realtime";
import { getConversationStore } from "@/lib/community-messenger/conversation-engine/conversation-store";
import { reconcileConversationStoreFromBootstrap } from "@/lib/community-messenger/conversation-engine/reconcile-from-bootstrap";
import type { CommunityMessengerBootstrap } from "@/lib/community-messenger/types";
import { subscribeWithRetry } from "@/lib/community-messenger/realtime/subscribe-with-retry";

export function applyConversationEngineMessageInsert(row: Record<string, unknown>): void {
  const event = conversationUpsertFromMessageRow(row);
  if (event) getConversationStore().applyEvent(event);
}

export function applyConversationEngineMessageUpdate(row: Record<string, unknown>): void {
  applyConversationEngineMessageInsert(row);
}

export function applyConversationEngineRoomTip(
  roomId: string,
  tip: { lastMessage: string; lastMessageType?: string; lastMessageAt: string }
): void {
  const event = conversationUpsertFromRoomTip(roomId, tip);
  if (event) getConversationStore().applyEvent(event);
}

export function applyConversationEngineUnread(roomId: string, unreadCount: number): void {
  const event = conversationReadFromParticipant(roomId, unreadCount);
  if (event) getConversationStore().applyEvent(event);
}

/**
 * Seed/reconcile + subscribe conversation upsert broadcasts for visible rooms.
 */
export function useConversationEngineHomeLifecycle(args: {
  enabled: boolean;
  bootstrap: CommunityMessengerBootstrap | null;
  roomIds: string[];
  listAwaitingCritical: boolean;
}): void {
  const roomSetKeyRef = useRef("");
  const { enabled, bootstrap, roomIds, listAwaitingCritical } = args;

  useEffect(() => {
    if (!enabled || listAwaitingCritical || !bootstrap) return;
    const roomSetKey = [...(bootstrap.chats ?? []), ...(bootstrap.groups ?? [])]
      .map((r) => String(r.id).toLowerCase())
      .sort()
      .join(",");
    if (roomSetKey === roomSetKeyRef.current && getConversationStore().isHydrated()) {
      return;
    }
    roomSetKeyRef.current = roomSetKey;
    reconcileConversationStoreFromBootstrap(bootstrap);
  }, [enabled, bootstrap, listAwaitingCritical]);

  useEffect(() => {
    if (!enabled) return;
    const sb: SupabaseClient | null = getSupabaseClient();
    if (!sb) return;
    let cancelled = false;
    const channels: Array<{ stop: () => void }> = [];
    const unique = [...new Set(roomIds.map((id) => String(id ?? "").trim().toLowerCase()).filter(Boolean))];
    for (const roomId of unique.slice(0, 90)) {
      const handle = subscribeWithRetry({
        sb,
        name: communityMessengerConversationUpsertChannelName(roomId),
        scope: "cm-conversation-upsert",
        isCancelled: () => cancelled,
        build: (ch) =>
          ch.on("broadcast", { event: CM_CONVERSATION_UPSERT_BROADCAST_EVENT }, (payload) => {
            const raw = (payload as { payload?: unknown })?.payload ?? payload;
            if (!raw || typeof raw !== "object") return;
            const event = conversationEventFromUpsertBroadcast(raw as ConversationUpsertBroadcastPayload);
            if (event) getConversationStore().applyEvent(event);
          }),
      });
      channels.push(handle);
    }
    return () => {
      cancelled = true;
      for (const c of channels) c.stop();
    };
  }, [enabled, roomIds.join("\0")]);
}
