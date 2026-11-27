import { DEFAULT_APP_LANGUAGE } from "@/lib/i18n/config";
import { translate, type MessageKey } from "@/lib/i18n/messages";

/**
 * 서버 저장 문구(채팅 시스템 메시지·알림 title/body 기본 문장) — 기본 언어.
 * 알림은 받는 사람 언어를 조회하지 않는다(B1, docs/audit/i18n-postmerge-fix-design-2026-11-27.md §2):
 * 알림함은 meta `titleKey`·`messageKey`+값으로 화면 언어로 다시 그린다.
 */
export function offerServerT(key: MessageKey, vars?: Record<string, string | number>): string {
  return translate(DEFAULT_APP_LANGUAGE, key, vars);
}
