/**
 * 판매자 본인 글 API(`/api/posts/[postId]/owner-delete`·`owner-edit`·`owner-status`·`owner-trade-update`) 오류 코드 → 화면 문구.
 * 언어 재감사 2026-11-27 (설계 `docs/audit/i18n-full-reaudit-fix-design-2026-11-27.md` §4-1) — 서버는 `{ ok:false, error:<code>, code:<code> }` 만 보낸다.
 * 화면은 `resolveOwnerPostApiErrorText` 로만 그린다(서버 문장 노출 0).
 */
import type { MessageKey } from "@/lib/i18n/messages";
import { resolveApiErrorText, type ApiErrorCodeMap, type ApiErrorTranslate } from "@/lib/i18n/api-error-text";

export const OWNER_POST_API_ERROR_MAP: ApiErrorCodeMap = {
  server_unconfigured: "common_content_unavailable",
  post_id_required: "common_product_not_found",
  post_lookup_failed: "post_error_load_failed_title",
  post_load_failed: "post_error_load_failed_title",
  post_not_found: "common_product_not_found",
  not_owner: "owner_post_err_not_owner",
  delete_not_allowed: "owner_post_err_delete_not_allowed",
  delete_failed: "trade_detail_delete_failed",
  save_failed: "common_save_failed",
  invalid_json: "common_error",
  invalid_status: "trade_detail_owner_action_failed",
  category_missing: "ui_product_edit_category_missing",
  trade_lifecycle_locked: "ui_post_owner_edit_locked_default",
  trade_edit_restricted: "ui_post_owner_edit_locked_default",
  trade_lgu_id_invalid: "owner_post_err_location_invalid",
  trade_photo_required: "trade_write_err_photo_required",
  price_invalid: "owner_post_err_price_invalid",
  content_filter_blocked: "content_filter_blocked_message",
  sold_is_final: "owner_post_err_sold_is_final",
  reserved_not_supported: "owner_post_err_reserved_not_supported",
  sold_requires_seller_complete: "owner_post_err_sold_requires_seller_complete",
  admin_hidden: "ui_post_owner_locked_admin",
  owner_deleted: "owner_post_err_owner_deleted",
  phone_verification_required: "owner_post_err_phone_verification_required",
  member_action_restricted: "common_api_forbidden",
};

export function resolveOwnerPostApiErrorText(input: {
  json?: unknown;
  code?: string | null;
  status?: number | null;
  fallbackKey: MessageKey;
  t: ApiErrorTranslate;
}): string {
  return resolveApiErrorText({ ...input, map: OWNER_POST_API_ERROR_MAP });
}
