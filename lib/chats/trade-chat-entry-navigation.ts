/**
 * 거래 채팅 라우팅 계약 — 재발 방지
 *
 * - `openCreateTradeChat`: 상품 화면에서 방 생성 API 를 **기다리지 않음**. 즉시 compose 로 `replace` 만 한다.
 * - 방 확정·실패 처리는 `TradeChatComposeClient`.
 *
 * `.cursor/rules/trade-post-detail-chat-hot-path.mdc`
 */
import type { ChatRoomSource } from "@/lib/types/chat";
import { prepareTradeChatRoom } from "@/lib/chat/createOrGetChatRoom";
import { warmChatRoomEntryById } from "@/lib/chats/prewarm-chat-room-route";
import {
  TRADE_CHAT_SURFACE,
  tradeHubChatComposeHref,
  tradeHubChatRoomHref,
} from "@/lib/chats/surfaces/trade-chat-surface";
import { startTradeChatEntryMark } from "@/lib/chats/trade-chat-entry-client";

export type TradeChatRouterLike = {
  push: (href: string) => void;
  replace: (href: string, opts?: { scroll?: boolean }) => void;
  prefetch: (href: string) => Promise<void> | void;
};

export function openExistingTradeChat(
  router: TradeChatRouterLike,
  input: {
    productId: string;
    /** 부트스트랩·프리웜용 `chat_rooms.id` / `product_chats.id` */
    roomId: string;
    /** 메신저 방 UUID — 있으면 이동 URL만 이 값 사용 */
    messengerRoomId?: string | null;
    sourceHint?: ChatRoomSource | null;
  }
): void {
  const roomId = input.roomId.trim();
  if (!roomId) return;
  const navRoomId = input.messengerRoomId?.trim() || roomId;
  startTradeChatEntryMark({
    mode: "existing",
    productId: input.productId,
    roomId,
    sourceHint: input.sourceHint ?? null,
  });
  warmChatRoomEntryById(roomId, input.sourceHint ?? null);
  router.push(tradeHubChatRoomHref(navRoomId, input.sourceHint ?? null));
}

/**
 * 신규 거래 채팅: 상품 화면에서는 대기 없이 compose 로만 이동하고,
 * 방 생성·게이트·메신저 이동은 `TradeChatComposeClient` 에서 처리한다.
 */
export function openCreateTradeChat(
  router: TradeChatRouterLike,
  input: {
    productId: string;
  }
): void {
  const productId = input.productId.trim();
  if (!productId) return;
  startTradeChatEntryMark({ mode: "create", productId });
  const composeHref = tradeHubChatComposeHref({ productId });
  void router.prefetch(composeHref);
  void router.prefetch(TRADE_CHAT_SURFACE.messengerListHref);
  router.replace(composeHref, { scroll: false });
}

export function prefetchTradeChatEntry(
  router: TradeChatRouterLike,
  input: {
    productId: string;
    /** 부트스트랩용 행 id */
    existingRoomId?: string | null;
    existingRoomSource?: ChatRoomSource | null;
    /** 메신저 방 UUID — prefetch URL 용 */
    existingMessengerRoomId?: string | null;
    prepareIfCreate?: boolean;
  }
): void {
  const productId = input.productId.trim();
  if (!productId) return;

  void router.prefetch(TRADE_CHAT_SURFACE.messengerListHref);

  const existingRoomId = input.existingRoomId?.trim();
  if (existingRoomId) {
    const navRoomId = input.existingMessengerRoomId?.trim() || existingRoomId;
    void router.prefetch(tradeHubChatRoomHref(navRoomId, input.existingRoomSource ?? null));
    warmChatRoomEntryById(existingRoomId, input.existingRoomSource ?? null);
    return;
  }

  void router.prefetch(tradeHubChatComposeHref({ productId }));
  if (input.prepareIfCreate) {
    prepareTradeChatRoom(productId);
  }
}
