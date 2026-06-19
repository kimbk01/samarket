"use client";

import { useEffect, useRef } from "react";
import type { CommunityMessengerRoomSnapshot } from "@/lib/community-messenger/types";
import { recordCmRoomEntryMilestone } from "@/lib/community-messenger/room/cm-room-entry-instrumentation";
import { isCommunityMessengerStoreOrderDeliveryRoom } from "@/lib/community-messenger/room-context-meta";

function snapshotNeedsOlderHistory(snapshot: CommunityMessengerRoomSnapshot): boolean {
  if (snapshot.hasMoreOlderMessages === true) return true;
  const lim = snapshot.bootstrapInitialMessageLimit;
  return typeof lim === "number" && lim > 0 && snapshot.messages.length >= lim;
}

function roomMessagesNeedOlderHistory(
  snapshot: CommunityMessengerRoomSnapshot | null,
  roomMessageCount: number
): boolean {
  if (!snapshot) return false;
  if (snapshotNeedsOlderHistory(snapshot)) return true;
  return (snapshot.messages?.length ?? 0) > roomMessageCount && roomMessageCount > 0;
}

export function shouldEagerHydrateMessengerRoomOlderHistory(input: {
  snapshot: CommunityMessengerRoomSnapshot | null;
  roomMessageCount: number;
}): boolean {
  if (!input.snapshot) return false;
  if (!isCommunityMessengerStoreOrderDeliveryRoom(input.snapshot.room)) return false;
  return (
    snapshotNeedsOlderHistory(input.snapshot) ||
    roomMessagesNeedOlderHistory(input.snapshot, input.roomMessageCount)
  );
}

/**
 * 진입 시 `hasMoreOlderMessages` 이면 스크롤 상단 센티넬을 기다리지 않고 이전 페이지를 연속 fetch.
 * 주문 채팅(매장 슬라이드·구매자 URL) — 양측 동일 히스토리를 첫 페인트에 맞춘다.
 * 일반 메신저/통화 내역 방은 진입 window 만 유지하고, 과거 내역은 상단 스크롤 때 로드한다.
 */
export function useMessengerRoomEagerOlderHistoryHydration({
  roomId,
  snapshot,
  roomMessageCount,
  timelineViewportMounted,
  hydrateFullOlderMessageHistory,
}: {
  roomId: string;
  snapshot: CommunityMessengerRoomSnapshot | null;
  roomMessageCount: number;
  timelineViewportMounted: boolean;
  hydrateFullOlderMessageHistory: () => Promise<boolean>;
}): void {
  const ranForRoomRef = useRef<string | null>(null);
  const inFlightRef = useRef(false);

  useEffect(() => {
    ranForRoomRef.current = null;
    inFlightRef.current = false;
  }, [roomId]);

  useEffect(() => {
    const rid = roomId.trim();
    if (!rid || !snapshot) return;
    if (String(snapshot.room.id) !== rid) return;
    if (!timelineViewportMounted) return;
    if (ranForRoomRef.current === rid) return;
    if (!shouldEagerHydrateMessengerRoomOlderHistory({ snapshot, roomMessageCount })) {
      ranForRoomRef.current = rid;
      return;
    }

    ranForRoomRef.current = rid;
    if (inFlightRef.current) return;
    inFlightRef.current = true;

    void (async () => {
      try {
        const loaded = await hydrateFullOlderMessageHistory();
        if (loaded) {
          recordCmRoomEntryMilestone("deferred_history_ms");
        }
      } finally {
        inFlightRef.current = false;
      }
    })();
  }, [roomId, snapshot, roomMessageCount, timelineViewportMounted, hydrateFullOlderMessageHistory]);
}
