"use client";

import { useCallback, useMemo } from "react";
import type {
  CommunityMessengerMessage,
  CommunityMessengerProfileLite,
  CommunityMessengerRoomContextMetaV1,
} from "@/lib/community-messenger/types";
import type { StoreOrderDeliveryHeaderMode } from "@/lib/store-order-chat/messenger-delivery-room-header";
import { useStoreOrderDeliveryMessengerHeader } from "@/lib/store-order-chat/use-store-order-delivery-messenger-header";

/** `닉네임 (@handle)` — 배달 주문 채팅 말풍선 상단에는 handle 미노출 */
export function stripMessengerMemberHandleSuffix(label: string): string {
  const trimmed = label.trim();
  const paren = trimmed.match(/^(.+?)\s*\(@[^)]+\)\s*$/);
  if (paren?.[1]?.trim()) return paren[1].trim();
  return trimmed;
}

export function resolveDeliveryRoomMessageSenderLabel(input: {
  isDeliveryRoom: boolean;
  isMine: boolean;
  rawLabel: string;
  headerMode: StoreOrderDeliveryHeaderMode;
  storeDisplayName: string;
  buyerDisplayName: string;
}): string {
  if (!input.isDeliveryRoom || input.isMine) {
    return stripMessengerMemberHandleSuffix(input.rawLabel);
  }
  if (input.headerMode === "buyer_store") {
    return input.storeDisplayName.trim() || "매장";
  }
  if (input.headerMode === "owner_buyer_peer") {
    return stripMessengerMemberHandleSuffix(input.buyerDisplayName) || "주문자";
  }
  if (input.isDeliveryRoom && input.storeDisplayName.trim()) {
    return input.storeDisplayName.trim();
  }
  return stripMessengerMemberHandleSuffix(input.rawLabel);
}

type VmLike = {
  snapshot: {
    room: {
      contextMeta?: CommunityMessengerRoomContextMetaV1 | null;
      title: string;
      avatarUrl: string | null;
      peerUserId?: string | null;
    };
    viewerUserId?: string | null;
    myRole: "owner" | "admin" | "member";
    members: CommunityMessengerProfileLite[];
  };
  storeOrderIdForDock: string;
  storeIdForDock: string;
  tt: (label: string) => string;
};

/** 타임라인 말풍선 `senderLabel` — 구매자에게 매장 측은 매장명만 */
export function useDeliveryRoomMessageSenderLabel(vm: VmLike) {
  const meta = vm.snapshot.room.contextMeta;
  const storeOrderId = vm.storeOrderIdForDock;
  const isDeliveryRoom =
    meta?.kind === "delivery" && storeOrderId.length > 0;

  const deliveryHeader = useStoreOrderDeliveryMessengerHeader({
    isDeliveryRoom,
    deliveryHeadline: meta?.kind === "delivery" ? meta.headline : undefined,
    contextStoreDisplayName: meta?.kind === "delivery" ? meta.storeDisplayName : null,
    storeOrderId,
    storeId: vm.storeIdForDock,
    myRole: vm.snapshot.myRole,
    roomTitle: vm.snapshot.room.title,
    roomAvatarUrl: vm.snapshot.room.avatarUrl,
    peerUserId: vm.snapshot.room.peerUserId ?? "",
    viewerUserId: vm.snapshot.viewerUserId ?? "",
    members: vm.snapshot.members,
    thumbnailUrl: meta?.kind === "delivery" ? (meta.thumbnailUrl ?? null) : null,
  });

  const headerMode = deliveryHeader.mode;
  const resolveLabel = useCallback(
    (message: CommunityMessengerMessage) => {
      const raw = vm.tt(message.senderLabel);
      return resolveDeliveryRoomMessageSenderLabel({
        isDeliveryRoom,
        isMine: Boolean(message.isMine),
        rawLabel: raw,
        headerMode,
        storeDisplayName:
          headerMode === "buyer_store" || isDeliveryRoom ? deliveryHeader.title : "",
        buyerDisplayName: headerMode === "owner_buyer_peer" ? deliveryHeader.title : "",
      });
    },
    [deliveryHeader.title, headerMode, isDeliveryRoom, vm]
  );

  return resolveLabel;
}
