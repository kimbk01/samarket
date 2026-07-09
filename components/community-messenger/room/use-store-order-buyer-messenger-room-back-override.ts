"use client";

import { messengerDeliveryViewerRole } from "@/lib/community-messenger/messenger-delivery-viewer-role";
import type { CommunityMessengerRoomContextMetaV1 } from "@/lib/community-messenger/types";

/**
 * 배달 주문 메신저 방 — 구매자 browse 직행 override 등록 금지.
 * `cm_return`·history back·delivery-chats 폴백은 `resolveMessengerRoomBackNavigation` 단일 경로.
 */
export function useStoreOrderBuyerMessengerRoomBackOverride(_input: {
  roomId: string;
  contextMeta: CommunityMessengerRoomContextMetaV1 | null | undefined;
  myRole: string | null | undefined;
  storeSlug?: string | null | undefined;
  storeCategorySlug?: string | null | undefined;
  businessType?: string | null | undefined;
}): void {
  /* no-op — override removed */
}

export function useIsStoreOrderBuyerDeliveryMessengerRoom(input: {
  contextMeta: CommunityMessengerRoomContextMetaV1 | null | undefined;
  myRole: string | null | undefined;
}): boolean {
  return messengerDeliveryViewerRole(input.contextMeta, input.myRole) === "buyer";
}
