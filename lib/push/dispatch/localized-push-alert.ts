/**
 * 기기별 알림 글자 언어 (2026-11-27 언어 사후 검토 C2·C3 — docs/audit/i18n-postmerge-fix-design-2026-11-27.md §3).
 *
 * 받는 사람 언어를 따로 조회하지 않는다. 발송 대상 조회(`user_devices`)가 이미 읽는 행의 `app_language` 로
 * **기기마다** 제목·본문을 고른다 — 추가 DB 조회 0, 신호 경로 대기 0, 인스턴스 메모리 캐시 없음.
 * 순서: 그 기기 앱 언어 → 같은 사람의 가장 최근 기기 앱 언어(이미 읽은 대상 안) → 모름(호출자가 넘긴 `out` 글자 그대로).
 * 바꾸는 것은 `title`·`body` 뿐이다. 데이터 필드(caller_name·kind 등) 이름·값은 그대로 — 설치된 구 바이너리 호환.
 */
import { SUPPORTED_APP_LANGUAGES, parseExplicitAppLanguage, type AppLanguageCode } from "@/lib/i18n/config";
import type { NotificationSideEffectPayloadOut } from "@/lib/notifications/publish-notification-side-effect";
import type { LocalizedPushAlert, PushTarget } from "@/lib/push/dispatch/push-payload-types";

/**
 * 통화 신호 푸시의 기본 글자 언어 — 받는 사람의 어느 활성 기기에도 `app_language` 가 없을 때 쓰는 글자.
 * 변경 전(#660 이전) 통화 푸시 글자는 모두 한국어였다. 운영에 `app_language` 가 빈 활성 기기(Android 1.2.7(80)·옛 iOS)가
 * 있어 en 으로 바꾸면 한국어 사용자 회귀 → 예전 한국어 글자 유지.
 */
export const CALL_PUSH_DEFAULT_ALERT_LANGUAGE: AppLanguageCode = "ko";

/** 언어마다 글자를 만든다 — `{ ko: {...}, en: {...} }` */
export function buildLocalizedPushAlert(
  build: (lang: AppLanguageCode) => { title: string; body: string }
): LocalizedPushAlert {
  const out: LocalizedPushAlert = {};
  for (const lang of SUPPORTED_APP_LANGUAGES) out[lang] = build(lang);
  return out;
}

/** 이 기기의 글자 언어 — 기기 값 → 같은 사람의 다른 대상 중 첫 값(최근 순) → null */
export function resolvePushTargetAlertLanguage(
  target: PushTarget,
  allTargets: readonly PushTarget[]
): AppLanguageCode | null {
  const own = parseExplicitAppLanguage(target.app_language);
  if (own) return own;
  for (const t of allTargets) {
    const lang = parseExplicitAppLanguage(t.app_language);
    if (lang) return lang;
  }
  return null;
}

/** 언어별 글자가 있고 이 기기 언어를 알면 그 글자로 바꾼 payload, 아니면 원래 payload(같은 객체) */
export function applyLocalizedPushAlert(
  out: NotificationSideEffectPayloadOut,
  target: PushTarget,
  allTargets: readonly PushTarget[],
  localized: LocalizedPushAlert | null | undefined
): NotificationSideEffectPayloadOut {
  if (!localized) return out;
  const lang = resolvePushTargetAlertLanguage(target, allTargets);
  if (!lang) return out;
  const copy = localized[lang];
  if (!copy) return out;
  if (copy.title === out.title && copy.body === out.body) return out;
  return { ...out, title: copy.title, body: copy.body };
}
