/**
 * ARO-OPS-UX-002-B1R — Trade post hard-delete eligibility (row-level).
 * Sold / confirmed-buyer rows preserve trade evidence → blocked.
 * Other statuses may use existing POST /api/admin/posts/bulk-delete.
 */

export type TradePostHardDeleteBlocker =
  | "status_sold"
  | "has_sold_buyer"
  | "invalid_id"
  | "not_admin_deleted"
  | "has_reports"
  | "has_chats"
  | "has_promotions";

export type TradePostHardDeleteEligibilityInput = {
  id: string;
  status?: string | null;
  soldBuyerId?: string | null;
  /** 설계 v2 §F-1-4 (O-3): 관리자 삭제 상태인 글만 영구 삭제 */
  moderationState?: string | null;
  /** 연결된 신고·거래 채팅·홍보 수 — 하나라도 있으면 증거 보존을 위해 영구 삭제 불가 */
  reportCount?: number;
  chatCount?: number;
  promotionCount?: number;
};

export type TradePostHardDeleteEligibility = {
  id: string;
  eligible: boolean;
  blockers: TradePostHardDeleteBlocker[];
};

export function evaluateTradePostHardDeleteEligibility(
  input: TradePostHardDeleteEligibilityInput
): TradePostHardDeleteEligibility {
  const id = String(input.id ?? "").trim();
  const blockers: TradePostHardDeleteBlocker[] = [];
  if (!id) blockers.push("invalid_id");

  const status = String(input.status ?? "").trim().toLowerCase();
  if (status === "sold") blockers.push("status_sold");

  const soldBuyer = String(input.soldBuyerId ?? "").trim();
  if (soldBuyer) blockers.push("has_sold_buyer");

  if (input.moderationState !== undefined && input.moderationState !== "admin_deleted") {
    blockers.push("not_admin_deleted");
  }
  if ((input.reportCount ?? 0) > 0) blockers.push("has_reports");
  if ((input.chatCount ?? 0) > 0) blockers.push("has_chats");
  if ((input.promotionCount ?? 0) > 0) blockers.push("has_promotions");

  return {
    id,
    eligible: blockers.length === 0,
    blockers,
  };
}

export function tradePostHardDeleteBlockerLabel(
  blocker: TradePostHardDeleteBlocker,
  language: string | undefined
): string {
  const en = language === "en";
  switch (blocker) {
    case "status_sold":
      return en ? "Sold listing — trade evidence must be kept" : "판매완료 — 거래 증거 보존";
    case "has_sold_buyer":
      return en ? "Confirmed buyer present — hard delete blocked" : "판매 확정 구매자 있음 — 영구 삭제 불가";
    case "invalid_id":
      return en ? "Invalid post id" : "잘못된 게시물 ID";
    case "not_admin_deleted":
      return en ? "Delete the post first" : "먼저 삭제 처리된 글만 영구 삭제할 수 있습니다";
    case "has_reports":
      return en ? "Has reports — evidence kept" : "신고 기록 있음 — 증거 보존";
    case "has_chats":
      return en ? "Has trade chats — evidence kept" : "거래 채팅 있음 — 증거 보존";
    case "has_promotions":
      return en ? "Has promotion orders — records kept" : "홍보 주문 있음 — 기록 보존";
    default:
      return en ? "Blocked" : "차단됨";
  }
}

export function partitionTradePostsForHardDelete(
  rows: TradePostHardDeleteEligibilityInput[]
): {
  eligibleIds: string[];
  blocked: TradePostHardDeleteEligibility[];
} {
  const blocked: TradePostHardDeleteEligibility[] = [];
  const eligibleIds: string[] = [];
  for (const row of rows) {
    const e = evaluateTradePostHardDeleteEligibility(row);
    if (e.eligible) eligibleIds.push(e.id);
    else blocked.push(e);
  }
  return { eligibleIds, blocked };
}
