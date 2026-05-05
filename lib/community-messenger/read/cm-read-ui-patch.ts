"use client";

import { dispatchTradeChatUnreadUpdated } from "@/lib/chats/chat-channel-events";
import { patchRoomReadStateInSnapshotCache } from "@/lib/community-messenger/room-snapshot-cache";
import { cmReadUiLog } from "@/lib/community-messenger/read/cm-read-ui-log";
import {
  applyRoomSummaryPatched,
  getMessengerRealtimeRoomSummary,
  normalizeMessengerRealtimeRoomId,
  useMessengerRealtimeStore,
} from "@/lib/community-messenger/stores/messenger-realtime-store";

export type CmReadUiBadgePhase = "optimistic" | "patch_done";

/**
 * 리스트·스냅샷 캐시·거래 허브 — mark_read 낙관/확정 공통 멱등 패치.
 * 부트스트략 행은 `postCommunityMessengerBusEvent(cm.room.read)` 경로가 병합한다.
 */
export function applyCmReadUiBadgeZero(args: {
  roomId: string;
  viewerUserId: string | null | undefined;
  phase: CmReadUiBadgePhase;
  reason: string;
}): void {
  const rid = normalizeMessengerRealtimeRoomId(args.roomId);
  const vid = typeof args.viewerUserId === "string" ? args.viewerUserId.trim() : "";
  if (!rid || !vid) return;

  const state = useMessengerRealtimeStore.getState();
  let beforeUnread: number | null = null;
  if (Object.prototype.hasOwnProperty.call(state.unreadByRoomId, rid)) {
    beforeUnread = Math.max(0, Math.floor(Number(state.unreadByRoomId[rid]) || 0));
  } else if (state.roomSummariesById[rid]) {
    const u = state.roomSummariesById[rid]?.unreadCount;
    beforeUnread = typeof u === "number" && Number.isFinite(u) ? Math.max(0, Math.floor(u)) : 0;
  }

  applyRoomSummaryPatched({ viewerUserId: vid, roomId: rid, unreadCount: 0 });
  patchRoomReadStateInSnapshotCache({ roomId: rid, viewerUserId: vid, unreadCount: 0 });

  const summary = getMessengerRealtimeRoomSummary(rid);
  const meta = summary?.contextMeta;
  let postId: string | null = null;
  let productChatId: string | null = null;
  if (meta?.kind === "trade") {
    postId = typeof meta.postId === "string" && meta.postId.trim() ? meta.postId.trim() : null;
    productChatId = typeof meta.productChatId === "string" && meta.productChatId.trim() ? meta.productChatId.trim() : null;
  }

  dispatchTradeChatUnreadUpdated({
    source: `cm-read-ui-${args.phase}`,
    key: postId ?? productChatId ?? rid,
    roomId: rid,
    dedupeMs: 0,
  });

  const afterState = useMessengerRealtimeStore.getState();
  const afterRaw =
    (Object.prototype.hasOwnProperty.call(afterState.unreadByRoomId, rid)
      ? afterState.unreadByRoomId[rid]
      : afterState.roomSummariesById[rid]?.unreadCount) ?? 0;
  const afterUnread = Math.max(0, Math.floor(Number(afterRaw) || 0));

  const base = {
    roomId: rid,
    postId,
    productChatId,
    source: "cm" as const,
    beforeUnread,
    afterUnread,
    reason: args.reason,
    phase: args.phase,
  };
  cmReadUiLog(args.phase === "optimistic" ? "room_enter_badge_zero_apply" : "mark_read_done_badge_zero_apply", base);
  cmReadUiLog("trade_list_badge_zero_apply", base);
}
