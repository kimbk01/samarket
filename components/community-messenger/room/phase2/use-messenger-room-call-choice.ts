"use client";

import { useMemo } from "react";
import type { MessengerRoomPhase2ViewModel } from "@/lib/community-messenger/room/phase2/messenger-room-phase2-view-model";
import { resolveCommunityMessengerDeliveryContextMeta } from "@/lib/community-messenger/room-context-meta";
import {
  messengerRoomShowsConfirmedDeliveryPresentation,
  messengerRoomShowsConfirmedTradePresentation,
  resolveMessengerDotMenuCallKind,
} from "@/lib/community-messenger/messenger-room-domain";
import { communityMessengerRoomIsGloballyUsable } from "@/lib/community-messenger/types";
import { roomShowsStoreOrderWindowHeader } from "@/lib/store-order-chat/messenger-delivery-room-header";
import { normalizeTradeChatCallPolicy } from "@/lib/trade/trade-chat-call-policy";
import { resolveRoomCallChoice, type RoomCallChoice } from "@/lib/community-messenger/call-ui/room-call-choice";

export type MessengerRoomCallChoiceVm = Pick<
  MessengerRoomPhase2ViewModel,
  "snapshot" | "isGroupRoom" | "isPrivateGroupRoom" | "roomUnavailable" | "outgoingDialLocked"
>;

/**
 * 방 안 통화 선택 판정 — 헤더 📞 · 방 안 통화 기록 말풍선 공용 (`resolveRoomCallChoice` 단일 정의).
 * 배달 방 판정·거래 글 통화 설정 읽기는 헤더가 쓰던 식 그대로 (매장 구매자 우회만 없앰).
 */
export function useMessengerRoomCallChoice(vm: MessengerRoomCallChoiceVm): RoomCallChoice {
  const { snapshot, isGroupRoom, isPrivateGroupRoom, roomUnavailable, outgoingDialLocked } = vm;
  return useMemo(() => {
    const room = snapshot.room;
    const deliveryWindow =
      roomShowsStoreOrderWindowHeader(room) ||
      messengerRoomShowsConfirmedDeliveryPresentation(room, snapshot.viewerUserId);
    const deliveryMeta = deliveryWindow ? resolveCommunityMessengerDeliveryContextMeta(room) : null;
    const storeOrderId = typeof deliveryMeta?.storeOrderId === "string" ? deliveryMeta.storeOrderId.trim() : "";
    const isDeliveryRoom = Boolean(deliveryMeta) && storeOrderId.length > 0;
    const isTradeRoom = messengerRoomShowsConfirmedTradePresentation(room, snapshot.viewerUserId);
    const peerUserId = (room.peerUserId ?? "").trim();
    return resolveRoomCallChoice({
      isGroupRoom: isGroupRoom || isPrivateGroupRoom,
      roomGloballyUsable: communityMessengerRoomIsGloballyUsable(room),
      callKind: resolveMessengerDotMenuCallKind(room, { isDeliveryRoom }),
      tradePolicy: isTradeRoom
        ? normalizeTradeChatCallPolicy(snapshot.tradeChatRoomDetail?.product?.tradeChatCallPolicy)
        : "none",
      storeVoiceCallsEnabled: deliveryMeta?.storeVoiceCallsEnabled,
      storeVideoCallsEnabled: deliveryMeta?.storeVideoCallsEnabled,
      directCallGate: snapshot.directCallGate ?? null,
      roomUnavailable,
      outgoingDialLocked,
      directMessageDenied: snapshot.directMessageDenied ?? null,
      blockedByMe: Boolean(peerUserId && snapshot.members.find((m) => m.id === peerUserId)?.blocked),
    });
  }, [isGroupRoom, isPrivateGroupRoom, outgoingDialLocked, roomUnavailable, snapshot]);
}
