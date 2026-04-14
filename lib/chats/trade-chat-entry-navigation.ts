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
  prefetch: (href: string) => Promise<void> | void;
};

export function openExistingTradeChat(
  router: TradeChatRouterLike,
  input: {
    productId: string;
    roomId: string;
    sourceHint?: ChatRoomSource | null;
  }
): void {
  const roomId = input.roomId.trim();
  if (!roomId) return;
  startTradeChatEntryMark({
    mode: "existing",
    productId: input.productId,
    roomId,
    sourceHint: input.sourceHint ?? null,
  });
  warmChatRoomEntryById(roomId, input.sourceHint ?? null);
  router.push(tradeHubChatRoomHref(roomId, input.sourceHint ?? null));
}

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
  router.push(composeHref);
}

export function prefetchTradeChatEntry(
  router: TradeChatRouterLike,
  input: {
    productId: string;
    existingRoomId?: string | null;
    existingRoomSource?: ChatRoomSource | null;
    prepareIfCreate?: boolean;
  }
): void {
  const productId = input.productId.trim();
  if (!productId) return;

  void router.prefetch(TRADE_CHAT_SURFACE.messengerListHref);

  const existingRoomId = input.existingRoomId?.trim();
  if (existingRoomId) {
    void router.prefetch(tradeHubChatRoomHref(existingRoomId, input.existingRoomSource ?? null));
    warmChatRoomEntryById(existingRoomId, input.existingRoomSource ?? null);
    return;
  }

  void router.prefetch(tradeHubChatComposeHref({ productId }));
  if (input.prepareIfCreate) {
    prepareTradeChatRoom(productId);
  }
}
