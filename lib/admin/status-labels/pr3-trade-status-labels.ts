/**
 * 거래 Admin 상태 라벨 (수정 계획 2-4) — 원시 상태 코드를 화면에 그대로 쓰지 않는다.
 * import 하면 등록된다 (부수효과). Client-safe.
 */

import { registerAdminStatusLabels } from "@/lib/admin/status-labels/admin-status-label-registry";
import { catalogPair } from "@/lib/i18n/catalog-pair";

/** 거래 채팅 진행 상태 — `TradeFlowStatus` (lib/types/chat.ts). */
export const TRADE_FLOW_STATUS_NAMESPACE = "trade.flow";

registerAdminStatusLabels(TRADE_FLOW_STATUS_NAMESPACE, {
  chatting: { ...catalogPair("admin_trade_flow_status_chatting"), tone: "info" },
  seller_marked_done: { ...catalogPair("admin_seller_marked_done"), tone: "info" },
  buyer_confirmed: { ...catalogPair("admin_buyer_confirmed"), tone: "success" },
  review_pending: { ...catalogPair("admin_trade_flow_status_review_pending"), tone: "neutral" },
  review_completed: { ...catalogPair("admin_trade_flow_status_review_completed"), tone: "success" },
  dispute: { ...catalogPair("admin_trade_flow_status_dispute"), tone: "danger" },
  cancelled: { ...catalogPair("admin_cancelled_3"), tone: "neutral" },
  archived: { ...catalogPair("admin_trade_flow_status_archived"), tone: "neutral" },
});
