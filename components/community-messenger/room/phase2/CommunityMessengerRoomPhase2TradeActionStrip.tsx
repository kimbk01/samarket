"use client";

import {
  CommunityMessengerTradeProcessSection,
  MessengerTradeChatRoomDetailPrefetch,
  SeedTradeChatDetailMemoryFromSnapshot,
} from "@/components/community-messenger/room/community-messenger-room-phase2-lazy";
import { TradeRatingStrip } from "@/components/trade/TradeRatingStrip";
import { useMessengerRoomPhase2View } from "@/components/community-messenger/room/phase2/messenger-room-phase2-view-context";

/**
 * 메신저 거래 방 헤더 아래 거래 행동 줄 (PR-01, 2026-10-27).
 * 판매자 단계 변경 + 거래 평가(CREW REP S5) — 할 일이 없으면 각 줄이 null 을 렌더한다.
 * 상품 정보는 헤더(`tradeListingHeader`)가 담당하므로 여기서는 행동만 둔다.
 */
export function CommunityMessengerRoomPhase2TradeActionStrip() {
  const vm = useMessengerRoomPhase2View();
  const productChatId = vm.tradeProductChatIdForDock;
  if (!vm.showMessengerTradeProcessDock || !productChatId) return null;
  const detail = vm.snapshot.tradeChatRoomDetail ?? null;
  return (
    <>
      {detail ? (
        <SeedTradeChatDetailMemoryFromSnapshot productChatId={productChatId} room={detail} />
      ) : (
        <MessengerTradeChatRoomDetailPrefetch productChatId={productChatId} />
      )}
      <CommunityMessengerTradeProcessSection
        productChatId={productChatId}
        viewerUserId={vm.snapshot.viewerUserId}
        initialTradeChatRoom={detail}
        onTradeMetaChanged={() => void vm.refresh(true)}
        variant="actionStrip"
      />
      {/* CREW REP S5 — 거래 평가(실제로 대화한 상대만). 할 일이 없으면 렌더하지 않는다. */}
      <TradeRatingStrip productChatId={productChatId} counterpartLabel={vm.snapshot.room.title?.trim() || ""} />
    </>
  );
}
