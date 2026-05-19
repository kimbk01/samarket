"use client";

import { useStoreOrderDeliveryRoomOptional } from "@/components/community-messenger/room/phase2/store-order-delivery-room-context";
import { useStoreOrderBuyerMessengerRoomBackOverride } from "@/components/community-messenger/room/use-store-order-buyer-messenger-room-back-override";
import type { CommunityMessengerRoomContextMetaV1 } from "@/lib/community-messenger/types";

/** `StoreOrderDeliveryRoomProvider` 안에서 구매자 뒤로가기 override 를 등록한다. */
export function StoreOrderBuyerMessengerRoomBackRegistrar({
  roomId,
  contextMeta,
  myRole,
}: {
  roomId: string;
  contextMeta: CommunityMessengerRoomContextMetaV1 | null | undefined;
  myRole: string | null | undefined;
}) {
  const deliveryRoom = useStoreOrderDeliveryRoomOptional();
  useStoreOrderBuyerMessengerRoomBackOverride({
    roomId,
    contextMeta,
    myRole,
    storeSlug: deliveryRoom?.snapshot?.storeSlug,
    storeCategorySlug: deliveryRoom?.snapshot?.storeCategorySlug,
    businessType: deliveryRoom?.snapshot?.storeBusinessType,
  });
  return null;
}
