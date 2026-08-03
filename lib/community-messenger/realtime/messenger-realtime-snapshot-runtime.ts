"use client";

import {
  patchRoomReadStateInSnapshotCache,
  patchRoomSummaryInSnapshotCache,
} from "@/lib/community-messenger/room-snapshot-cache";
import type { CommunityMessengerRoomSummary } from "@/lib/community-messenger/types";
import {
  normalizeMessengerRealtimeRoomId,
  useMessengerRealtimeStore,
} from "@/lib/community-messenger/stores/messenger-realtime-store";

export type MessengerRoomSnapshotRuntimePatchInput = {
  viewerUserId?: string | null;
  roomId: string;
  unreadCount?: number | null;
  lastReadMessageId?: string | null;
  summaryPatch?: Partial<
    Pick<
      CommunityMessengerRoomSummary,
      "lastMessage" | "lastMessageAt" | "lastMessageType" | "unreadCount" | "isMuted" | "isPinned"
    >
  > | null;
};

/** 열린 방·스냅샷 캐시 런타임 패치 (홈 list row 아님). */
export function patchMessengerRoomSnapshotRuntime(input: MessengerRoomSnapshotRuntimePatchInput): void {
  const rid = normalizeMessengerRealtimeRoomId(input.roomId);
  if (!rid) return;
  const viewer = input.viewerUserId?.trim() || useMessengerRealtimeStore.getState().viewerUserId;
  if (!viewer) return;

  const snapshotPatch = {
    ...(input.summaryPatch ?? null),
    ...(typeof input.unreadCount === "number" && Number.isFinite(input.unreadCount)
      ? { unreadCount: Math.max(0, Math.floor(input.unreadCount)) }
      : null),
  };
  if (Object.keys(snapshotPatch).length > 0) {
    patchRoomSummaryInSnapshotCache({
      roomId: rid,
      viewerUserId: viewer,
      patch: snapshotPatch,
    });
  }

  if (input.lastReadMessageId !== undefined) {
    useMessengerRealtimeStore.setState((state) => ({
      viewerUserId: viewer,
      lastReadByRoomId: { ...state.lastReadByRoomId, [rid]: input.lastReadMessageId ?? null },
    }));
  } else {
    useMessengerRealtimeStore.setState({ viewerUserId: viewer });
  }
}

/** mark_read 낙관 — viewer unread + viewer read cursor (peer readReceipt untouched). */
export function patchMessengerRoomReadSnapshotRuntime(input: {
  viewerUserId?: string | null;
  roomId: string;
  unreadCount?: number;
  viewerLastReadMessageId?: string | null;
}): void {
  const rid = normalizeMessengerRealtimeRoomId(input.roomId);
  if (!rid) return;
  const viewer = input.viewerUserId?.trim() || useMessengerRealtimeStore.getState().viewerUserId;
  if (!viewer) return;
  patchRoomReadStateInSnapshotCache({
    roomId: rid,
    viewerUserId: viewer,
    unreadCount: Math.max(0, Math.floor(Number(input.unreadCount ?? 0) || 0)),
    ...(input.viewerLastReadMessageId !== undefined
      ? { viewerLastReadMessageId: input.viewerLastReadMessageId }
      : {}),
  });
  useMessengerRealtimeStore.setState({ viewerUserId: viewer });
}
