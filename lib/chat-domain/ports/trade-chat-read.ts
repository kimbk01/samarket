import type { ChatRoomBootstrapPayload } from "@/lib/chats/server/load-chat-room-bootstrap";
import type { ChatRoomDetailScope } from "@/lib/chats/server/load-chat-room-detail";
import type { ChatRoomSource } from "@/lib/types/chat";

/**
 * 거래/통합 채팅방 — 부트스트랩 조회 포트.
 * 구현: `loadChatRoomBootstrapForUser` 등 `lib/chats/server` (인프라는 Supabase 유지).
 */
export type TradeChatBootstrapOptions = {
  sourceHint?: ChatRoomSource | null;
  detailScope?: ChatRoomDetailScope;
};

export interface TradeChatReadPort {
  loadBootstrap(
    userId: string,
    roomId: string,
    options?: TradeChatBootstrapOptions
  ): Promise<ChatRoomBootstrapPayload>;
}
