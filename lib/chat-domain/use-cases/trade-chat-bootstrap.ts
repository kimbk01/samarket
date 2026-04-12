import type { ChatRoomBootstrapPayload } from "@/lib/chats/server/load-chat-room-bootstrap";
import type {
  TradeChatBootstrapOptions,
  TradeChatReadPort,
} from "../ports/trade-chat-read";

/** BFF `GET .../api/chat/room/[roomId]/bootstrap` — 도메인 포트만 의존 */
export async function loadTradeChatRoomBootstrap(
  port: TradeChatReadPort,
  userId: string,
  roomId: string,
  options?: TradeChatBootstrapOptions
): Promise<ChatRoomBootstrapPayload> {
  return port.loadBootstrap(userId, roomId, options);
}
