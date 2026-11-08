/**
 * ARO-OPS-UX-002-B1R — Trade post hard-delete eligibility (row-level).
 * Sold / confirmed-buyer rows preserve trade evidence → blocked.
 * Other statuses may use existing POST /api/admin/posts/bulk-delete.
 */

import { translate, type MessageKey } from "@/lib/i18n/messages";

/** 언어 SSOT B4 — 불리언 언어 값으로 카탈로그 문구를 고른다(원래 `ko ? "…" : "…"` 와 같은 결과). */
function tx(ko: unknown, key: MessageKey, vars?: Record<string, string | number>): string {
  return translate(ko ? "ko" : "en", key, vars);
}

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
  /** 연결된 신고·거래 채팅·상위노출 수 — 하나라도 있으면 증거 보존을 위해 영구 삭제 불가 */
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
      return tx(!en, "admin_posts_sold_listing_trade_evidence_must_be");
    case "has_sold_buyer":
      return tx(!en, "admin_posts_confirmed_buyer_present_hard_delete_blocked");
    case "invalid_id":
      return tx(!en, "admin_posts_invalid_post_id");
    case "not_admin_deleted":
      return tx(!en, "admin_posts_delete_the_post_first");
    case "has_reports":
      return tx(!en, "admin_posts_has_reports_evidence_kept");
    case "has_chats":
      return tx(!en, "admin_posts_has_trade_chats_evidence_kept");
    case "has_promotions":
      return tx(!en, "admin_posts_has_promotion_orders_records_kept");
    default:
      return tx(!en, "admin_posts_blocked");
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
