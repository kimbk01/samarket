"use client";

/**
 * 거래 compose → 메신저 방 진입 시 room client JS 청크 선로딩.
 * `/community-messenger` layout prefetch 와 별도 — 상품 상세·compose 경로 cold 진입용.
 * room RSC route prefetch(`trade-chat-room-route-prefetch`) 와 무관.
 */
import {
  noteTradeChatRoomInnerChunkEval,
  noteTradeChatRoomPhase2BodyDynamicReady,
} from "@/lib/trade/trade-chat-room-shell-breakdown-perf";

let prefetchStarted = false;

export function prefetchTradeChatRoomClientChunks(): void {
  if (prefetchStarted || typeof window === "undefined") return;
  prefetchStarted = true;
  void import("@/components/community-messenger/CommunityMessengerRoomClientInner").then((m) => {
    if (m) noteTradeChatRoomInnerChunkEval();
    return m;
  });
  void import("@/components/community-messenger/room/CommunityMessengerRoomClientPhase2Body").then(
    () => {
      noteTradeChatRoomPhase2BodyDynamicReady();
    }
  );
}
