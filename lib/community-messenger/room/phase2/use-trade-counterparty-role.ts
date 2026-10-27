"use client";

import { useEffect, useState } from "react";
import { fetchChatRoomDetailApi, peekChatRoomDetailMemory } from "@/lib/chats/fetch-chat-room-detail-api";
import { resolveTradeWindowCounterpartyRole } from "@/lib/community-messenger/room/phase2/marketplace-room-chrome";

type Role = "seller" | "buyer" | null;

/**
 * CTA-06 (2026-10-27) — 거래방 상대 역할.
 * instant·silent 방 스냅샷에는 `tradeChatRoomDetail` 이 없어 역할이 null 이고, 그때 기본 문구가
 * 판매자 본인에게 「판매자 프로필 보기」로 보였다(Samsung 판매자 계정 실측).
 * 스냅샷 값이 있으면 그대로 쓰고, 없으면 거래방 상세(행동 줄 prefetch 와 같은 메모리 캐시·단일 비행)로 확정한다.
 */
export function useTradeCounterpartyRole(input: {
  known: Role;
  productChatId: string;
  viewerUserId: string;
}): Role {
  const { known, productChatId, viewerUserId } = input;
  const [fromDetail, setFromDetail] = useState<Role>(null);

  useEffect(() => {
    if (known || !productChatId || !viewerUserId) return;
    const resolve = (room: { sellerId?: string; buyerId?: string }) =>
      resolveTradeWindowCounterpartyRole({
        viewerUserId,
        sellerUserId: room.sellerId,
        buyerUserId: room.buyerId,
      });
    const warm = peekChatRoomDetailMemory(productChatId);
    if (warm) {
      setFromDetail(resolve(warm));
      return;
    }
    let cancelled = false;
    void fetchChatRoomDetailApi(productChatId).then((r) => {
      if (!cancelled && r.ok) setFromDetail(resolve(r.room));
    });
    return () => {
      cancelled = true;
    };
  }, [known, productChatId, viewerUserId]);

  return known ?? fromDetail;
}
