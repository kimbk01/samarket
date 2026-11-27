import type { AppLanguageCode } from "@/lib/i18n/config";
import { translate } from "@/lib/i18n/messages";

/**
 * 이벤트 대표 버튼 이름 — 언어 재감사 2026-11-27 (설계 §4-3 「이벤트 cta_label 「자세히 보기」 → 코드」).
 * 사장님 신청 승인으로 만든 이벤트는 `cta_label` 을 비워(null) 저장한다 — 관리자 편집 칸에 코드·고정 문장이 보이지 않게.
 * 고객 화면은 빈 값(사장님 신청 이벤트)·옛 고정 문장·옛 코드를 현재 언어 기본 키로 그린다.
 */

/** 교차 수정 전 잠시 저장됐을 수 있는 코드 — 읽을 때만 기본 키로 바꾼다(새로 저장하지 않음) */
const LEGACY_DEFAULT_CTA_CODE = "view_details";

/** 예전에 저장된 고정 문장(사람이 쓴 이름 아님 · 카탈로그 ko·en 값과 같다) — 화면에서 키로 바꿔 그린다 */
const LEGACY_DEFAULT_CTA_LABELS = new Set([
  translate("ko", "ptr_ad_cta_default"),
  translate("en", "ptr_ad_cta_default"),
]);

/**
 * 저장값 → 화면 이름. 옛 코드·옛 고정 문장은 현재 언어 키, 관리자가 쓴 이름은 그대로.
 * `defaultWhenEmpty` — 빈 값도 기본 키로 그린다(사장님 신청 승인 이벤트 = `sourceOwnerRequestId` 있음).
 * 관리자가 직접 만든 이벤트의 빈 값은 예전처럼 버튼을 숨긴다(null).
 */
export function resolvePlatformEventCtaLabel(
  stored: string | null | undefined,
  language: AppLanguageCode,
  opts?: { defaultWhenEmpty?: boolean },
): string | null {
  const s = typeof stored === "string" ? stored.trim() : "";
  if (!s) return opts?.defaultWhenEmpty ? translate(language, "ptr_ad_cta_default") : null;
  if (s === LEGACY_DEFAULT_CTA_CODE || LEGACY_DEFAULT_CTA_LABELS.has(s)) {
    return translate(language, "ptr_ad_cta_default");
  }
  return s;
}
