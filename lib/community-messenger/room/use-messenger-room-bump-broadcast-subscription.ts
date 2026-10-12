"use client";

import { useEffect, useRef, type Dispatch, type MutableRefObject, type SetStateAction } from "react";
import { isUuidLikeString } from "@/lib/shared/uuid-string";
import { mergeRoomMessages } from "@/components/community-messenger/room/community-messenger-room-helpers";
import { messengerUserIdsEqual } from "@/lib/community-messenger/messenger-user-id";
import type { CommunityMessengerMessage, CommunityMessengerProfileLite, CommunityMessengerRoomSnapshot } from "@/lib/community-messenger/types";
import {
  communityMessengerBumpKnownRoomIds,
  communityMessengerBumpPayloadMatchesKnownRooms,
} from "@/lib/community-messenger/realtime/community-messenger-room-bump-channel";
import { parseCommunityMessengerBumpMessageSnapshot } from "@/lib/community-messenger/realtime/community-messenger-room-bump-message-snapshot";
import { resolveRoomBumpDedupeKey } from "@/lib/chat-domain/realtime/domain-realtime-envelope";
import { getSupabaseClient } from "@/lib/supabase/client";
import { subscribeCommunityMessengerRoomBumpBroadcast } from "@/lib/community-messenger/realtime/room-bump-broadcast";
import { applyIncomingMessageEvent } from "@/lib/community-messenger/stores/messenger-realtime-store";

type RoomBumpListener = {
  onBump: (payload: Record<string, unknown>) => void;
};

type RoomBumpEntry = {
  listeners: Set<MutableRefObject<RoomBumpListener>>;
  stop: () => void;
};

const roomBumpEntries = new Map<string, RoomBumpEntry>();

/** rAF 미발화(비합성 WebView) 시 bump 반영 상한 — paint 와 데이터 반영 분리 */
export const ROOM_BUMP_FRAME_FALLBACK_MS = 160;

