"use client";

import { useEffect, useState } from "react";
import { fetchChatRoomDetailApi, peekChatRoomDetailMemory } from "@/lib/chats/fetch-chat-room-detail-api";
import { useTradeListingRemoved } from "@/lib/trade/listing-visibility/listing-visibility-client";
import { isTradePostPubliclyVisible } from "@/lib/trade/listing-visibility/listing-visibility-shared";
import type { ChatRoom } from "@/lib/types/chat";

/** 방 정보(summary)의 글 상태 문구 — `getChatListingItemStateLabel` 의 숨김·삭제 문구 */
export function isUnavailableTradeItemStateLabel(label: string | null | undefined): boolean {
  const t = (label ?? "").trim();
  return t === "숨김" || t === "삭제됨";
}

/**
 * 거래 1:1 방 — 「볼 수 없는 글」 판정 1곳 (2차 실기 D1 · 설계 G1 2026-11-04).
 * 방 머리·첫 안내 카드·⋮ 상품 줄이 같이 쓴다.
 * - 거래방 상세(행동 줄과 같은 메모리 캐시·단일 비행 `fetchChatRoomDetailApi` — 요청 추가 없음)의 글 상태가 공개 아님
 *   · 방 정보 문구가 「숨김」「삭제됨」 · 이번 실행 중 숨김·삭제 방송 수신 중 하나면 true.
 * - 판매자 본인은 false. 상세가 아직 없으면(판매자 여부 모름) 보류 = false.
 */
export function useTradeRoomListingUnavailable(input: {
  productChatId: string | null | undefined;
  postId: string | null | undefined;
  viewerUserId: string | null | undefined;
  summaryItemStateLabel: string | null | undefined;
}): boolean {
  const pcid = String(input.productChatId ?? "").trim();
  const [detail, setDetail] = useState<ChatRoom | null>(() => (pcid ? peekChatRoomDetailMemory(pcid) : null));
  const removedByBroadcast = useTradeListingRemoved(input.postId);

  useEffect(() => {
    if (!pcid) return;
    const warm = peekChatRoomDetailMemory(pcid);
    if (warm) {
      setDetail(warm);
      return;
    }
    let cancelled = false;
    void fetchChatRoomDetailApi(pcid).then((r) => {
      if (!cancelled && r.ok) setDetail(r.room);
    });
    return () => {
      cancelled = true;
    };
  }, [pcid]);

  return resolveTradeRoomListingUnavailable({
    detail,
    viewerUserId: input.viewerUserId,
    summaryItemStateLabel: input.summaryItemStateLabel,
    removedByBroadcast,
  });
}

/** 판정 규칙(순수 함수) — 훅과 테스트가 같이 쓴다 */
export function resolveTradeRoomListingUnavailable(input: {
  detail: Pick<ChatRoom, "sellerId" | "product"> | null;
  viewerUserId: string | null | undefined;
  summaryItemStateLabel: string | null | undefined;
  removedByBroadcast: boolean;
}): boolean {
  const { detail } = input;
  /** 상세가 없으면 판매자 여부를 몰라 보류(판매자 본인에게 「볼 수 없는 글」을 보이지 않게) */
  if (!detail) return false;
  const viewer = String(input.viewerUserId ?? "").trim();
  if (viewer && viewer === String(detail.sellerId ?? "").trim()) return false;
  return (
    input.removedByBroadcast ||
    isUnavailableTradeItemStateLabel(input.summaryItemStateLabel) ||
    (detail.product != null && !isTradePostPubliclyVisible({ status: detail.product.status }))
  );
}
