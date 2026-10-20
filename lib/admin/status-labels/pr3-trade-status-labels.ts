/**
 * 거래 Admin 상태 라벨 (수정 계획 2-4) — 원시 상태 코드를 화면에 그대로 쓰지 않는다.
 * import 하면 등록된다 (부수효과). Client-safe.
 */

import { registerAdminStatusLabels } from "@/lib/admin/status-labels/admin-status-label-registry";

/** 거래 채팅 진행 상태 — `TradeFlowStatus` (lib/types/chat.ts). */
export const TRADE_FLOW_STATUS_NAMESPACE = "trade.flow";

registerAdminStatusLabels(TRADE_FLOW_STATUS_NAMESPACE, {
  chatting: { ko: "대화 중", en: "Chatting", tone: "info" },
  seller_marked_done: { ko: "판매자 완료 처리", en: "Seller marked done", tone: "info" },
  buyer_confirmed: { ko: "구매 확정", en: "Buyer confirmed", tone: "success" },
  review_pending: { ko: "후기 대기", en: "Review pending", tone: "neutral" },
  review_completed: { ko: "후기 완료", en: "Review completed", tone: "success" },
  dispute: { ko: "분쟁", en: "Dispute", tone: "danger" },
  cancelled: { ko: "취소", en: "Cancelled", tone: "neutral" },
  archived: { ko: "보관", en: "Archived", tone: "neutral" },
});
