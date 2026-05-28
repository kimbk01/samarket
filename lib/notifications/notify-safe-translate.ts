import type { AppLanguageCode } from "@/lib/i18n/config";
import type { MessageKey } from "@/lib/i18n/messages";
import {
  defaultUnavailableFallback,
  safeTranslate,
  safeTranslateText,
  type SafeTranslateOptions,
} from "@/lib/i18n/safe-translate";

/** 서버 인앱·푸시 알림 payload — key 원문 노출 방지 */
export function notifySafeT(
  language: AppLanguageCode,
  key: MessageKey,
  opts?: SafeTranslateOptions
): string {
  return safeTranslate(language, key, opts);
}

/** DB/API 에 저장된 title·body — key 문자열이면 번역, 아니면 그대로 */
export function resolveInboxNotificationDisplayText(
  language: AppLanguageCode,
  text: string | null | undefined,
  opts?: SafeTranslateOptions
): string {
  const s = (text ?? "").trim();
  if (!s) return defaultUnavailableFallback(language);
  return safeTranslateText(language, s, opts);
}
