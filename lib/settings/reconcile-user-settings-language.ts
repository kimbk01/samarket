import { normalizeLanguagePreferenceForStorage } from "@/lib/i18n/config";
import type { UserSettingsRow } from "@/lib/types/settings-db";

/**
 * GET/PATCH `/api/me/settings` 응답 병합 — **계정 언어는 서버 값이 기준** (`docs/i18n-ssot.md` §2).
 * 기기 값(localStorage)은 계정 값을 덮지 않는다. 미전송 토글은 `AppLanguageProvider` 가
 * `decideAccountLanguageSync`(pending) 로만 올린다.
 */
export function mergeUserSettingsPreferredLanguage(
  userId: string,
  remote: Partial<UserSettingsRow>,
  local: Partial<UserSettingsRow>
): { settings: Partial<UserSettingsRow> & { user_id: string } } {
  return {
    settings: {
      ...local,
      ...remote,
      user_id: userId,
      preferred_language: normalizeLanguagePreferenceForStorage(remote.preferred_language),
    },
  };
}
