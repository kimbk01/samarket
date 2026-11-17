/**
 * 진입 감사 PO-8·PO-2·PO-4 (2026-11-17 · Owner 「설계안대로 진행」) — 팝업 진입 정책(어드민 전체 스위치). 순수 모듈.
 *
 * - enabled: 전역 팝업 켜기/끄기 (끄면 조회 결과 0 — 캠페인별 정지와 별개)
 * - maxPerEntry: 한 번 진입에 순서대로 보일 최대 개수(배민 실측: 중앙 카드 → 하단 시트 2개) · 1~3
 * - allowLandscape: 가로 화면(태블릿 가로·데스크톱)에서 보이기 (폭 480 제한)
 *
 * 저장: `admin_settings` 키 `platform_popup_entry_policy_v1` (값 = 이 객체). 없으면 기본값.
 */

export const PLATFORM_POPUP_ENTRY_POLICY_KEY = "platform_popup_entry_policy_v1";
export const PLATFORM_POPUP_ENTRY_POLICY_CACHE_TAG = "platform-popup-entry-policy";

export type PlatformPopupEntryPolicy = {
  enabled: boolean;
  maxPerEntry: number;
  allowLandscape: boolean;
};

export const DEFAULT_PLATFORM_POPUP_ENTRY_POLICY: PlatformPopupEntryPolicy = {
  enabled: true,
  maxPerEntry: 2,
  allowLandscape: true,
};

export const PLATFORM_POPUP_MAX_PER_ENTRY_LIMIT = 3;

export function normalizePlatformPopupEntryPolicy(raw: unknown): PlatformPopupEntryPolicy {
  const o = raw && typeof raw === "object" && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
  const n = typeof o.maxPerEntry === "number" && Number.isFinite(o.maxPerEntry) ? Math.trunc(o.maxPerEntry) : NaN;
  return {
    enabled: typeof o.enabled === "boolean" ? o.enabled : DEFAULT_PLATFORM_POPUP_ENTRY_POLICY.enabled,
    maxPerEntry:
      n >= 1 && n <= PLATFORM_POPUP_MAX_PER_ENTRY_LIMIT ? n : DEFAULT_PLATFORM_POPUP_ENTRY_POLICY.maxPerEntry,
    allowLandscape:
      typeof o.allowLandscape === "boolean" ? o.allowLandscape : DEFAULT_PLATFORM_POPUP_ENTRY_POLICY.allowLandscape,
  };
}

/** 어드민 저장 검사 — 모르는 값은 거절(조용히 기본값으로 바꾸지 않음) */
export function validatePlatformPopupEntryPolicy(
  raw: unknown
): { ok: true; policy: PlatformPopupEntryPolicy } | { ok: false; error: string } {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return { ok: false, error: "policy_invalid" };
  const o = raw as Record<string, unknown>;
  if (typeof o.enabled !== "boolean") return { ok: false, error: "policy_enabled_invalid" };
  if (typeof o.allowLandscape !== "boolean") return { ok: false, error: "policy_landscape_invalid" };
  if (
    typeof o.maxPerEntry !== "number" ||
    !Number.isInteger(o.maxPerEntry) ||
    o.maxPerEntry < 1 ||
    o.maxPerEntry > PLATFORM_POPUP_MAX_PER_ENTRY_LIMIT
  ) {
    return { ok: false, error: "policy_max_invalid" };
  }
  return { ok: true, policy: { enabled: o.enabled, maxPerEntry: o.maxPerEntry, allowLandscape: o.allowLandscape } };
}
