"use client";

import { useEffect, useRef, type Dispatch, type MutableRefObject, type SetStateAction } from "react";
import { mergeRoomMessages } from "@/components/community-messenger/room/community-messenger-room-helpers";
import { messengerUserIdsEqual } from "@/lib/community-messenger/messenger-user-id";
import type { CommunityMessengerMessage, CommunityMessengerProfileLite, CommunityMessengerRoomSnapshot } from "@/lib/community-messenger/types";
import {
  communityMessengerBumpKnownRoomIds,
  communityMessengerBumpPayloadMatchesKnownRooms,
} from "@/lib/community-messenger/realtime/community-messenger-room-bump-channel";
import { parseCommunityMessengerBumpMessageSnapshot } from "@/lib/community-messenger/realtime/community-messenger-room-bump-message-snapshot";
import { getSupabaseClient } from "@/lib/supabase/client";
import { subscribeCommunityMessengerRoomBumpBroadcast } from "@/lib/community-messenger/realtime/room-bump-broadcast";
import { postCommunityMessengerBusEvent } from "@/lib/community-messenger/multi-tab-bus";

type RoomBumpListener = {
  onBump: (payload: Record<string, unknown>) => void;
};

type RoomBumpEntry = {
  listeners: Set<MutableRefObject<RoomBumpListener>>;
  stop: () => void;
};

const roomBumpEntries = new Map<string, RoomBumpEntry>();

function createRoomBumpEntry(key: string, roomIds: string[]): RoomBumpEntry {
  const sb = getSupabaseClient();
  const entry: RoomBumpEntry = {
    listeners: new Set(),
    stop: () => undefined,
  };
  if (!sb || roomIds.length === 0) return entry;

  const channels = roomIds.map((rid) =>
    subscribeCommunityMessengerRoomBumpBroadcast({
      sb,
      roomId: rid,
      onBump: (payload) => {
        for (const listener of entry.listeners) {
          listener.current.onBump(payload);
        }
      },
    })
  );

  entry.stop = () => {
    for (const ch of channels) {
      try {
        void sb.removeChannel(ch);
      } catch {
        /* ignore */
      }
    }
    roomBumpEntries.delete(key);
  };

  return entry;
}

/**
 * Broadcast v2 bump — postgres_changes 누락 시에도 방 단위로 증분 동기화.
 * `useMessengerRoomClientPhase1` 의 bump `useEffect` 본문·deps 그대로.
 */