function createRoomBumpEntry(key: string, roomIds: string[]): RoomBumpEntry {
  const sb = getSupabaseClient();
  const entry: RoomBumpEntry = {
    listeners: new Set(),
    stop: () => undefined,
  };
  /**
   * 비공개 토픽 권한(`realtime.messages` SELECT)은 `community_messenger_rooms.id`(uuid) 토픽에만 부여된다.
   * 레거시 라우트 id(비 uuid) 토픽은 항상 거부되어 rejoin 백오프만 반복하므로 구독하지 않는다
   * (서버는 canonical uuid 토픽으로도 항상 발행).
   */
  const authorizedRoomIds = roomIds.filter((rid) => isUuidLikeString(String(rid ?? "").trim()));
  if (!sb || authorizedRoomIds.length === 0) return entry;

  const channels = authorizedRoomIds.map((rid) =>
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
    let bumpFrameFallbackTimer: ReturnType<typeof setTimeout> | null = null;
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

      const listAction = typeof payload.listAction === "string" ? payload.listAction.trim() : "";
      const reason = typeof payload.reason === "string" ? payload.reason.trim() : "";
      if (listAction === "remove" || reason === "group_deleted") {
        const rid =
          (typeof payload.canonicalRoomId === "string" && payload.canonicalRoomId.trim()) ||
          (typeof payload.roomId === "string" && payload.roomId.trim()) ||
          String(streamRoomId ?? roomId ?? "").trim();
        const eventId =
          (typeof payload.eventIdentity === "string" && payload.eventIdentity.trim()) ||
          (typeof payload.messageId === "string" && payload.messageId.trim()) ||
          `group_deleted:${rid}`;
        void import("@/lib/community-messenger/home/group-delete-home-list-eviction").then((mod) => {
          mod.evictDeletedGroupRoomFromHomeLists({ roomId: rid, eventId });
        });
        return;
      }

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
      const rawSenderId =
        rawMessage && typeof rawMessage === "object" && rawMessage !== null
          ? typeof (rawMessage as { senderId?: unknown }).senderId === "string"
            ? String((rawMessage as { senderId: string }).senderId).trim()
            : ""
          : "";
      /**
       * D1: call_stub 은 서버 projection(SESSION → STUB) 이 유일 작성자 — 작성자 기기에도 optimistic/ACK 사본이 없다.
       * 거절·취소한 본인(stub sender) 기기가 bump 를 버리면 postgres_changes 단일 경로에만 의존하게 된다.
       */
      const rawMessageType =
        rawMessage && typeof rawMessage === "object" && rawMessage !== null
          ? (rawMessage as { messageType?: unknown }).messageType
          : null;
      const isServerProjectedCallStubBump = rawMessageType === "call_stub";
      const hint =
        typeof payload.messageId === "string"
          ? payload.messageId.trim()
          : typeof (payload as { message_id?: unknown }).message_id === "string"
            ? String((payload as { message_id: string }).message_id).trim()
            : "";
      /**
       * Own authored INSERT bumps: optimistic/ACK already applied — skip.
       * Peer-mutated same-id UPDATE (fromUserId !== message.senderId), e.g. gift accept
       * projection by recipient on sender's message: must NOT skip — HTTP reconcile SSOT.
       */
      if (
        from &&
        from === viewer &&
        !isStoreOrderSystemBump &&
        !isServerProjectedCallStubBump &&
        (!rawSenderId || rawSenderId === from)
      ) {
        return;
      }

      const dedupeKey = resolveRoomBumpDedupeKey(payload);
      if (lastRemoteBumpDedupeRef.current === dedupeKey) return;
      lastRemoteBumpDedupeRef.current = dedupeKey;

      if (remoteBumpCatchUpRafRef.current != null) {
        cancelAnimationFrame(remoteBumpCatchUpRafRef.current);
        remoteBumpCatchUpRafRef.current = null;
      }
      if (bumpFrameFallbackTimer != null) {
        clearTimeout(bumpFrameFallbackTimer);
        bumpFrameFallbackTimer = null;
      }
      let applied = false;
      const applyBump = () => {
        if (applied) return;
        applied = true;
        if (remoteBumpCatchUpRafRef.current != null) {
          cancelAnimationFrame(remoteBumpCatchUpRafRef.current);
          remoteBumpCatchUpRafRef.current = null;
        }
        if (bumpFrameFallbackTimer != null) {
          clearTimeout(bumpFrameFallbackTimer);
          bumpFrameFallbackTimer = null;
        }
        /**
         * Snapshot acceleration only when parse validates (message.senderId === fromUserId).
         * Peer-mutated rows fail parse by design — canonical GET reconcile is authority.
         */
        const pre = parseCommunityMessengerBumpMessageSnapshot(payload, viewer);
        let mergedSnapshot = false;
        let catchUpHint = hint;
        if (pre) {
          const member = roomMembersDisplayRef.current.find((m) => messengerUserIdsEqual(m.id, pre.senderId ?? ""));
          const enriched =
            member?.label && member.label.trim().length > 0 ? { ...pre, senderLabel: member.label } : pre;
          setRoomMessages((prev) => mergeRoomMessages(prev, [enriched]));
          const tipRoomId = String(enriched.roomId || streamRoomId || roomId).trim();
          if (tipRoomId) {
            applyIncomingMessageEvent({
              viewerUserId: viewer,
              roomId: tipRoomId,
              roomSummary: snapshotRef.current?.room ?? undefined,
              message: enriched,
              messageRow: {
                id: enriched.id,
                room_id: tipRoomId,
                sender_id: enriched.senderId,
                message_type: enriched.messageType,
                content: enriched.content,
                metadata: enriched.metadata ?? null,
                created_at: enriched.createdAt,
              },
            });
          }
          catchUpHint = catchUpHint || String(pre.id ?? "").trim();
          mergedSnapshot = true;
        }
        scheduleCatchUp(catchUpHint, { alreadyMergedSnapshot: mergedSnapshot });
      };
      /**
       * D1: rAF 는 WebView 가 합성되지 않을 때(Android 네이티브 통화 Activity·iOS CallKit 이 덮은 동안) 발화하지 않는다.
       * 데이터 반영은 paint 와 분리 — 프레임이 없으면 짧은 타이머로 동일 1회 적용.
       */
      remoteBumpCatchUpRafRef.current = requestAnimationFrame(applyBump);
      bumpFrameFallbackTimer = setTimeout(applyBump, ROOM_BUMP_FRAME_FALLBACK_MS);
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
      if (bumpFrameFallbackTimer != null) {
        clearTimeout(bumpFrameFallbackTimer);
        bumpFrameFallbackTimer = null;
      }
      const current = roomBumpEntries.get(registryKey);
      if (!current) return;
      current.listeners.delete(listenerRef);
      if (current.listeners.size === 0) current.stop();
    };
  }, [
    catchUpAfterRemoteBump,
    initialServerSnapshot?.viewerUserId,
    roomId,
    roomReadyForRealtime,
    snapshot?.room?.id,
    snapshot?.viewerUserId,
    streamRoomId,
  ]);
}
