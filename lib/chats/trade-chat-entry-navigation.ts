"use client";

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
import { isRoomSnapshotFresh, prefetchCommunityMessengerRoomSnapshot } from "@/lib/community-messenger/room-snapshot-cache";
import {
  prefetchTradeMessengerRoomSnapshotWithCap,
  tradeMessengerSnapshotPrefetchCapMs,
} from "@/lib/chats/trade-chat-room-route-prefetch";
import type { TradeChatComposePreviewFields } from "@/lib/chats/trade-chat-compose-preview-client";
import { setTradeChatComposePreview } from "@/lib/chats/trade-chat-compose-preview-client";

export type TradeChatRouterLike = {
  push: (href: string) => void;
  replace: (href: string, opts?: { scroll?: boolean }) => void;
  prefetch: (href: string) => Promise<void> | void;
};

/**
 * 거래방 상품 상세 슬라이드에서 「채팅 이어가기」 대상 방이 슬라이드를 띄운 방과 같은가.
 * 같으면 같은 경로(쿼리만 다름)로 이동하게 되어 방 화면이 새로 마운트되지 않으면
 * 슬라이드·「이동 중…」이 남는다(2026-11-16) — 호출측은 이동 대신 슬라이드를 닫는다.
 */
export function isTradeChatTargetSameAsSlideHostRoom(input: {
  hostMessengerRoomId: string | null | undefined;
  targetMessengerRoomId: string | null | undefined;
}): boolean {
  const host = input.hostMessengerRoomId?.trim() ?? "";
  const target = input.targetMessengerRoomId?.trim() ?? "";
  return host.length > 0 && host === target;
}

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
  const cmId = input.messengerRoomId?.trim();
  const dest = tradeHubChatRoomHref(navRoomId, input.sourceHint ?? null);
  startTradeChatEntryMark({
    mode: "existing",
    productId: input.productId,
    roomId,
    sourceHint: input.sourceHint ?? null,
  });
  warmChatRoomEntryById(roomId, input.sourceHint ?? null);
  void router.prefetch(dest);
  void (async () => {
    if (cmId && !isRoomSnapshotFresh(cmId)) {
      await prefetchTradeMessengerRoomSnapshotWithCap(cmId, {
        capMs: tradeMessengerSnapshotPrefetchCapMs.existing,
      });
    }
    router.push(dest);
  })();
}

/**
 * 신규 거래 채팅: 상품 화면에서는 대기 없이 compose 로만 이동하고,
 * 방 생성·게이트·메신저 이동은 `TradeChatComposeClient` 에서 처리한다.
 */
export function openCreateTradeChat(
  router: TradeChatRouterLike,
  input: {
    productId: string;
    /** 상세 등에서 넘기면 compose 에서 즉시 상품 shell 표시 */
    composePreview?: TradeChatComposePreviewFields;
  }
): void {
  const productId = input.productId.trim();
  if (!productId) return;
  if (input.composePreview) {
    setTradeChatComposePreview(productId, input.composePreview);
  }
  startTradeChatEntryMark({ mode: "create", productId });
  const composeHref = tradeHubChatComposeHref({ productId });
  /** compose 라우트 로드와 병렬로 resolve 선행 — UI·응답 shape 불변 */
  prepareTradeChatRoom(productId);
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
    const cmPrefetch = input.existingMessengerRoomId?.trim();
    if (cmPrefetch) void prefetchCommunityMessengerRoomSnapshot(cmPrefetch);
    return;
  }

  void router.prefetch(tradeHubChatComposeHref({ productId }));
  if (input.prepareIfCreate) {
    prepareTradeChatRoom(productId);
  }
}
