/**
 * Safe-area layout — SSOT `app/app-shell.css` `--safe-*` (= max(env, --dibay-safe-*)).
 * Android WebView(A17+)·iOS·태블릿 공통. `env(safe-area-inset-*)` 직접 사용 금지.
 */

/** Tailwind arbitrary value fragments */
export const SAFE_TOP_TW = "var(--safe-top)";
export const SAFE_BOTTOM_TW = "var(--safe-bottom)";
export const SAFE_LEFT_TW = "var(--safe-left)";
export const SAFE_RIGHT_TW = "var(--safe-right)";

/** tier1 가로 — 거터 + safe-left/right */
export const APP_TIER1_SAFE_X_PAD_CLASS =
  "pl-[max(1rem,var(--safe-left))] pr-[max(1rem,var(--safe-right))] md:pl-[max(1.25rem,var(--safe-left))] md:pr-[max(1.25rem,var(--safe-right))]";

/** standalone fixed 섹터 헤더 아래 본문 offset */
export const APP_SECTOR_HEADER_OFFSET_TOP_CLASS =
  "pt-[calc(var(--sector-header-h,52px)+var(--safe-top))]";
