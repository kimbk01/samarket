"use client";

import { dispatchTradeChatUnreadUpdated } from "@/lib/chats/chat-channel-events";
import { postCommunityMessengerBusEvent } from "@/lib/community-messenger/multi-tab-bus";
import { requestMessengerHubBadgeResync } from "@/lib/community-messenger/notifications/messenger-notification-contract";
import { patchMessengerRoomReadSnapshotRuntime } from "@/lib/community-messenger/realtime/messenger-realtime-snapshot-runtime";
import { cmReadBadgeLog } from "@/lib/community-messenger/read/local-read-guard";
import { applyCmReadUiBadgeZero } from "@/lib/community-messenger/read/cm-read-ui-patch";

/** 홈 수동 읽음 — 방 `applyOptimisticRoomRead` 와 동일 bus·스냅샷 계약( list 는 호출부 `updateRoomSummaryState` ). */
export function applyCmHomeOptimisticMarkRead(args: {
  roomId: string;
  viewerUserId: string;
  lastReadMessageId?: string | null;
  beforeUnread: number;
  reason: string;
  postId?: string | null;
  productChatId?: string | null;
}): number {
  const tAlign0 = typeof performance !== "undefined" ? performance.now() : Date.now();
  patchMessengerRoomReadSnapshotRuntime({
    viewerUserId: args.viewerUserId,
    roomId: args.roomId,
  });
  postCommunityMessengerBusEvent({
    type: "cm.room.read",
    roomId: args.roomId,
    viewerUserId: args.viewerUserId,
    ...(args.lastReadMessageId ? { lastReadMessageId: args.lastReadMessageId } : {}),
    at: Date.now(),
  });
  cmReadBadgeLog("read_bus_emit", {
    roomId: args.roomId,
    source: args.reason,
    optimistic: true,
  });
  postCommunityMessengerBusEvent({
    type: "cm.room.local_unread",
    roomId: args.roomId,
    viewerUserId: args.viewerUserId,
    unreadCount: 0,
    at: Date.now(),
  });
  applyCmReadUiBadgeZero({
    roomId: args.roomId,
    viewerUserId: args.viewerUserId,
    phase: "optimistic",
    reason: args.reason,
    beforeUnread: args.beforeUnread,
    postId: args.postId,
    productChatId: args.productChatId,
  });
  cmReadBadgeLog("home_mark_read_optimistic_zero", {
    roomId: args.roomId,
    beforeUnread: args.beforeUnread,
  });
  return typeof performance !== "undefined" ? Math.round(performance.now() - tAlign0) : 0;
}

/** PATCH 실패·낙관 철회 — `maybeRollbackEarlyOptimisticBadge` 와 동일 bus 복원. */
export function rollbackCmHomeOptimisticMarkRead(args: {
  roomId: string;
  viewerUserId: string;
  restoreUnread: number;
  reason: string;
  postId?: string | null;
}): void {
  const restoreUnread = Math.max(0, Math.floor(Number(args.restoreUnread) || 0));
  if (restoreUnread < 1) {
    if (typeof queueMicrotask === "function") {
      queueMicrotask(() => requestMessengerHubBadgeResync("room_phase2_mark_read", { roomId: args.roomId }));
    } else {
      requestMessengerHubBadgeResync("room_phase2_mark_read", { roomId: args.roomId });
    }
    cmReadBadgeLog("home_mark_read_optimistic_rollback", {
      roomId: args.roomId,
      reason: args.reason,
      restoreUnread: 0,
      hubResyncOnly: true,
    });
    return;
  }
  postCommunityMessengerBusEvent({
    type: "cm.room.local_unread",
    roomId: args.roomId,
    viewerUserId: args.viewerUserId,
    unreadCount: restoreUnread,
    at: Date.now(),
  });
  const postId = args.postId?.trim() ?? "";
  if (postId) {
    dispatchTradeChatUnreadUpdated({
      source: "community-messenger-home-mark-read-rollback",
      key: postId,
      dedupeMs: 0,
    });
  }
  cmReadBadgeLog("home_mark_read_optimistic_rollback", {
    roomId: args.roomId,
    reason: args.reason,
    restoreUnread,
  });
  if (typeof queueMicrotask === "function") {
    queueMicrotask(() => requestMessengerHubBadgeResync("room_phase2_mark_read", { roomId: args.roomId }));
  } else {
    requestMessengerHubBadgeResync("room_phase2_mark_read", { roomId: args.roomId });
  }
}
