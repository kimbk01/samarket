"use client";

import { useShallow } from "zustand/react/shallow";
import {
  normalizeMessengerRealtimeRoomId,
  useMessengerRealtimeStore,
  type MessengerRealtimeState,
} from "@/lib/community-messenger/stores/messenger-realtime-store";

export type MessengerChatListUnreadTier = "cm-unreadByRoomId" | "cm-roomSummariesById" | "bootstrap-room";

export type MessengerChatListUnreadResolution = {
  count: number;
  tier: MessengerChatListUnreadTier;
};

/**
 * 메신저·거래 CM 연동 목록 행의 표시용 미읽음 수 단일 규칙.
 * — `unreadByRoomId`(Realtime 낙관·증분) → `roomSummariesById` → 부트스트랩 행 폴백
 * — `Math.max(부트스트략, 스토어)` 금지 (읽음 처리 후 역행 방지 — MessengerChatListItem 주석과 동일)
 */
export function resolveMessengerChatListUnread(
  state: Pick<MessengerRealtimeState, "unreadByRoomId" | "roomSummariesById">,
  roomId: string | null | undefined,
  bootstrapUnread: number
): MessengerChatListUnreadResolution {
  const n = roomId ? normalizeMessengerRealtimeRoomId(roomId) : "";
  const bootstrap = Math.max(0, Math.floor(Number(bootstrapUnread) || 0));
  if (!n) {
    return { count: bootstrap, tier: "bootstrap-room" };
  }
  if (Object.prototype.hasOwnProperty.call(state.unreadByRoomId, n)) {
    const raw = state.unreadByRoomId[n];
    const count = typeof raw === "number" && Number.isFinite(raw) ? Math.max(0, Math.floor(raw)) : 0;
    return { count, tier: "cm-unreadByRoomId" };
  }
  if (Object.prototype.hasOwnProperty.call(state.roomSummariesById, n)) {
    const summaryUnread = state.roomSummariesById[n]?.unreadCount;
    const count =
      typeof summaryUnread === "number" && Number.isFinite(summaryUnread)
        ? Math.max(0, Math.floor(summaryUnread))
        : 0;
    return { count, tier: "cm-roomSummariesById" };
  }
  return { count: bootstrap, tier: "bootstrap-room" };
}

/** 목록 행: 스토어 구독 한 번으로 미읽음 수 + 소스 tier */
export function useMessengerChatListUnread(
  storeLookupRoomId: string | null | undefined,
  bootstrapUnread: number
): MessengerChatListUnreadResolution {
  const nid = storeLookupRoomId ? normalizeMessengerRealtimeRoomId(storeLookupRoomId) : "";
  /**
   * 객체 리터럴을 그대로 반환하면 참조가 매번 바뀌어 Zustand가 무한 리렌더(`Maximum update depth`)로 이어진다.
   * 얕은 비교로 동일 `{ count, tier }` 는 이전 참조를 유지한다.
   */
  return useMessengerRealtimeStore(
    useShallow((s: MessengerRealtimeState) => resolveMessengerChatListUnread(s, nid || null, bootstrapUnread))
  );
}
