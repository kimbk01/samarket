/**
 * 사장님 화면 오류 문구 — 서버 문장을 **절대** 내보내지 않는 단일 통로 (언어 재감사 2026-11-27,
 * 설계 `docs/audit/i18n-full-reaudit-fix-design-2026-11-27.md` §4-1 「resolveOwnerApiErrorMessage 문장 → 기본 키」).
 *
 * - 코드 모양(`snake_case`)이면 이 파일 표 → `resolveOwnerApiErrorMessage` 표 순서로 키를 고른다.
 * - 두 표 모두에 없는 코드·문장·빈 값은 `fallbackKey`(화면 맥락의 일반 실패 문구).
 */
import type { MessageKey } from "@/lib/i18n/messages";
import type { ApiErrorCodeMap } from "@/lib/i18n/api-error-text";
import { resolveOwnerApiErrorMessage } from "@/lib/business/owner-api-error-i18n";

type TranslateFn = (key: MessageKey, vars?: Record<string, string | number>) => string;

const ERROR_CODE_SHAPE = /^[a-z][a-z0-9_]*$/;

/** `resolveOwnerApiErrorMessage` 표에 없는 사장님·라이더 API 코드 */
export const OWNER_EXTRA_API_ERROR_MAP: ApiErrorCodeMap = {
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
};

/** `resolveOwnerApiErrorMessage` 가 모르는 코드에 돌려주는 키 — 이때는 화면 맥락의 `fallbackKey` 를 쓴다 */
const OWNER_UNKNOWN_CODE_KEY: MessageKey = "business_phase7_426";

export function resolveOwnerApiErrorText(
  codeOrMessage: string | null | undefined,
  t: TranslateFn,
  fallbackKey: MessageKey = "common_error"
): string {
  const raw = typeof codeOrMessage === "string" ? codeOrMessage.trim() : "";
  if (!raw || !ERROR_CODE_SHAPE.test(raw)) return t(fallbackKey);
  const extra = OWNER_EXTRA_API_ERROR_MAP[raw];
  if (extra) return t(extra);
  const viaOwner = resolveOwnerApiErrorMessage(raw, t);
  if (viaOwner === t(OWNER_UNKNOWN_CODE_KEY)) return t(fallbackKey);
  return viaOwner;
}

/**
 * RSC 로더 오류(DB 원문이 섞일 수 있음) → 화면으로 넘길 코드.
 * 코드 모양이면 그대로, 문장·DB 원문이면 `db_error`(원문은 서버 로그만 — `ownerCatalogDbErrorResponse` 와 같은 규칙).
 */
export function toOwnerBootstrapErrorCode(error: string | null | undefined): string {
  const raw = typeof error === "string" ? error.trim() : "";
  if (ERROR_CODE_SHAPE.test(raw)) return raw;
  if (raw) console.error("[owner bootstrap]", raw);
  return "db_error";
}

/** 서버 `error` 가 코드 모양인지 — 문장·DB 원문이면 false (화면 상태에 넣지 않는다) */
export function isOwnerApiErrorCode(value: unknown): value is string {
  return typeof value === "string" && ERROR_CODE_SHAPE.test(value.trim());
}
