/**
 * Single responsive First Entry geometry SSOT.
 * ONE source image → viewport-relative render. No device-specific uploads.
 *
 * Derived from current ProductIntroHost / CSS:
 * - root padding 16px
 * - popup maxWidth 420, width min(92%, preset%)
 * - fullscreen image maxHeight 78vh; popup 70vh
 * - phone shell width ~390 CSS px; tablet uses same % with 420 cap
 */

/** Canonical creative for fullscreen + popup contain. */
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
 * Not a runtime asset size — operators may upload ordinary creatives above the old 2MB reject.
 */
export const PRODUCT_INTRO_MAX_SOURCE_BYTES = 8 * 1024 * 1024;

/**
 * Max either source edge before reject (decode / sharp safety).
 * Derived: common WebView/native soft bound; Owner fixture 1122×1402 is far below.
 */
export const PRODUCT_INTRO_MAX_SOURCE_EDGE_PX = 8192;

/**
 * Canonical runtime/storage output after Admin-time optimize.
 * Format/quality match platform-popup creative pipeline (WebP q88).
 * Max bytes: Owner fixture → ~330KB @ q88; 1MB headroom for denser 1080×1350 creatives.
 */
export const PRODUCT_INTRO_OUTPUT_FORMAT = "image/webp" as const;
export const PRODUCT_INTRO_OUTPUT_QUALITY = 88;
export const PRODUCT_INTRO_MAX_OUTPUT_BYTES = 1024 * 1024;

/**
 * @deprecated Prefer PRODUCT_INTRO_MAX_SOURCE_BYTES (source) /
 * PRODUCT_INTRO_MAX_OUTPUT_BYTES (optimized). Kept only for logo/background
 * uploads on the shared startup-config route (no optimize pipeline).
 */
export const PRODUCT_INTRO_MAX_FILE_BYTES = 2 * 1024 * 1024;

export const PRODUCT_INTRO_SUPPORTED_FORMATS = ["image/jpeg", "image/png", "image/webp"] as const;

/** Inset from image edges where text/logo should stay (percent of short side). */
export const PRODUCT_INTRO_SAFE_ZONE_INSET_PCT = 8;
/** Extra bleed outside safe zone that may crop under cover fit. */
export const PRODUCT_INTRO_BLEED_ZONE_INSET_PCT = 4;

export const PRODUCT_INTRO_ROOT_PAD_PX = 16;
export const PRODUCT_INTRO_POPUP_MAX_WIDTH_PX = 420;
export const PRODUCT_INTRO_POPUP_MAX_HEIGHT_VH = 70;
export const PRODUCT_INTRO_FULLSCREEN_MAX_HEIGHT_VH = 78;
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
 * Popup: preserve aspect, center, viewport-relative width with hard max.
 * Fullscreen: contain + background fill (caller paints bg); cover only if Admin chose cover.
 */
export function computeProductIntroLayoutBox(input: {
  viewportWidth: number;
  viewportHeight: number;
  displayMode: "fullscreen" | "card";
  widthPercent: number;
  objectFit: "contain" | "cover";
}): ProductIntroLayoutBox {
  const pad = PRODUCT_INTRO_ROOT_PAD_PX * 2;
  const availW = Math.max(0, input.viewportWidth - pad);
  const availH = Math.max(0, input.viewportHeight - pad);

  if (input.displayMode === "card") {
    const pct = Math.min(PRODUCT_INTRO_POPUP_WIDTH_CAP_PCT, Math.max(40, input.widthPercent));
    const byPct = (availW * pct) / 100;
    const surfaceWidthPx = Math.min(PRODUCT_INTRO_POPUP_MAX_WIDTH_PX, byPct, availW);
    const surfaceMaxHeightPx = Math.min(
      availH,
      (availH * PRODUCT_INTRO_POPUP_MAX_HEIGHT_VH) / 100
    );
    return {
      surfaceWidthPx: Math.round(surfaceWidthPx),
      surfaceMaxHeightPx: Math.round(surfaceMaxHeightPx),
      objectFit: input.objectFit === "cover" ? "cover" : "contain",
    };
  }

  const pct = Math.min(100, Math.max(40, input.widthPercent));
  const surfaceWidthPx = Math.min(availW, (availW * pct) / 100);
  const surfaceMaxHeightPx = Math.min(
    availH,
    (availH * PRODUCT_INTRO_FULLSCREEN_MAX_HEIGHT_VH) / 100
  );
  return {
    surfaceWidthPx: Math.round(surfaceWidthPx),
    surfaceMaxHeightPx: Math.round(surfaceMaxHeightPx),
    objectFit: input.objectFit,
  };
}
