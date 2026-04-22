import type { MessengerPolicyRoomType } from "@/lib/messenger-policy/messenger-policy-room-type";

export type TradeMessagingDenyCode =
  | "trade_product_chat_unlinked"
  | "trade_not_counterpart"
  | "trade_viewer_left_as_seller"
  | "trade_viewer_left_as_buyer"
  | "trade_seller_closed_buyer_blocked";

export type CanSendMessageResult =
  | { ok: true }
  | { ok: false; code: TradeMessagingDenyCode; message: string };

/** `product_chats` (또는 동일 의미 스냅샷) — 거래 방 전송 판정용 최소 필드 */
export type TradeProductChatExitSnapshot = {
  sellerId: string;
  buyerId: string;
  sellerLeftAt: string | null;
  buyerLeftAt: string | null;
};

/**
 * 거래 방이 아니면 호출자가 멤버십·room_status·is_readonly 를 이미 검증했다고 가정하고 ok.
 * 거래 방이면 `product_chats` 기준으로 판매자 종료 후 구매자 전송 차단 등을 적용한다.
 */
export function canSendMessageInRoom(input: {
  policyType: MessengerPolicyRoomType;
  viewerUserId: string;
  tradeProductChat: TradeProductChatExitSnapshot | null;
}): CanSendMessageResult {
  if (input.policyType !== "trade") {
    return { ok: true };
  }
  const pc = input.tradeProductChat;
  if (!pc) {
    return { ok: false, code: "trade_product_chat_unlinked", message: "거래 정보를 확인할 수 없습니다." };
  }
  const uid = input.viewerUserId.trim();
  const seller = pc.sellerId.trim();
  const buyer = pc.buyerId.trim();
  if (uid !== seller && uid !== buyer) {
    return { ok: false, code: "trade_not_counterpart", message: "참여자만 메시지를 보낼 수 있습니다." };
  }
  if (uid === seller && pc.sellerLeftAt) {
    return { ok: false, code: "trade_viewer_left_as_seller", message: "이미 나간 채팅방입니다." };
  }
  if (uid === buyer && pc.buyerLeftAt) {
    return { ok: false, code: "trade_viewer_left_as_buyer", message: "이미 나간 채팅방입니다." };
  }
  if (uid === buyer && pc.sellerLeftAt) {
    return {
      ok: false,
      code: "trade_seller_closed_buyer_blocked",
      message: "판매자가 대화를 종료했습니다. 새 메시지를 보낼 수 없습니다.",
    };
  }
  return { ok: true };
}