export function useMessengerRoomBumpBroadcastSubscription({
  roomId,
  streamRoomId,
  roomReadyForRealtime,
  snapshot,
  initialServerSnapshot,
  snapshotRef,
  roomMembersDisplayRef,
  remoteBumpCatchUpRafRef,
  lastRemoteBumpDedupeRef,
  peerTailMarkReadHintRef,
  setRoomMessages,
  catchUpAfterRemoteBump,
}: {
  roomId: string;
  streamRoomId: string;
  roomReadyForRealtime: boolean;
  snapshot: CommunityMessengerRoomSnapshot | null;
  initialServerSnapshot: CommunityMessengerRoomSnapshot | null;
  snapshotRef: MutableRefObject<CommunityMessengerRoomSnapshot | null>;
  roomMembersDisplayRef: MutableRefObject<CommunityMessengerProfileLite[]>;
  remoteBumpCatchUpRafRef: MutableRefObject<number | null>;
  lastRemoteBumpDedupeRef: MutableRefObject<string>;
  /** Broadcast snapshot fallback 도 postgres_changes INSERT 와 동일한 읽음 힌트를 제공한다. */
  peerTailMarkReadHintRef?: MutableRefObject<string | null>;
  setRoomMessages: Dispatch<SetStateAction<Array<CommunityMessengerMessage & { pending?: boolean }>>>;
  catchUpAfterRemoteBump: (
    hintMessageId?: string | null,
    opts?: { alreadyMergedSnapshot?: boolean }
  ) => Promise<void>;
}): void {
  const listenerRef = useRef<RoomBumpListener>({ onBump: () => undefined });
  /**
   * `postgres_changes` 가 publication/RLS/세션 타이밍 문제로 누락돼도,
   * 방 단위 Broadcast bump 신호로 즉시 증분 동기화한다.
   */
  useEffect(() => {
    const viewer =
      snapshot?.viewerUserId?.trim() ?? initialServerSnapshot?.viewerUserId?.trim() ?? "";
    if (!viewer || !roomReadyForRealtime) return;

    const route = String(roomId ?? "").trim();
    const stream = String(streamRoomId ?? "").trim();
    const snapRoom = String(snapshot?.room?.id ?? "").trim();
    const bumpSubscribeIds = communityMessengerBumpKnownRoomIds({
      routeRoomId: route,
      streamRoomId: stream || route,
      snapshotRoomId: snapRoom || null,
    });
    if (bumpSubscribeIds.size === 0) return;

    const sb = getSupabaseClient();
    if (!sb) return;
    let lastCatchUpAt = 0;
    let catchUpTimer: ReturnType<typeof setTimeout> | null = null;
    let pendingHint = "";
    let pendingAlreadyMergedSnapshot = false;
    const scheduleCatchUp = (hintMessageId: string, opts?: { alreadyMergedSnapshot?: boolean }) => {
      const now = Date.now();
      const elapsed = now - lastCatchUpAt;
      const minGap = 180;
      if (opts?.alreadyMergedSnapshot) pendingAlreadyMergedSnapshot = true;
      if (elapsed < minGap) {
        if (hintMessageId) pendingHint = hintMessageId;
        if (catchUpTimer != null) return;
        catchUpTimer = setTimeout(() => {
          catchUpTimer = null;
          lastCatchUpAt = Date.now();
          const h = pendingHint;
          const alreadyMergedSnapshot = pendingAlreadyMergedSnapshot;
          pendingHint = "";
          pendingAlreadyMergedSnapshot = false;
          void catchUpAfterRemoteBump(h || undefined, { alreadyMergedSnapshot });
        }, minGap - elapsed);
        return;
      }
      lastCatchUpAt = now;
      const h = hintMessageId || pendingHint;
      const alreadyMergedSnapshot = Boolean(opts?.alreadyMergedSnapshot || pendingAlreadyMergedSnapshot);
      pendingHint = "";
      pendingAlreadyMergedSnapshot = false;
      void catchUpAfterRemoteBump(h || undefined, { alreadyMergedSnapshot });
    };
    const onBump = (payload: Record<string, unknown>) => {
      const known = communityMessengerBumpKnownRoomIds({
        routeRoomId: String(roomId ?? "").trim(),
        streamRoomId: String(streamRoomId ?? "").trim(),
        snapshotRoomId: snapshotRef.current?.room?.id ?? null,
      });
      if (!communityMessengerBumpPayloadMatchesKnownRooms(payload, known)) return;

      const from = typeof payload.fromUserId === "string" ? payload.fromUserId.trim() : "";
      const rawMessage = payload.message;
      const messageMetadata =
        rawMessage && typeof rawMessage === "object" && rawMessage !== null
          ? (rawMessage as { metadata?: unknown }).metadata
          : null;
      const isStoreOrderSystemBump =
        messageMetadata &&
        typeof messageMetadata === "object" &&
        (messageMetadata as { domain?: unknown }).domain === "store_order";
      // 내 일반 채팅 bump는 optimistic/confirm 처리되지만, 주문 system line은 catch-up까지 받아야 한다.
      if (from && from === viewer && !isStoreOrderSystemBump) return;

      const hint =
        typeof payload.messageId === "string"
          ? payload.messageId.trim()
          : typeof (payload as { message_id?: unknown }).message_id === "string"
            ? String((payload as { message_id: string }).message_id).trim()
            : "";
      const at = typeof payload.at === "string" ? payload.at.trim() : "";
      const dedupeKey = `${from}|${hint || "no-mid"}|${at}`;
      if (lastRemoteBumpDedupeRef.current === dedupeKey) return;
      lastRemoteBumpDedupeRef.current = dedupeKey;

      if (remoteBumpCatchUpRafRef.current != null) {
        cancelAnimationFrame(remoteBumpCatchUpRafRef.current);
      }
      remoteBumpCatchUpRafRef.current = requestAnimationFrame(() => {
        remoteBumpCatchUpRafRef.current = null;
        const pre = parseCommunityMessengerBumpMessageSnapshot(payload, viewer);
        let mergedSnapshot = false;
        let catchUpHint = hint;
        if (pre) {
          const member = roomMembersDisplayRef.current.find((m) => messengerUserIdsEqual(m.id, pre.senderId ?? ""));
          const enriched =
            member?.label && member.label.trim().length > 0 ? { ...pre, senderLabel: member.label } : pre;
          setRoomMessages((prev) => mergeRoomMessages(prev, [enriched]));
          if (!enriched.isMine) {
            if (
              peerTailMarkReadHintRef &&
              typeof document !== "undefined" &&
              document.visibilityState === "visible"
            ) {
              const mid = String(enriched.id ?? "").trim();
              if (mid) peerTailMarkReadHintRef.current = mid;
            }
            postCommunityMessengerBusEvent({
              type: "cm.room.incoming_message",
              roomId: String(enriched.roomId ?? streamRoomId).trim(),
              viewerUserId: viewer,
              messageRow: {
                id: enriched.id,
                room_id: enriched.roomId,
                sender_id: enriched.senderId,
                message_type: enriched.messageType,
                content: enriched.content,
                metadata: enriched.metadata ?? {},
                created_at: enriched.createdAt,
              },
              at: Date.now(),
            });
          }
          catchUpHint = catchUpHint || String(pre.id ?? "").trim();
          mergedSnapshot = true;
        }
        scheduleCatchUp(catchUpHint, { alreadyMergedSnapshot: mergedSnapshot });
      });
    };
    listenerRef.current.onBump = onBump;
    const registryKey = `${viewer}:${[...bumpSubscribeIds].sort().join("\0")}`;
    let entry = roomBumpEntries.get(registryKey);
    if (!entry) {
      entry = createRoomBumpEntry(registryKey, [...bumpSubscribeIds]);
      roomBumpEntries.set(registryKey, entry);
    }
    entry.listeners.add(listenerRef);

    return () => {
      lastRemoteBumpDedupeRef.current = "";
      if (remoteBumpCatchUpRafRef.current != null) {
        cancelAnimationFrame(remoteBumpCatchUpRafRef.current);
        remoteBumpCatchUpRafRef.current = null;
      }
      if (catchUpTimer != null) {
        clearTimeout(catchUpTimer);
        catchUpTimer = null;
      }
      const current = roomBumpEntries.get(registryKey);
      if (!current) return;
      current.listeners.delete(listenerRef);
      if (current.listeners.size === 0) current.stop();
    };
  }, [
    catchUpAfterRemoteBump,
    initialServerSnapshot?.viewerUserId,
    peerTailMarkReadHintRef,
    roomId,
    roomReadyForRealtime,
    snapshot?.room?.id,
    snapshot?.viewerUserId,
    streamRoomId,
  ]);
}
