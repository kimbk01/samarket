/**
 * 프로필 저장·사진 올리기 오류 코드 → 화면 문구 (재감사 2026-11-27 P1 · `lib/i18n/api-error-text.ts`).
 * 서버 `PATCH /api/me/profile` · `POST /api/me/profile/avatar` 는 오류 코드만 보낸다.
 */
import {
  resolveApiErrorText,
  type ApiErrorCodeMap,
  type ApiErrorTranslate,
} from "@/lib/i18n/api-error-text";
import type { MessageKey } from "@/lib/i18n/messages";
import { PROFILE_CONFLICT_ERROR_CODE } from "@/lib/profile/profile-patch-concurrency";

export const PROFILE_SAVE_ERROR_KEYS: ApiErrorCodeMap = {
  login_required: "common_login_required",
  network_error: "common_network_error",
  nickname_too_short: "profile_edit_err_nickname_min",
  nickname_too_long: "profile_edit_err_nickname_max",
  nickname_taken: "profile_edit_err_nickname_taken",
  phone_change_via_verification: "profile_edit_err_phone_via_verification",
  avatar_url_not_allowed: "profile_edit_err_avatar_not_allowed",
  content_filter_blocked: "content_filter_blocked_message",
  [PROFILE_CONFLICT_ERROR_CODE]: "profile_edit_err_conflict",
  profile_not_found: "profile_edit_err_not_found",
  service_unavailable: "net_dibay_error",
  too_large: "profile_edit_err_photo_too_large",
  unsupported_type: "profile_edit_err_photo_type",
};

/** 저장 성공 경고 코드 → 문구 키 */
export const PROFILE_SAVE_WARNING_KEYS: Readonly<Record<string, MessageKey>> = {
  profile_location_not_saved: "profile_edit_warn_location_not_saved",
};

export function profileSaveErrorText(
  input: { code?: string | null; status?: number | null; json?: unknown },
  t: ApiErrorTranslate,
  fallbackKey: MessageKey = "profile_edit_save_failed"
): string {
  return resolveApiErrorText({ ...input, map: PROFILE_SAVE_ERROR_KEYS, fallbackKey, t });
}

export function profileSaveWarningText(code: string | null | undefined, t: ApiErrorTranslate): string | null {
  const key = code ? PROFILE_SAVE_WARNING_KEYS[code.trim()] : undefined;
  return key ? t(key) : null;
}
