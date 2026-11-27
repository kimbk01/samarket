"use client";

import { useCallback, useMemo } from "react";
import type {
  CommunityMessengerMessage,
  CommunityMessengerProfileLite,
  CommunityMessengerRoomContextMetaV1,
} from "@/lib/community-messenger/types";
import type { StoreOrderDeliveryHeaderMode } from "@/lib/store-order-chat/messenger-delivery-room-header";
import { useStoreOrderDeliveryMessengerHeader } from "@/lib/store-order-chat/use-store-order-delivery-messenger-header";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import type { AppLanguageCode } from "@/lib/i18n/config";
import { translate } from "@/lib/i18n/messages";
import { getRuntimeAppLanguage } from "@/lib/i18n/runtime-app-language";

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
  /** 대체 라벨(매장·주문자) 언어 — 없으면 화면 언어 */
  language?: AppLanguageCode;
}): string {
  const lang = input.language ?? getRuntimeAppLanguage();
  if (!input.isDeliveryRoom || input.isMine) {
    return stripMessengerMemberHandleSuffix(input.rawLabel);
  }
  if (input.headerMode === "buyer_store") {
    return input.storeDisplayName.trim() || translate(lang, "my_store_orders_store_fallback");
  }
  if (input.headerMode === "owner_buyer_peer") {
    return (
      stripMessengerMemberHandleSuffix(input.buyerDisplayName) ||
      translate(lang, "business_phase7_275")
    );
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
  const { language } = useI18n();
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
        language,
      });
    },
    [deliveryHeader.title, headerMode, isDeliveryRoom, language, vm]
  );

  return resolveLabel;
}
