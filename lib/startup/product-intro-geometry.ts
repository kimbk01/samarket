/**
 * DIBAY First Entry V2 geometry SSOT.
 * ONE source creative → CONTAIN inside safe viewport. Crop/stretch/card forbidden.
 */

/** Recommended upload canvas (not viewport ratio). */
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

/** Safe inset as % of the shorter viewport edge (creative must stay inside). */
export const PRODUCT_INTRO_SAFE_ZONE_INSET_PCT = 8;
export const PRODUCT_INTRO_BLEED_ZONE_INSET_PCT = 4;

/** Bundled OS launch canvas + Admin FE default background. */
export const PRODUCT_INTRO_BUNDLED_CANVAS_BACKGROUND = "#FFFCFC" as const;

/** V2 operational fit — COVER permanently rejected. */
export const PRODUCT_INTRO_V2_FIT = "contain" as const;

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

export type ProductIntroContainedRect = {
  left: number;
  top: number;
  width: number;
  height: number;
  objectFit: "contain";
};

/**
 * Maximum CONTAIN rect for a creative inside the safe viewport.
 * CROP=0 DISTORTION=0 — remaining area is intentional background.
 */
export function computeContainedCreativeRect(input: {
  viewportWidth: number;
  viewportHeight: number;
  imageWidth: number;
  imageHeight: number;
  safeInsetPct?: number;
}): ProductIntroContainedRect {
  const vw = Math.max(0, input.viewportWidth);
  const vh = Math.max(0, input.viewportHeight);
  const iw = Math.max(1, input.imageWidth);
  const ih = Math.max(1, input.imageHeight);
  const insetPct = Math.max(0, Math.min(40, input.safeInsetPct ?? PRODUCT_INTRO_SAFE_ZONE_INSET_PCT));
  const inset = Math.round((Math.min(vw, vh) * insetPct) / 100);
  const availW = Math.max(1, vw - inset * 2);
  const availH = Math.max(1, vh - inset * 2);
  const scale = Math.min(availW / iw, availH / ih);
  const width = Math.max(1, Math.round(iw * scale));
  const height = Math.max(1, Math.round(ih * scale));
  const left = Math.round((vw - width) / 2);
  const top = Math.round((vh - height) / 2);
  return { left, top, width, height, objectFit: "contain" };
}

/**
 * @deprecated Prefer computeContainedCreativeRect. Kept for Admin preview callers.
 * Always returns full-viewport surface with contain fit (no card caps).
 */
export function computeProductIntroLayoutBox(input: {
  viewportWidth: number;
  viewportHeight: number;
  displayMode?: "fullscreen" | "card";
  widthPercent?: number;
  objectFit?: "contain" | "cover";
}): { surfaceWidthPx: number; surfaceMaxHeightPx: number; objectFit: "contain" } {
  void input.displayMode;
  void input.widthPercent;
  void input.objectFit;
  return {
    surfaceWidthPx: Math.max(0, Math.round(input.viewportWidth)),
    surfaceMaxHeightPx: Math.max(0, Math.round(input.viewportHeight)),
    objectFit: "contain",
  };
}
