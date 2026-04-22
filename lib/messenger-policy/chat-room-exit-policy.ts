import type { MessengerPolicyRoomType } from "@/lib/messenger-policy/messenger-policy-room-type";
import type { TradeProductChatExitSnapshot } from "@/lib/messenger-policy/chat-room-permission";

export type RoomUiTradeBannerKind = "none" | "seller_closed_buyer";

export type GetRoomUiStateAfterLeaveInput = {
  policyType: MessengerPolicyRoomType;
  viewerUserId: string;
  tradeProductChat: TradeProductChatExitSnapshot | null;
};

/**
 * 방 UI(입력창·배너) — 서버 스냅샷과 동일 규칙으로 클라에서도 복제 가능한 순수 함수.
 */
export function getRoomUiStateAfterLeave(input: GetRoomUiStateAfterLeaveInput): {
  canSendMessage: boolean;
  tradeBanner: RoomUiTradeBannerKind;
} {
  const { policyType, viewerUserId, tradeProductChat } = input;
  if (policyType !== "trade" || !tradeProductChat) {
    return { canSendMessage: true, tradeBanner: "none" };
  }
  const uid = viewerUserId.trim();
  const buyer = tradeProductChat.buyerId.trim();
  const sellerLeft = Boolean(tradeProductChat.sellerLeftAt);
  if (uid === buyer && sellerLeft) {
    return { canSendMessage: false, tradeBanner: "seller_closed_buyer" };
  }
  return { canSendMessage: true, tradeBanner: "none" };
}

/** 친구 기반 재활성 등 확장용 — 현재는 구조만 유지 */
export type LeaveChatRoomReopenHint = "none" | "friend_gate_pending";

export type LeaveChatRoomPolicyMeta = {
  reopenHint: LeaveChatRoomReopenHint;
};

export function leavePolicyMetaForRoom(policyType: MessengerPolicyRoomType): LeaveChatRoomPolicyMeta {
  if (policyType === "direct") {
    return { reopenHint: "friend_gate_pending" };
  }
  return { reopenHint: "none" };
}
