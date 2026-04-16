import type { TradeChatReadPort } from "@/lib/chat-domain/ports/trade-chat-read";
import { loadChatRoomBootstrapForUser } from "@/lib/chats/server/load-chat-room-bootstrap";

/** 거래/통합 채팅 — `TradeChatReadPort` 구현 (BFF·테스트에서 주입 가능) */
export function createTradeChatReadAdapter(): TradeChatReadPort {
  return {
    loadBootstrap(userId, roomId, options) {
      return loadChatRoomBootstrapForUser({
        roomId,
        userId,
        sourceHint: options?.sourceHint,
        detailScope: options?.detailScope,
        bootstrapPhase: options?.bootstrapPhase,
      });
    },
  };
}
