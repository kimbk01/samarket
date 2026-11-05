/**
 * 광고성(혜택·이벤트) 알림 수신 = 회원이 직접 한 동의만 (Owner 2026-11-05 · 알림 설정 HARD LOCK 제한 재개).
 *
 * 직접 동의 출처 = 가입 화면(`signup`) · 내정보 알림 설정(`settings`).
 * `existing_member_default`(2026-11-03 기존 회원 일괄 기본값)·`admin_created`·출처 없음은
 * 저장값이 `true` 여도 동의가 아니다 — 저장값·출처·기록은 바꾸지 않고 판정에서만 제외한다.
 * 클라이언트·서버 공용(순수 함수).
 */

export const VOLUNTARY_MARKETING_CONSENT_SOURCES = ["signup", "settings"] as const;

export function isVoluntaryMarketingConsentSource(source: unknown): boolean {
  return (VOLUNTARY_MARKETING_CONSENT_SOURCES as readonly unknown[]).includes(source);
}

export function hasValidMarketingConsent(input: {
  marketing_enabled?: boolean | null;
  marketing_consent_source?: string | null;
}): boolean {
  return input.marketing_enabled === true && isVoluntaryMarketingConsentSource(input.marketing_consent_source);
}
