import {
  parseExplicitAppLanguage,
  type AppLanguageCode,
  type StoredPreferredLanguage,
} from "@/lib/i18n/config";
import { readExplicitLocalLanguage } from "@/lib/i18n/language-preference";
import type { UserSettingsRow } from "@/lib/types/settings-db";

/**
 * GET /api/me/settings 응답 병합.
 * - 서버 null + 로컬 명시 ko/en → 로컬 유지·업로드
 * - 서버·로컬 모두 명시인데 다르면 **로컬(내정보·setLanguage 직후)** 우선·업로드
 */
export function reconcilePreferredLanguageOnRemoteSync(input: {
  remotePreferredLanguage: unknown;
  localPreferredLanguage: unknown;
  /** `samarket_app_language` — kasama_user_settings 캐시보다 우선 */
  persistedAppLanguage?: unknown;
}): {
  preferredLanguage: StoredPreferredLanguage;
  shouldUploadToServer: AppLanguageCode | null;
} {
  const remoteExplicit = parseExplicitAppLanguage(input.remotePreferredLanguage);
  const localExplicit =
    parseExplicitAppLanguage(input.persistedAppLanguage) ??
    parseExplicitAppLanguage(input.localPreferredLanguage);

  if (localExplicit && remoteExplicit) {
    if (localExplicit === remoteExplicit) {
      return { preferredLanguage: localExplicit, shouldUploadToServer: null };
    }
    return { preferredLanguage: localExplicit, shouldUploadToServer: localExplicit };
  }

  if (localExplicit) {
    return { preferredLanguage: localExplicit, shouldUploadToServer: localExplicit };
  }

  if (remoteExplicit) {
    return { preferredLanguage: remoteExplicit, shouldUploadToServer: null };
  }

  return { preferredLanguage: null, shouldUploadToServer: null };
}

export function mergeUserSettingsPreferredLanguage(
  userId: string,
  remote: Partial<UserSettingsRow>,
  local: Partial<UserSettingsRow>
): { settings: Partial<UserSettingsRow> & { user_id: string }; shouldUploadToServer: AppLanguageCode | null } {
  const { preferredLanguage, shouldUploadToServer } = reconcilePreferredLanguageOnRemoteSync({
    remotePreferredLanguage: remote.preferred_language,
    localPreferredLanguage: local.preferred_language,
    persistedAppLanguage: readExplicitLocalLanguage(),
  });
  return {
    settings: {
      ...local,
      ...remote,
      user_id: userId,
      preferred_language: preferredLanguage,
    },
    shouldUploadToServer,
  };
}
