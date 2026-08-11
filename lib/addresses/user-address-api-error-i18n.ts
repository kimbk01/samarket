/**
 * 주소 API·목록 fetch `error` 문자열 → i18n (단일 매핑 — 화면마다 alert/setErr 분기 금지).
 *
 * CONTRACT: 서버는 가능한 한 **코드**만 반환(`user-address-service`, `/api/me/addresses`).
 * DO NOT: `describeMeAddressesListFailure` / alert / setErr 에서 코드별 분기를 새로 추가하지 말 것.
 */

import type { MessageKey } from "@/lib/i18n/messages";
import type { MeAddressesListFetchResult } from "@/lib/addresses/address-list-client-cache";

/** `validatePlacesAddressPayload` · 서비스 · API 공통 코드 */
export const USER_ADDRESS_API_ERROR_CODES = {
  login_required: "login_required",
  invalid_response: "invalid_response",
  user_addresses_table_missing: "user_addresses_table_missing",
  network_error: "network_error",
  load_failed: "load_failed",
  place_id_required: "place_id_required",
  formatted_address_required: "formatted_address_required",
  coordinates_required: "coordinates_required",
  coordinates_invalid: "coordinates_invalid",
  detail_address_required: "detail_address_required",
  nickname_required: "nickname_required",
  nickname_reserved_format: "nickname_reserved_format",
  nickname_duplicate: "nickname_duplicate",
  address_not_found: "address_not_found",
  use_case_required: "use_case_required",
  store_cannot_be_master: "store_cannot_be_master",
  last_address_cannot_delete: "last_address_cannot_delete",
  update_failed: "update_failed",
  delete_failed: "delete_failed",
  set_default_failed: "set_default_failed",
  not_found: "not_found",
  invalid_payload: "invalid_payload",
  invalid_json: "invalid_json",
  empty_patch: "empty_patch",
  missing_id: "missing_id",
  supabase_unconfigured: "supabase_unconfigured",
  default_flag_conflict: "default_flag_conflict",
  create_failed: "create_failed",
  address_invalid: "address_invalid",
  address_default_conflict: "address_default_conflict",
  address_detail_required: "address_detail_required",
  address_create_failed: "address_create_failed",
  address_update_failed: "address_update_failed",
  address_delete_failed: "address_delete_failed",
  address_set_master_failed: "address_set_master_failed",
  shop_address_duplicate: "shop_address_duplicate",
  shop_store_required: "shop_store_required",
  shop_owner_required: "shop_owner_required",
  shop_place_required: "shop_place_required",
} as const;

export type UserAddressApiErrorCode = keyof typeof USER_ADDRESS_API_ERROR_CODES;

const ERROR_I18N_KEYS: Record<string, MessageKey> = {
  login_required: "addr_ui_list_err_login_required",
  invalid_response: "addr_ui_list_err_invalid_response",
  user_addresses_table_missing: "addr_ui_table_missing",
  network_error: "addr_ui_list_err_network",
  load_failed: "address_load_failed",
  place_id_required: "addr_ui_no_place_id",
  formatted_address_required: "addr_ui_pick_search_result",
  coordinates_required: "addr_ui_coords_retry",
  coordinates_invalid: "addr_ui_coords_invalid",
  detail_address_required: "addr_ui_detail_required",
  nickname_required: "addr_ui_custom_name_required",
  nickname_reserved_format: "addr_ui_name_invalid",
  nickname_duplicate: "addr_ui_api_nickname_duplicate",
  address_not_found: "addr_ui_api_address_not_found",
  not_found: "addr_ui_api_address_not_found",
  use_case_required: "addr_ui_api_use_case_required",
  store_cannot_be_master: "addr_ui_store_not_master",
  last_address_cannot_delete: "addr_ui_api_last_address_cannot_delete",
  update_failed: "addr_ui_save_failed",
  delete_failed: "address_delete_failed",
  set_default_failed: "addr_ui_set_default_failed",
  invalid_payload: "addr_ui_api_invalid_payload",
  invalid_json: "addr_ui_api_invalid_payload",
  empty_patch: "addr_ui_api_invalid_payload",
  missing_id: "addr_ui_api_invalid_payload",
  supabase_unconfigured: "addr_ui_api_supabase_unconfigured",
  default_flag_conflict: "addr_ui_save_failed",
  create_failed: "addr_ui_save_failed",
  address_invalid: "addr_ui_api_invalid_payload",
  address_default_conflict: "addr_ui_save_failed",
  address_detail_required: "addr_ui_detail_required",
  address_create_failed: "addr_ui_save_failed",
  address_update_failed: "addr_ui_save_failed",
  address_delete_failed: "address_delete_failed",
  address_set_master_failed: "addr_ui_set_default_failed",
  shop_address_duplicate: "addr_ui_shop_address_duplicate",
  shop_store_required: "addr_ui_pick_shop",
  shop_owner_required: "addr_ui_store_permission",
  shop_place_required: "addr_ui_store_no_place",
};

