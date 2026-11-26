/**
 * 상위노출 결제 실패 → 안내 문구 단일 정의 (광고 감사 TB-05 · 2026-11-26).
 *
 * 서버(`POST /api/me/points/promotion-orders`)는 오류 코드만 돌려준다.
 * 결제 화면 4곳(거래 광고 창 · 커뮤니티 결제 창 · 포인트 상위노출 · 내 광고 신청)이 이 함수 하나로 문구를 고른다.
 * 예전에는 화면마다 가격·잔액·중복 3가지만 구분하고 나머지(판매완료 글·남의 글·꺼진 상품)는 「실패」 한 줄이었다.
 */
import type { MessageKey } from "@/lib/i18n/messages";

export function promotionPurchaseErrorKey(payload: { error?: string | null; code?: string | null } | null | undefined): MessageKey {
  const code = String(payload?.error ?? payload?.code ?? "").trim();
  if (payload?.code === "insufficient_balance") return "points_ui_insufficient";
  switch (code) {
    case "price_changed":
      return "promo_price_changed";
    case "insufficient_balance":
      return "points_ui_insufficient";
    case "already_active_promotion":
      return "points_ui_promotion_conflict";
    case "target_unavailable":
      return "promo_err_target_unavailable";
    case "forbidden":
      return "promo_err_forbidden";
    case "target_not_found":
      return "promo_err_target_not_found";
    case "invalid_product":
    case "product_not_found":
    case "unsupported_target_type":
      return "promo_err_invalid_product";
    default:
      return "promo_sheet_purchase_failed";
  }
}
