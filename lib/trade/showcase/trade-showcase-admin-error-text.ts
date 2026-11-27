/**
 * 관리자 거래 샘플(`/api/admin/trade/showcase`) 저장 오류 코드 → 화면 문구 (재감사 2026-11-27 · `lib/i18n/api-error-text.ts`).
 * 서버 `error` 가 문장(DB 원문 등)이면 코드 모양이 아니므로 표에 걸리지 않고 기본 문구로 그린다 — 서버 문장 노출 0.
 */
import { resolveApiErrorText, type ApiErrorCodeMap, type ApiErrorTranslate } from "@/lib/i18n/api-error-text";

/** `parseTradeShowcaseInput`(trade-showcase-model.ts) · 라우트 오류 코드 */
export const TRADE_SHOWCASE_ADMIN_SAVE_ERROR_KEYS: ApiErrorCodeMap = {
  invalid_body: "reaudit_trade_err_invalid_request",
  title_required: "ui_product_err_title",
  invalid_price: "ui_product_err_price",
  invalid_category: "ui_product_err_category",
  too_many_images: "reaudit_trade_showcase_err_too_many_images",
  table_missing: "admin_trade_showcase_table_missing",
  insert_failed: "admin_trade_showcase_save_failed",
  update_failed: "admin_trade_showcase_save_failed",
};

export function tradeShowcaseAdminSaveErrorText(
  input: { json?: unknown; status?: number | null },
  t: ApiErrorTranslate
): string {
  return resolveApiErrorText({
    ...input,
    map: TRADE_SHOWCASE_ADMIN_SAVE_ERROR_KEYS,
    fallbackKey: "admin_trade_showcase_save_failed",
    t,
  });
}
