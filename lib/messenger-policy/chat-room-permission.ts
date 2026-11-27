import type { MessengerPolicyRoomType } from "@/lib/messenger-policy/messenger-policy-room-type";

export type TradeMessagingDenyCode =
  | "trade_product_chat_unlinked"
  | "trade_not_counterpart"
  | "trade_viewer_left_as_seller"
  | "trade_viewer_left_as_buyer"
  | "trade_seller_closed_buyer_blocked"
  | "trade_chat_mode_locked"
  | "trade_flow_not_chatting";

export type CanSendMessageResult =
  | { ok: true }
  | { ok: false; code: TradeMessagingDenyCode; message: string };

/** `product_chats` (또는 동일 의미 스냅샷) — 거래 방 전송 판정용 최소 필드 */
export type TradeProductChatExitSnapshot = {
  sellerId: string;
  buyerId: string;
  sellerLeftAt: string | null;
  buyerLeftAt: string | null;
  /** 없으면 `chatting` 으로 간주 */
  tradeFlowStatus?: string | null;
  /** 없으면 `open` 으로 간주 */
  chatMode?: string | null;
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
    return { ok: false, code: "trade_product_chat_unlinked", message: "trade_product_chat_unlinked" };
  }
  const uid = input.viewerUserId.trim();
  const seller = pc.sellerId.trim();
  const buyer = pc.buyerId.trim();
  if (uid !== seller && uid !== buyer) {
    return { ok: false, code: "trade_not_counterpart", message: "trade_not_counterpart" };
  }
  const mode = String(pc.chatMode ?? "open").trim().toLowerCase() || "open";
  if (mode === "limited" || mode === "readonly") {
    return {
      ok: false,
      code: "trade_chat_mode_locked",
      message: "trade_chat_mode_locked",
    };
  }
  const flow = String(pc.tradeFlowStatus ?? "chatting").trim().toLowerCase() || "chatting";
  if (flow !== "chatting") {
    return {
      ok: false,
      code: "trade_flow_not_chatting",
      message: "trade_flow_not_chatting",
    };
  }
  if (uid === seller && pc.sellerLeftAt) {
    return { ok: false, code: "trade_viewer_left_as_seller", message: "trade_viewer_left_as_seller" };
  }
  if (uid === buyer && pc.buyerLeftAt) {
    return { ok: false, code: "trade_viewer_left_as_buyer", message: "trade_viewer_left_as_buyer" };
  }
  if (uid === buyer && pc.sellerLeftAt) {
    return {
      ok: false,
      code: "trade_seller_closed_buyer_blocked",
      message: "trade_seller_closed_buyer_blocked",
    };
  }
  return { ok: true };
}
