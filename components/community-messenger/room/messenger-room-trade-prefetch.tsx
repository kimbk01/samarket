"use client";

import { useLayoutEffect } from "react";
import {
  fetchChatRoomDetailApi,
  updateChatRoomDetailMemory,
} from "@/lib/chats/fetch-chat-room-detail-api";
import type { ChatRoom } from "@/lib/types/chat";

/**
 * 거래 도크보다 먼저 마운트되어 `GET /api/chat/room/[productChatId]` 를 시작 — `runSingleFlight` 로
 * TradeProcessSection 과 요청이 합쳐져 메신저 본문·실시간과 네트워크 경합을 줄인다.
 */
export function MessengerTradeChatRoomDetailPrefetch({ productChatId }: { productChatId: string }) {
  useLayoutEffect(() => {
    const id = productChatId.trim();
    if (!id) return;
    void fetchChatRoomDetailApi(id);
  }, [productChatId]);
  return null;
}

/** RSC 스냅샷에 실린 거래 상세를 클라 메모리 캐시에 맞춰 `fetchChatRoomDetailApi` 단일 비행과 일치 */
export function SeedTradeChatDetailMemoryFromSnapshot({
  productChatId,
  room,
}: {
  productChatId: string;
  room: ChatRoom;
}) {
  useLayoutEffect(() => {
    const id = productChatId.trim();
    if (!id) return;
    updateChatRoomDetailMemory(id, room);
  }, [productChatId, room]);
  return null;
}
