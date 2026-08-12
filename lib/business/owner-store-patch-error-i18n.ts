import type { AppLanguageCode } from "@/lib/i18n/config";
import { translate, type MessageKey } from "@/lib/i18n/messages";

const PATCH_ERR_KEYS: Record<string, MessageKey> = {
  no_fields: "business_phase7_496",
  store_not_editable: "business_phase7_497",
  store_load_failed: "business_phase7_498",
  invalid_ph_phone: "business_phase7_499",
  supabase_unconfigured: "business_phase7_500",
  unauthorized: "common_login_required",
  forbidden: "business_phase7_501",
  store_not_found: "business_phase7_502",
  update_no_row: "business_phase7_503",
  invalid_store_category_id: "business_phase7_504",
  invalid_store_topic_id: "business_phase7_505",
  store_topic_not_found: "business_phase7_506",
  store_topic_category_mismatch: "business_phase7_507",
  store_name_too_short: "business_phase7_508",
  invalid_business_hours_json: "business_phase7_509",
  invalid_gallery_images_json: "business_phase7_510",
  invalid_lat: "business_phase7_511",
  invalid_lng: "business_phase7_512",
  store_location_inconsistent: "addr_ui_store_location_inconsistent",
};

const TZ_LABEL_KEYS: Record<string, MessageKey> = {
  "Asia/Manila": "business_phase7_575",
  "Asia/Seoul": "business_phase7_576",
  "Asia/Tokyo": "business_phase7_577",
  UTC: "business_phase7_578",
};

export function formatOwnerStorePatchError(code: string, lang: AppLanguageCode): string | null {
  const key = PATCH_ERR_KEYS[code];
  return key ? translate(lang, key) : null;
}

export function formatOwnerStorePatchErrorOrCode(code: string, lang: AppLanguageCode): string {
  return formatOwnerStorePatchError(code, lang) ?? code;
}

export function formatOwnerStoreImageUploadError(
  payload: { message?: unknown; error?: unknown },
  lang: AppLanguageCode,
): string {
  if (typeof payload.message === "string" && payload.message.trim()) {
    return payload.message.trim();
  }
  if (payload.error === "storage_bucket_missing") {
    return translate(lang, "business_phase7_449");
  }
  if (typeof payload.error === "string" && payload.error.trim()) {
    return payload.error.trim();
  }
  return translate(lang, "business_phase7_440");
}

export function ownerStoreTimezoneLabel(lang: AppLanguageCode, tz: string): string {
  const key = TZ_LABEL_KEYS[tz];
  return key ? translate(lang, key) : tz;
}

/** 클라이언트 폼 검증 — PATCH 코드와 별도 */
export const OWNER_STORE_FORM_MSG = {
  selectTopic: "business_phase7_513",
  addressListFailed: "business_phase7_514",
  coordsBothOrNone: "business_phase7_515",
  coordsRangeInvalid: "business_phase7_516",
  saveFailed: "business_phase7_517",
  networkError: "business_phase7_518",
  saveProcessError: "business_phase7_519",
  saveResponseInvalid: "business_phase7_520",
  imageUploadBusy: "business_phase7_521",
  autoHoursTimeRequired: "business_phase7_522",
  breakHoursRequired: "business_phase7_523",
  courierRequired: "business_phase7_524",
  freeDeliveryStrikeRequired: "business_phase7_525",
  galleryMax: "business_phase7_526",
  invalidPhPhone: "business_phase7_499",
  storeNameTooShort: "business_phase7_508",
} as const satisfies Record<string, MessageKey>;
