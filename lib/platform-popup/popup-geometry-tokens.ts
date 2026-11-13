/**
 * CUT 3 — Platform Popup geometry calibration tokens.
 * Classification: DIBAY_IMPLEMENTATION_CALIBRATION (not externally measured).
 */

/** Dim backdrop — Platform Popup dim-only (Owner reopen). */
export const PLATFORM_POPUP_BACKDROP_RGBA = "rgba(0, 0, 0, 0.42)" as const;

/** Tablet T1 max-width — bounded centered card. */
export const PLATFORM_POPUP_TABLET_MAX_WIDTH_PX = 480 as const;

/*
 * 광고 감사 G-11: 쓰는 곳 없던 PLATFORM_POPUP_RADIUS_CLAMP(폭×0.03) 제거 — 팝업 모서리는 프로젝트 오버레이 계약
 * `--overlay-radius-lg`(16px, AGENTS.md 「떠 있는 바텀시트·다이얼로그 12~24px」)를 `app/platform-popup.css` 에서 쓴다.
 */

/** Creative : dismiss row — HISTORICAL calibration only; Type C uses compact actions. */
export const PLATFORM_POPUP_CREATIVE_ROW_FR = 825 as const;
export const PLATFORM_POPUP_DISMISS_ROW_FR = 175 as const;

/** Popup height envelope guidance — content-driven; not a forced sheet fill. */
export const PLATFORM_POPUP_MAX_HEIGHT_VH = 45 as const;

export const PLATFORM_POPUP_Z_CLASS = "z-[1320]" as const;
