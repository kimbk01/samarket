/**
 * Single responsive First Entry geometry SSOT.
 * ONE source image → full-surface responsive render. No device-specific uploads.
 * CASE B default: fullscreen COVER (no card chrome / % width cap / shadow).
 */

/** Canonical creative for fullscreen cover. */
export const PRODUCT_INTRO_CANONICAL_WIDTH_PX = 1080;
export const PRODUCT_INTRO_CANONICAL_HEIGHT_PX = 1350;
export const PRODUCT_INTRO_CANONICAL_ASPECT = "4:5" as const;
export const PRODUCT_INTRO_MIN_WIDTH_PX = 720;
export const PRODUCT_INTRO_MIN_HEIGHT_PX = 900;
export const PRODUCT_INTRO_RECOMMENDED_EXPORT_WIDTH_PX = 1080;
export const PRODUCT_INTRO_RECOMMENDED_EXPORT_HEIGHT_PX = 1350;

/**
 * Source upload ceiling (Admin select → server sharp optimize).
 * Same shared DIBAY media source policy as platform popup / posts (8MB).
 */
export const PRODUCT_INTRO_MAX_SOURCE_BYTES = 8 * 1024 * 1024;
export const PRODUCT_INTRO_MAX_SOURCE_EDGE_PX = 8192;
export const PRODUCT_INTRO_OUTPUT_FORMAT = "image/webp" as const;
export const PRODUCT_INTRO_OUTPUT_QUALITY = 88;
export const PRODUCT_INTRO_MAX_OUTPUT_BYTES = 1024 * 1024;
/** @deprecated logo/background passthrough on shared upload route */
export const PRODUCT_INTRO_MAX_FILE_BYTES = 2 * 1024 * 1024;
export const PRODUCT_INTRO_SUPPORTED_FORMATS = ["image/jpeg", "image/png", "image/webp"] as const;

export const PRODUCT_INTRO_SAFE_ZONE_INSET_PCT = 8;
export const PRODUCT_INTRO_BLEED_ZONE_INSET_PCT = 4;

export const PRODUCT_INTRO_ROOT_PAD_PX = 0;
export const PRODUCT_INTRO_POPUP_MAX_WIDTH_PX = 420;
export const PRODUCT_INTRO_POPUP_MAX_HEIGHT_VH = 70;
export const PRODUCT_INTRO_FULLSCREEN_MAX_HEIGHT_VH = 100;
export const PRODUCT_INTRO_POPUP_WIDTH_CAP_PCT = 92;

export type ProductIntroViewportKind =
  | "phone_portrait"
  | "phone_landscape"
  | "tablet_portrait"
  | "tablet_landscape";

export const PRODUCT_INTRO_VIEWPORT_PRESETS: Record<
  ProductIntroViewportKind,
  { labelKo: string; labelEn: string; width: number; height: number }
> = {
  phone_portrait: { labelKo: "Phone 세로", labelEn: "Phone portrait", width: 390, height: 844 },
  phone_landscape: { labelKo: "Phone 가로", labelEn: "Phone landscape", width: 844, height: 390 },
  tablet_portrait: { labelKo: "Tablet 세로", labelEn: "Tablet portrait", width: 768, height: 1024 },
  tablet_landscape: {
    labelKo: "Tablet 가로",
    labelEn: "Tablet landscape",
    width: 1024,
    height: 768,
  },
};

export type ProductIntroLayoutBox = {
  surfaceWidthPx: number;
  surfaceMaxHeightPx: number;
  objectFit: "contain" | "cover";
};

/**
 * Full-surface First Entry box — no card margins/caps.
 * `displayMode` / widthPercent ignored for operational FE (legacy args retained for call sites).
 */
export function computeProductIntroLayoutBox(input: {
  viewportWidth: number;
  viewportHeight: number;
  displayMode: "fullscreen" | "card";
  widthPercent: number;
  objectFit: "contain" | "cover";
}): ProductIntroLayoutBox {
  const fit = input.objectFit === "contain" ? "contain" : "cover";
  return {
    surfaceWidthPx: Math.max(0, Math.round(input.viewportWidth)),
    surfaceMaxHeightPx: Math.max(0, Math.round(input.viewportHeight)),
    objectFit: fit,
  };
}
