import {
  parseExplicitAppLanguage,
  type AppLanguageCode,
  type StoredPreferredLanguage,
} from "@/lib/i18n/config";
import type { UserSettingsRow } from "@/lib/types/settings-db";

/**
 * GET /api/me/settings 응답 병합 — 서버가 null(기기 언어)인데 로컬에 명시 ko/en 이 있으면
 * PATCH 완료 전 원격 sync 가 선택을 지우지 않도록 유지한다.
 */
export function reconcilePreferredLanguageOnRemoteSync(input: {
  remotePreferredLanguage: unknown;
  localPreferredLanguage: unknown;
}): {
  preferredLanguage: StoredPreferredLanguage;
  shouldUploadToServer: AppLanguageCode | null;
} {
  const remoteExplicit = parseExplicitAppLanguage(input.remotePreferredLanguage);
  if (remoteExplicit) {
    return { preferredLanguage: remoteExplicit, shouldUploadToServer: null };
  }

  const localExplicit = parseExplicitAppLanguage(input.localPreferredLanguage);
  if (localExplicit) {
    return { preferredLanguage: localExplicit, shouldUploadToServer: localExplicit };
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
