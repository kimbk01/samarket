/**
 * 거래 상위노출 — 글 상태 연동 이유 표시 (DB `paused_by`·`end_reason_code`, 트리거 `trade_promotion_sync_listing`).
 * 관리자 상위노출 목록·관리자 글 상세가 같은 표를 쓴다 (재감사 2026-11-04 B-5③).
 */
export const LISTING_PAUSE_LABELS: Record<string, string> = {
  listing_owner_hidden: "판매자가 글을 숨겨 멈춤",
  listing_admin_hidden: "관리자 숨김으로 멈춤",
};

export const LISTING_END_LABELS: Record<string, string> = {
  listing_sold: "글 판매완료로 종료",
  listing_owner_deleted: "판매자 글 삭제로 종료",
  listing_admin_deleted: "관리자 글 삭제로 종료",
};

/** 관리자 화면 한 줄 — 일시정지면 멈춘 이유, 종료면 끝난 이유, 없으면 null */
export function tradePromotionListingReasonLabel(row: {
  order_status?: string | null;
  paused_by?: string | null;
  end_reason_code?: string | null;
}): string | null {
  if (row.order_status === "paused" && row.paused_by) return LISTING_PAUSE_LABELS[row.paused_by] ?? null;
  if (row.end_reason_code) return LISTING_END_LABELS[row.end_reason_code] ?? null;
  return null;
}