/** 구버전 서버가 한국어 문장을 그대로 내려줄 때(배포 전후 호환) */
const LEGACY_KO_ERROR_KEYS: Record<string, MessageKey> = {
  "로그인이 필요합니다.": "addr_ui_list_err_login_required",
  "주소 이름을 입력 하세요": "addr_ui_custom_name_required",
  "예약된 주소 이름 형식입니다. 다른 이름을 입력해 주세요.": "addr_ui_name_invalid",
  "이미 같은 이름의 주소가 있어요.": "addr_ui_api_nickname_duplicate",
  "주소를 찾을 수 없습니다.": "addr_ui_api_address_not_found",
  "생활·거래·배달 중 최소 한 가지 용도를 선택해 주세요.": "addr_ui_api_use_case_required",
  "매장 연결 주소는 대표 주소로 둘 수 없어요. 우리집·회사 등 일반 주소를 대표로 지정해 주세요.":
    "addr_ui_store_not_master",
  "마지막 주소는 삭제할 수 없습니다. 새 주소를 추가한 뒤 삭제해 주세요.":
    "addr_ui_api_last_address_cannot_delete",
  /** Xiaomi 사용자 보고 문구. 현재 소스·APK·prod chunk 에는 없음. 구버전 raw error 호환. */
  "주소 추가시 문제가 발생했습니다": "addr_ui_save_failed",
  "매장을 선택해 주세요.": "addr_ui_pick_shop",
  "승인된 매장 오너만 Store Address를 등록할 수 있습니다.": "addr_ui_store_permission",
  "검색 결과에서 매장 주소를 선택해 주세요.": "addr_ui_store_no_place",
};

export function translateUserAddressApiError(
  error: string | null | undefined,
  translate: (key: MessageKey) => string,
  fallbackKey: MessageKey = "common_error",
): string {
  const code = (error ?? "").trim();
  if (!code) return translate(fallbackKey);
  const key = ERROR_I18N_KEYS[code] ?? LEGACY_KO_ERROR_KEYS[code];
  if (key) return translate(key);
  return translate(fallbackKey);
}

/** API JSON `error` — known codes only. Raw Postgres/text never leaves the route. */
export function toPublicUserAddressApiError(raw: string, fallback: string): string {
  const code = raw.trim();
  if (!code) return fallback;
  if (code in ERROR_I18N_KEYS || code in USER_ADDRESS_API_ERROR_CODES) return code;
  return fallback;
}

/** 마이그레이션 안내 블록 — `error` 코드 기준(번역문과 분리) */
export function shouldShowMeAddressesListMigrationHint(result: MeAddressesListFetchResult): boolean {
  if (result.error === USER_ADDRESS_API_ERROR_CODES.user_addresses_table_missing) return true;
  const err = result.error ?? "";
  return /(user_addresses|relation|schema cache|table_missing|마이그레이션)/i.test(err);
}

/** `fetchMeAddressesListSingleFlight` 실패 시 사용자 표시용 메시지 */
export function describeMeAddressesListFailure(
  result: MeAddressesListFetchResult,
  translate: (key: MessageKey) => string,
  fallbackKey: MessageKey = "address_load_failed",
): string {
  if (result.status === 401 || result.error === USER_ADDRESS_API_ERROR_CODES.login_required) {
    return translate("addr_ui_list_err_login_required");
  }
  if (result.error === USER_ADDRESS_API_ERROR_CODES.network_error) {
    return translate("addr_ui_list_err_network");
  }
  return translateUserAddressApiError(result.error, translate, fallbackKey);
}
