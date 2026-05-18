/**
 * AppLanguageProvider가 갱신하는 런타임 UI 언어.
 * React 밖(유틸·cmUi 등)에서 `t`/`useI18n` 대신 `translateText`가 필요할 때만 사용한다.
 * cookie/local/browser 직접 읽기 금지 — Provider state와 동기화된 값만 쓴다.
 */
import { APP_LANGUAGE_CHANGED_EVENT, FALLBACK_APP_LANGUAGE, type AppLanguageCode } from "./config";

let runtimeLanguage: AppLanguageCode = FALLBACK_APP_LANGUAGE;

export function getRuntimeAppLanguage(): AppLanguageCode {
  return runtimeLanguage;
}

export function setRuntimeAppLanguage(language: AppLanguageCode): void {
  runtimeLanguage = language;
}

export function subscribeRuntimeAppLanguage(
  listener: (language: AppLanguageCode) => void
): () => void {
  if (typeof window === "undefined") return () => undefined;
  const handler = (event: Event) => {
    const detail = (event as CustomEvent<AppLanguageCode | undefined>).detail;
    if (detail === "ko" || detail === "en") listener(detail);
  };
  window.addEventListener(APP_LANGUAGE_CHANGED_EVENT, handler as EventListener);
  return () => window.removeEventListener(APP_LANGUAGE_CHANGED_EVENT, handler as EventListener);
}
