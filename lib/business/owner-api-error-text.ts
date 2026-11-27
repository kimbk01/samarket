/**
 * 사장님 화면 오류 문구 — 서버 문장을 **절대** 내보내지 않는 단일 통로 (언어 재감사 2026-11-27,
 * 설계 `docs/audit/i18n-full-reaudit-fix-design-2026-11-27.md` §4-1 「resolveOwnerApiErrorMessage 문장 → 기본 키」).
 *
 * 사후 검토 D1 (2026-11-27 · `docs/audit/i18n-postmerge-fix-design-2026-11-27.md` §2): 사장님 오류 경로는 이 파일 하나다.
 * 표 하나(`OWNER_API_ERROR_MAP`) → 공통 표 → `fallbackKey` 순서(`resolveApiErrorText`). 번역 결과를 비교해 판정하지 않는다.
 * - 코드 모양(`snake_case`)이 아닌 값(문장·DB 원문)·빈 값은 `fallbackKey`(화면 맥락의 일반 실패 문구).
 * - 값은 서버 `params` 로 받는다(E2 상품 한도 숫자 등).
 */
import type { MessageKey } from "@/lib/i18n/messages";
import {
  apiErrorCodeKey,
  isApiErrorCode,
  type ApiErrorCodeMap,
  type ApiErrorTranslate,
} from "@/lib/i18n/api-error-text";

/** 사장님·비즈·라이더 API 오류 코드 → 키 (옛 `owner-api-error-i18n.ts` 표와 합침) */
export const OWNER_API_ERROR_MAP: ApiErrorCodeMap = {
  network_error: "common_network_error",
  load_failed: "business_phase7_353",
  review_load_failed: "business_phase7_353",
  save_failed: "business_phase7_368",
  /** PRD-15 — 오너 상품·카테고리 500 응답 고정 코드 (DB 원문 미노출) */
  db_error: "business_phase7_368",
  upload_failed: "business_phase7_440",
  /** IMG-02 — 업로드 상한 초과(서버 413 · 함수 앞단 비 JSON 413 · 클라이언트 압축 실패) */
  file_too_large: "business_image_upload_too_large",
  reply_failed: "business_phase7_368",
  delete_reply_failed: "business_phase7_352",
  delete_failed: "business_phase7_352",
  unauthorized: "common_login_required",
  missing_ids: "store_owner_order_not_found",
  order_not_found: "store_owner_order_not_found",
  order_lookup_failed: "store_owner_order_not_found",
  review_not_found: "store_owner_order_review_unavailable",
  table_missing: "store_owner_order_review_unavailable",
  account_inquiry_required: "store_owner_point_err_account_inquiry_required",
  account_inquiry_not_answered: "store_owner_point_err_account_inquiry_not_answered",
  charge_already_pending: "store_owner_point_err_charge_already_pending",
  account_inquiry_already_open: "store_owner_point_err_account_inquiry_already_open",
  platform_inquiries_table_missing: "store_owner_point_err_platform_unavailable",
  store_point_charge_table_missing: "store_owner_point_err_platform_unavailable",
  point_amount_required: "store_owner_point_err_point_amount_required",
  depositor_name_required: "store_owner_point_err_depositor_name_required",
  subject_and_content_required: "store_owner_point_err_subject_required",
  // OPS-01 — store_notices 테이블 부재(503)
  store_notices_unavailable: "business_ops3b_err_notices_unavailable",
  ios_digital_purchase_unavailable: "owner_ios_cash_purchase_unavailable",
  forbidden: "common_api_forbidden",
  store_not_found: "store_not_found_short",
  missing_store_id: "store_not_found_short",
  store_suspended: "business_phase7_227",
  store_not_approved: "store_sales_not_open_order_blocked",
  content_filter_blocked: "content_filter_blocked_message",
  not_found: "common_content_unavailable",
  /** 사장님 상품 저장·사진 올리기 (서버 `message` 문장 제거 — 2026-11-27) */
  invalid_discount_price: "owner_product_err_discount_not_lower",
  product_changed: "owner_product_err_changed_elsewhere",
  detail_image_overlaps_thumbnail: "owner_product_err_detail_same_as_main",
  image_dimension_too_large: "owner_product_err_image_too_big_px",
  image_dimension_invalid: "owner_product_err_image_size_unknown",
  storage_bucket_missing: "owner_product_err_upload_unavailable",
  invalid_type: "owner_product_err_image_type",
  file_required: "owner_product_err_image_required",
  /** E2 사후 검토 2026-11-27 — 상품 등록·수정 검사 코드(`products-core.server.ts`). 한도 숫자는 `params.max` */
  title_required: "business_phase7_354",
  invalid_price: "business_phase7_356",
  invalid_category_id: "business_phase7_365",
  title_too_long: "store_owner_prd_title_too_long",
  summary_too_long: "store_owner_prd_summary_too_long",
  price_too_large: "store_owner_prd_price_too_large",
  stock_too_large: "store_owner_prd_stock_too_large",
  invalid_stock: "owner_product_err_invalid_stock",
  invalid_discount_percent: "owner_product_err_invalid_discount_percent",
  invalid_discount_for_price: "owner_product_err_discount_for_price",
  price_required_for_discount_percent: "owner_product_err_price_required_for_discount",
  invalid_item_type: "owner_product_err_invalid_item_type",
};

/**
 * 사장님 API 오류 코드 → 문구. 표에 없는 코드·문장·빈 값은 `fallbackKey`.
 * `params` = 서버 응답 `params`(숫자·문자열 — `pickApiErrorParams`).
 */
export function resolveOwnerApiErrorText(
  codeOrMessage: string | null | undefined,
  t: ApiErrorTranslate,
  fallbackKey: MessageKey = "common_error",
  params?: Record<string, string | number>
): string {
  if (!isApiErrorCode(codeOrMessage)) return t(fallbackKey);
  const key = apiErrorCodeKey(codeOrMessage.trim(), OWNER_API_ERROR_MAP);
  return key ? t(key, params) : t(fallbackKey);
}

/**
 * 옛 `resolveOwnerApiErrorMessage`(owner-api-error-i18n) 호출처용 — 같은 표, 모르는 값은 「처리 실패」(`business_phase7_426`),
 * 빈 값은 `common_error`.
 */
export function resolveOwnerApiErrorMessage(codeOrMessage: string | null | undefined, t: ApiErrorTranslate): string {
  const raw = typeof codeOrMessage === "string" ? codeOrMessage.trim() : "";
  if (!raw) return t("common_error");
  return resolveOwnerApiErrorText(raw, t, "business_phase7_426");
}

/**
 * RSC 로더 오류(DB 원문이 섞일 수 있음) → 화면으로 넘길 코드.
 * 코드 모양이면 그대로, 문장·DB 원문이면 `db_error`(원문은 서버 로그만 — `ownerCatalogDbErrorResponse` 와 같은 규칙).
 */
export function toOwnerBootstrapErrorCode(error: string | null | undefined): string {
  const raw = typeof error === "string" ? error.trim() : "";
  if (isApiErrorCode(raw)) return raw;
  if (raw) console.error("[owner bootstrap]", raw);
  return "db_error";
}

/** 서버 `error` 가 코드 모양인지 — 문장·DB 원문이면 false (화면 상태에 넣지 않는다) */
export function isOwnerApiErrorCode(value: unknown): value is string {
  return isApiErrorCode(value);
}
