"use client";

import { dispatchTradeChatUnreadUpdated } from "@/lib/chats/chat-channel-events";
import { patchRoomReadStateInSnapshotCache } from "@/lib/community-messenger/room-snapshot-cache";
import { cmReadUiLog } from "@/lib/community-messenger/read/cm-read-ui-log";
import { normalizeMessengerRealtimeRoomId } from "@/lib/community-messenger/stores/messenger-realtime-store";

export type CmReadUiBadgePhase = "optimistic" | "patch_done";

/**
 * 방 스냅샷 캐시·거래 허브 — mark_read 낙관/확정 공통 멱등 패치.
 * 홈 list unread 는 `applyHomeListPatch` / bus (`cm.room.read`) 경로만.
 */
export function applyCmReadUiBadgeZero(args: {
  roomId: string;
  viewerUserId: string | null | undefined;
  phase: CmReadUiBadgePhase;
  reason: string;
  beforeUnread?: number | null;
  postId?: string | null;
  productChatId?: string | null;
}): void {
  const rid = normalizeMessengerRealtimeRoomId(args.roomId);
  const vid = typeof args.viewerUserId === "string" ? args.viewerUserId.trim() : "";
  if (!rid || !vid) return;

  patchRoomReadStateInSnapshotCache({ roomId: rid, viewerUserId: vid, unreadCount: 0 });

  const postId = args.postId ?? null;
  const productChatId = args.productChatId ?? null;

  dispatchTradeChatUnreadUpdated({
    source: `cm-read-ui-${args.phase}`,
    key: postId ?? productChatId ?? rid,
    roomId: rid,
    dedupeMs: 0,
  });

  const base = {
    roomId: rid,
    postId,
    productChatId,
    source: "cm" as const,
    beforeUnread: args.beforeUnread ?? null,
    afterUnread: 0,
    reason: args.reason,
    phase: args.phase,
  };
  cmReadUiLog(args.phase === "optimistic" ? "room_enter_badge_zero_apply" : "mark_read_done_badge_zero_apply", base);
  cmReadUiLog("trade_list_badge_zero_apply", base);
}
