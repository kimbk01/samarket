"use client";

import { fetchChatRoomsBySegment } from "@/lib/chats/fetch-chat-rooms-by-segment";
import { shouldPreloadTradeChatRoomsOnClient } from "@/lib/chats/trade-chat-rooms-warm-policy";

/** warm/prefetch 전용 — `/stores` 등 배달 셸에서는 no-op */
export function warmTradeChatRoomsClient(pathname?: string | null): void {
  if (!shouldPreloadTradeChatRoomsOnClient(pathname)) return;
  void fetchChatRoomsBySegment("trade").catch(() => {});
}
