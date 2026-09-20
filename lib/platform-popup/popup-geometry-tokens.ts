/**
 * CUT 3 — Platform Popup geometry calibration tokens.
 * Classification: DIBAY_IMPLEMENTATION_CALIBRATION (not Baemin runtime measured).
 */

/** Dim backdrop — Platform Popup dim-only (Owner reopen). */
export const PLATFORM_POPUP_BACKDROP_RGBA = "rgba(0, 0, 0, 0.42)" as const;

/** Tablet T1 max-width — bounded centered card. */
export const PLATFORM_POPUP_TABLET_MAX_WIDTH_PX = 480 as const;

/** Radius ≈ 0.03 × popup width — clamped responsive token. */
export const PLATFORM_POPUP_RADIUS_CLAMP = "clamp(8px, 3cqi, 16px)" as const;

/** Creative : dismiss row — HISTORICAL calibration only; Type C uses compact actions. */
export const PLATFORM_POPUP_CREATIVE_ROW_FR = 825 as const;
export const PLATFORM_POPUP_DISMISS_ROW_FR = 175 as const;

/** Popup height envelope guidance — content-driven; not a forced sheet fill. */
export const PLATFORM_POPUP_MAX_HEIGHT_VH = 45 as const;

export const PLATFORM_POPUP_Z_CLASS = "z-[1320]" as const;
