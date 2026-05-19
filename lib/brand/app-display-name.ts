/**
 * 제품 표시명 단일 소스 — layout metadata·PWA·AppTitle·운영설정 기본값이 동일해야 한다.
 */

export const APP_PRODUCT_DISPLAY_NAME = "dibaY" as const;

const LEGACY_DISPLAY_NAMES_LOWER = new Set([
  "kasama",
  "samarket",
  "sa market",
  "sa-market",
]);

/** 어드민·localStorage 에 남은 구 브랜드명 → 현재 제품명 */
export function resolveAppDisplayName(siteName?: string | null): string {
  const trimmed = siteName?.trim();
  if (!trimmed) return APP_PRODUCT_DISPLAY_NAME;
  if (LEGACY_DISPLAY_NAMES_LOWER.has(trimmed.toLowerCase())) {
    return APP_PRODUCT_DISPLAY_NAME;
  }
  return trimmed;
}

export function isLegacyAppDisplayName(siteName?: string | null): boolean {
  const trimmed = siteName?.trim();
  if (!trimmed) return false;
  return LEGACY_DISPLAY_NAMES_LOWER.has(trimmed.toLowerCase());
}
