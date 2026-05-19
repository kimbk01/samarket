"use client";

import { useEffect, useMemo } from "react";
import { useMessengerRoomUrlSearchParams } from "@/lib/community-messenger/room/use-messenger-room-url-search-params";
import { setMessengerRoomBackOverride } from "@/lib/community-messenger/room/messenger-room-back-navigation";
import { messengerDeliveryViewerRole } from "@/lib/community-messenger/messenger-delivery-viewer-role";
import type { CommunityMessengerRoomContextMetaV1 } from "@/lib/community-messenger/types";
import {
  parseMessengerRoomBackQueryKeys,
  resolveStoreOrderBuyerMessengerRoomBackHref,
} from "@/lib/store-order-chat/store-order-buyer-messenger-room-back";

/**
 * 배달 주문 메신저 방 — 구매자일 때 Tier1·스와이프·헤더가 동일한 직행 뒤로가기 URL 을 쓰도록 등록한다.
 */
export function useStoreOrderBuyerMessengerRoomBackOverride(input: {
  roomId: string;
  contextMeta: CommunityMessengerRoomContextMetaV1 | null | undefined;
  myRole: string | null | undefined;
  storeSlug?: string | null | undefined;
  storeCategorySlug?: string | null | undefined;
  businessType?: string | null | undefined;
}): void {
  const searchParams = useMessengerRoomUrlSearchParams();
  const { fromQuery } = parseMessengerRoomBackQueryKeys(searchParams);

  const href = useMemo(
    () =>
      resolveStoreOrderBuyerMessengerRoomBackHref({
        contextMeta: input.contextMeta,
        myRole: input.myRole,
        storeSlug: input.storeSlug,
        storeCategorySlug: input.storeCategorySlug,
        businessType: input.businessType,
        fromQuery,
      }),
    [
      fromQuery,
      input.businessType,
      input.contextMeta,
      input.myRole,
      input.storeCategorySlug,
      input.storeSlug,
    ]
  );

  const roomId = input.roomId.trim();

  useEffect(() => {
    if (!roomId) return;
    if (href == null) {
      setMessengerRoomBackOverride(roomId, null);
      return;
    }
    setMessengerRoomBackOverride(roomId, { href, forceDirect: true });
    return () => setMessengerRoomBackOverride(roomId, null);
  }, [href, roomId]);
}

export function useIsStoreOrderBuyerDeliveryMessengerRoom(input: {
  contextMeta: CommunityMessengerRoomContextMetaV1 | null | undefined;
  myRole: string | null | undefined;
}): boolean {
  return messengerDeliveryViewerRole(input.contextMeta, input.myRole) === "buyer";
}
