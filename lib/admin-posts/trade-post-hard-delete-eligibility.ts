/**
 * ARO-OPS-UX-002-B1R — Trade post hard-delete eligibility (row-level).
 * Sold / confirmed-buyer rows preserve trade evidence → blocked.
 * Other statuses may use existing POST /api/admin/posts/bulk-delete.
 */

export type TradePostHardDeleteBlocker =
  | "status_sold"
  | "has_sold_buyer"
  | "invalid_id";

export type TradePostHardDeleteEligibilityInput = {
  id: string;
  status?: string | null;
  soldBuyerId?: string | null;
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
