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
 * 짧은 텍스트 1줄 (1:1 방 · 그룹 방 내 글) — virtual 초기 추정(실측은 measureElement).
 * P4 계산: 행 pb-1(4) + 묶음 간격 pt-1~3(평균 약 8) + 말풍선 py-2(16) + 본문 16px×1.35(21.6) + 여유(약 5) ≈ 55.
 * 이전 52 는 본문 14px(18.9) 기준. 1:1 은 P4 부터 상대 이름 줄이 없다.
 * 태블릿(본문 18px → 24.3)은 약 +2.7px 더 크지만 실측으로 보정.
 */
export const MESSENGER_SHORT_TEXT_ROW_ESTIMATE_PX = 55;

/**
 * 그룹 방 받은 글 — 묶음 첫 줄의 발신자 이름 줄 몫.
 * P4 계산: 이름 14px × leading-snug 1.375(19.25) + mb-[3px](3) ≈ 22. 행마다 묶음 위치를 모르므로 받은 글 전부에 더한다
 * (같은 사람 연속 글은 과대 추정 → measureElement 가 보정). 1:1 은 0.
 */
export const MESSENGER_GROUP_PEER_NAME_LINE_ESTIMATE_PX = 22;

/** 일반 system 한 줄 — P4 서비스 문구 13→14px(leading-5 고정) 반영 72→74 */
export const MESSENGER_SYSTEM_ROW_ESTIMATE_PX = 74;

export function estimateMessengerTimelineRowPx(
  message:
    | (Pick<CommunityMessengerMessage, "messageType" | "content" | "metadata"> & { isMine?: boolean })
    | undefined,
  opts?: { isGroupRoom?: boolean }
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
  /** 그룹 방 받은 글만 이름 줄 몫을 더한다 (1:1 은 이름 줄 없음 — P4) */
  const peerNameLine =
    opts?.isGroupRoom && message.isMine === false ? MESSENGER_GROUP_PEER_NAME_LINE_ESTIMATE_PX : 0;
  if (message.messageType === "image") return 220 + peerNameLine;
  const text = (message.content ?? "").trim();
  if (message.messageType === "text" && text.length > 0 && text.length <= 24) {
    return MESSENGER_SHORT_TEXT_ROW_ESTIMATE_PX + peerNameLine;
  }
  return MESSENGER_TIMELINE_VIRTUAL_ESTIMATE_PX + peerNameLine;
}
