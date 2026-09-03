/**
 * Shared mobile sheet usable-area contract (OPTION B).
 * ONE canonical authority for keyboard-safe sheet presentation region.
 * Products consume semantic layout only — no raw VV / keyboard px / sheetLift.
 *
 * Form `effectiveBottomInset` remains padding-bottom only (never sheet bounds).
 */

export const DIBAY_USABLE_AREA_SHEET_MARKER = "data-dibay-usable-area-sheet" as const;

/** Default phone presentation when business context should remain visible. */
export const DIBAY_USABLE_AREA_DEFAULT_HEIGHT_RATIO = 0.8 as const;

/** Tablet / wide: constrain sheet width (shared rule, not device-model branch). */
export const DIBAY_USABLE_AREA_MAX_WIDTH_CLASS = "max-w-[560px]" as const;

export type DibayUsableAreaSheetAnchor = "device-bottom" | "above-bottom-nav";
