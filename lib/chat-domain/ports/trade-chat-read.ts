import type { ChatRoomBootstrapPayload } from "@/lib/chats/server/load-chat-room-bootstrap";
import type { ChatRoomDetailScope } from "@/lib/chats/server/load-chat-room-detail";
import type { ChatRoomSource } from "@/lib/types/chat";

/** `lite`: 입장 최소(상세 entry + 짧은 메시지). `full`: 메타·메시지 창 보강. */
export type TradeChatBootstrapPhase = "lite" | "full";

/**
 * 거래/통합 채팅방 — 부트스트랩 조회 포트.
 * 구현: `loadChatRoomBootstrapForUser` 등 `lib/chats/server` (인프라는 Supabase 유지).
 */
export type TradeChatBootstrapOptions = {
  sourceHint?: ChatRoomSource | null;
  detailScope?: ChatRoomDetailScope;
  /** 없으면 `full` — API·RSC 하위 호환 */
  bootstrapPhase?: TradeChatBootstrapPhase;
};

export interface TradeChatReadPort {
  loadBootstrap(
    userId: string,
    roomId: string,
    options?: TradeChatBootstrapOptions
  ): Promise<ChatRoomBootstrapPayload>;
}
