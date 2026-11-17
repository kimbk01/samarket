import type { CommunityMessengerMessage } from "@/lib/community-messenger/types";
import { MESSENGER_TIMELINE_VIRTUAL_ESTIMATE_PX } from "@/lib/community-messenger/room/messenger-room-ui-constants";
import { isStoreOrderSummarySystemContent } from "@/lib/store-order-chat/collapse-duplicate-order-summaries";

/** 주문 요약 카드(픽업·배달 영수증) — 가상 행 초기 추정 */
export const MESSENGER_STORE_ORDER_SUMMARY_ROW_ESTIMATE_PX = 520;

/** store_order 상태 system 한 줄 — P4 서비스 문구 12→14px(줄 높이 1.5) 반영 88→92 */
export const MESSENGER_STORE_ORDER_OPS_ROW_ESTIMATE_PX = 92;

/**
 * 통화 내역(call_stub) — compact event row + row wrapper pt/pb 포함 추정.
 * (min-h 40 pill + py-1.5 + pb-1 ≈ 52px; measureElement 로 보정)
 */
export const MESSENGER_CALL_STUB_ROW_ESTIMATE_PX = 52;

/**
 * 짧은 텍스트 1줄 — virtual 초기 추정(실측은 measureElement).
 * P4: 본문 14→16px(줄 높이 1.35 → 18.9→21.6px) 반영 52→55. 태블릿(본문 18)은 약 +2.7px 더 크지만 실측으로 보정.
 */
export const MESSENGER_SHORT_TEXT_ROW_ESTIMATE_PX = 55;

/** 일반 system 한 줄 — P4 서비스 문구 13→14px(leading-5 고정) 반영 72→74 */
export const MESSENGER_SYSTEM_ROW_ESTIMATE_PX = 74;

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
    return MESSENGER_SYSTEM_ROW_ESTIMATE_PX;
  }
  if (message.messageType === "image") return 220;
  const text = (message.content ?? "").trim();
  if (message.messageType === "text" && text.length > 0 && text.length <= 24) {
    return MESSENGER_SHORT_TEXT_ROW_ESTIMATE_PX;
  }
  return MESSENGER_TIMELINE_VIRTUAL_ESTIMATE_PX;
}
