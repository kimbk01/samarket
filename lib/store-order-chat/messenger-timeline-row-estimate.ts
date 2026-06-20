import type { CommunityMessengerMessage } from "@/lib/community-messenger/types";
import { MESSENGER_TIMELINE_VIRTUAL_ESTIMATE_PX } from "@/lib/community-messenger/room/messenger-room-ui-constants";
import { isStoreOrderSummarySystemContent } from "@/lib/store-order-chat/collapse-duplicate-order-summaries";

/** 주문 요약 카드(픽업·배달 영수증) — 가상 행 초기 추정 */
export const MESSENGER_STORE_ORDER_SUMMARY_ROW_ESTIMATE_PX = 520;

/** store_order 상태 system 한 줄 */
export const MESSENGER_STORE_ORDER_OPS_ROW_ESTIMATE_PX = 88;

/** 통화 내역(call_stub) — 일반 메시지 96px 추정 금지, 카톡/텔레그램형 compact event row */
export const MESSENGER_CALL_STUB_ROW_ESTIMATE_PX = 56;

export function estimateMessengerTimelineRowPx(
  message: Pick<CommunityMessengerMessage, "messageType" | "content" | "metadata"> | undefined
): number {
  if (!message) return MESSENGER_TIMELINE_VIRTUAL_ESTIMATE_PX;
  if (message.messageType === "call_stub") return MESSENGER_CALL_STUB_ROW_ESTIMATE_PX;
  if (message.messageType === "system") {
    const meta = message.metadata;
    if (meta?.domain === "store_order") {
      if (meta.kind === "store_order_summary" || isStoreOrderSummarySystemContent(message.content)) {
        return MESSENGER_STORE_ORDER_SUMMARY_ROW_ESTIMATE_PX;
      }
      return MESSENGER_STORE_ORDER_OPS_ROW_ESTIMATE_PX;
    }
    return 72;
  }
  if (message.messageType === "image") return 220;
  return MESSENGER_TIMELINE_VIRTUAL_ESTIMATE_PX;
}
