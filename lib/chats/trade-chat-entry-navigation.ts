import type { ChatRoomSource } from "@/lib/types/chat";
import { createOrGetChatRoom, prepareTradeChatRoom } from "@/lib/chat/createOrGetChatRoom";
import { warmChatRoomEntryById } from "@/lib/chats/prewarm-chat-room-route";
import {
  TRADE_CHAT_SURFACE,
  tradeHubChatComposeHref,
  tradeHubChatRoomHref,
} from "@/lib/chats/surfaces/trade-chat-surface";
import { patchTradeChatEntryMark, startTradeChatEntryMark } from "@/lib/chats/trade-chat-entry-client";
import {
  setTradeChatEntryCreatingOverlayState,
  setTradeChatEntryCreatingOverlayVisible,
} from "@/lib/chats/trade-chat-entry-overlay-events";
import { emitTradeChatRoomResolved } from "@/lib/chats/trade-chat-room-resolved-event";
import { redirectForBlockedAction } from "@/lib/auth/client-access-flow";
import { logClientPerf } from "@/lib/performance/samarket-perf";
import { requestMessengerHomeListMergeFromHomeSummary } from "@/lib/community-messenger/request-messenger-home-list-merge-from-summary";

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
 * 신규 거래 채팅: 서버 `entry/resolve` 로 방을 바로 확정한 뒤 메신저 방으로 이동(compose 홉 생략).
 * 인증·전화번호 등 클라 처리가 필요하면 compose 폴백.
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
  void (async () => {
    let successNavigatedToRoom = false;
    setTradeChatEntryCreatingOverlayState({ visible: true, phase: "resolving" });
    try {
      const result = await createOrGetChatRoom(productId);
      if (result.ok && result.roomId) {
        const navRoomId = result.messengerRoomId?.trim() || result.roomId;
        const dest = tradeHubChatRoomHref(navRoomId, result.roomSource);
        setTradeChatEntryCreatingOverlayState({ visible: true, phase: "entering" });
        void router.prefetch(dest);
        const mark = patchTradeChatEntryMark({
          roomId: result.roomId,
          sourceHint: result.roomSource,
          roomResolvedAt: Date.now(),
        });
        if (mark?.roomResolvedAt) {
          logClientPerf("chat-entry.room-resolved", {
            mode: mark.mode,
            productId: mark.productId,
            roomId: result.roomId,
            elapsedMs: Math.max(0, mark.roomResolvedAt - mark.startedAt),
          });
        }
        emitTradeChatRoomResolved({
          productId,
          roomId: result.roomId,
          messengerRoomId: result.messengerRoomId ?? null,
          roomSource: result.roomSource,
        });
        const cmForList = result.messengerRoomId?.trim();
        if (cmForList) void requestMessengerHomeListMergeFromHomeSummary(cmForList, "trade_chat_entry_room_ready");
        router.replace(dest, { scroll: false });
        successNavigatedToRoom = true;
        return;
      }
      const errMsg = !result.ok ? result.error : "채팅방을 열 수 없습니다.";
      if (redirectForBlockedAction(router, errMsg, composeHref)) return;
      void router.prefetch(composeHref);
      router.push(composeHref);
    } finally {
      if (!successNavigatedToRoom) {
        setTradeChatEntryCreatingOverlayVisible(false);
      }
    }
  })();
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
