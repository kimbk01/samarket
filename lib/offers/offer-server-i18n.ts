import { DEFAULT_APP_LANGUAGE, type AppLanguageCode } from "@/lib/i18n/config";
import { translate, type MessageKey } from "@/lib/i18n/messages";

/** 요청 처리 중 서버 문구(채팅 시스템 메시지·오류) — 받는 사람이 없는 문장. 알림은 `offerNotifyT` 를 쓴다. */
export function offerServerT(key: MessageKey, vars?: Record<string, string | number>): string {
  return translate(DEFAULT_APP_LANGUAGE, key, vars);
}

/** 가격 제안 알림 — 받는 사람 언어(`loadNotificationUserLanguage`)로 만든다 (언어 재감사 2026-11-27 §2-4) */
export function offerNotifyT(
  language: AppLanguageCode,
  key: MessageKey,
  vars?: Record<string, string | number>
): string {
  return translate(language, key, vars);
}
