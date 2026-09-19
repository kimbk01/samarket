/**
 * In-feed Advertisement geometry SSOT — PLACEMENT 3:1 (FINAL CUT 1).
 *
 * PLACEMENT
 *   → canonical aspect 3:1
 *   → responsive container (height = width ÷ 3)
 *   → creative fit policy (cover; no stretch)
 *
 * Upload / reference creative: 1200 × 400 (same 3:1).
 * Community + Trade share one placement ratio — no device-specific ratios.
 *
 * Prior list-thumb fixed-height placement (independent of width) is removed.
 * Popup 36:25 and Delivery 39:16 / Sponsored 4:3 are separate authorities.
 *
 * CONTRACT chain:
 *   CREATIVE SPEC (1200×400) → Member/Admin uploader
 *   → FeedAdFramePreview → FeedAdBannerCarousel (Community + Trade)
 */

import { BANNER_PLACEMENT_CAPACITY_SSOT } from "@/lib/ads/banner-placement-capacity-ssot";

export type FeedAdHostDensity = "trade" | "community";

/** Placement + upload aspect (W:H). */
export const FEED_AD_MEDIA_ASPECT_W = 3;
export const FEED_AD_MEDIA_ASPECT_H = 1;
export const FEED_AD_MEDIA_ASPECT_RATIO = `${FEED_AD_MEDIA_ASPECT_W} / ${FEED_AD_MEDIA_ASPECT_H}`;

/** Canonical Tailwind placement aspect — single geometry authority for Feed Banner. */
export const FEED_AD_MEDIA_ASPECT_CLASS = "aspect-[3/1]";

/** Auto-advance interval — canonical owner: BANNER_PLACEMENT_CAPACITY_SSOT (Feed 4000ms). */
export const FEED_AD_SLIDE_INTERVAL_MS =
  BANNER_PLACEMENT_CAPACITY_SSOT.COMMUNITY_HOME.rotationIntervalMs;
/** CSS transform duration for slide move. */
export const FEED_AD_SLIDE_TRANSITION_MS = 400;

export const FEED_AD_STANDARD_UPLOAD_WIDTH_PX = 1200;
export const FEED_AD_STANDARD_UPLOAD_HEIGHT_PX = 400;
export const FEED_AD_UPLOAD_MAX_FILE_BYTES = 2 * 1024 * 1024;

/** Recommended upload hint (Admin / member apply). */
export const FEED_AD_RECOMMENDED_UPLOAD = {
  aspectLabel: "3:1",
  standardWidthPx: FEED_AD_STANDARD_UPLOAD_WIDTH_PX,
  standardHeightPx: FEED_AD_STANDARD_UPLOAD_HEIGHT_PX,
  minWidthPx: FEED_AD_STANDARD_UPLOAD_WIDTH_PX,
  minHeightPx: FEED_AD_STANDARD_UPLOAD_HEIGHT_PX,
  /**
   * Cover crops non-3:1 uploads into the 3:1 placement box.
   * Must not compensate for a wrong container ratio — container is always 3:1.
   */
  objectFit: "cover" as const,
  maxFileBytes: FEED_AD_UPLOAD_MAX_FILE_BYTES,
  /** Non-3:1 uploads may crop edges inside the 3:1 box — placement-declared. */
  safeCrop: "edges" as const,
};

export function feedAdStandardPixelLabel(): string {
  return `${FEED_AD_STANDARD_UPLOAD_WIDTH_PX} × ${FEED_AD_STANDARD_UPLOAD_HEIGHT_PX} px`;
}

/** Shared placement aspect class (Community + Trade identical). */
export function feedAdPlacementAspectClass(): string {
  return FEED_AD_MEDIA_ASPECT_CLASS;
}

/**
 * @deprecated Alias of feedAdPlacementAspectClass — height follows width÷3; no fixed px.
 * Density ignored (no separate Community/Trade ratios).
 */
export function feedAdMediaHeightClass(_density?: FeedAdHostDensity): string {
  void _density;
  return feedAdPlacementAspectClass();
}

/** @deprecated Alias of feedAdMediaHeightClass. */
export function feedAdMediaMaxHClass(density?: FeedAdHostDensity): string {
  return feedAdMediaHeightClass(density);
}

/** @deprecated Fixed-height authority removed — empty sentinel. */
export const FEED_AD_MEDIA_MAX_H_CLASS = "";

export function getFeedAdCreativeSpec(density: FeedAdHostDensity) {
  return {
    ...FEED_AD_RECOMMENDED_UPLOAD,
    density,
    aspectClass: FEED_AD_MEDIA_ASPECT_CLASS,
    mediaClass: feedAdMediaClass(density),
    frameClass: feedAdFrameClass(density),
    viewportClass: feedAdMediaViewportClass(density),
    heightClass: feedAdMediaHeightClass(density),
    pixelLabel: feedAdStandardPixelLabel(),
  };
}

export function feedAdListItemClass(density: FeedAdHostDensity): string {
  return density === "community" ? "list-none min-w-0 py-0" : "list-none min-w-0 py-0";
}

export function feedAdFrameClass(density: FeedAdHostDensity): string {
  if (density === "community") {
    return "overflow-hidden rounded-ui-rect border border-sam-border bg-sam-surface";
  }
  return "overflow-hidden rounded-ui-rect bg-sam-surface";
}

export function feedAdChromeBarClass(_density: FeedAdHostDensity): string {
  void _density;
  return "flex items-center justify-between gap-2 px-3 py-1";
}

export function feedAdBodyClass(_density: FeedAdHostDensity): string {
  void _density;
  return "block px-3 pb-1.5";
}

export function feedAdHeadlineClass(_density: FeedAdHostDensity): string {
  void _density;
  return "mt-0.5 line-clamp-1 sam-text-helper text-sam-muted";
}

/**
 * Creative media — full placement width, 3:1 aspect, cover (no stretch).
 * Density does not change ratio.
 */
export function feedAdMediaClass(_density: FeedAdHostDensity): string {
  void _density;
  return `block w-full min-w-0 ${FEED_AD_MEDIA_ASPECT_CLASS} object-cover bg-sam-app`;
}

/** Viewport clip for the slide track — same 3:1 placement box as media. */
export function feedAdMediaViewportClass(_density: FeedAdHostDensity): string {
  void _density;
  return `relative w-full min-w-0 overflow-hidden rounded-ui-rect ${FEED_AD_MEDIA_ASPECT_CLASS}`;
}

/**
 * Expected rendered height for a content width under placement 3:1.
 * height = width × (H/W) = width / 3.
 */
export function estimateFeedAdMediaHeightPx(
  contentWidthPx: number,
  _density?: FeedAdHostDensity,
  _breakpoint?: "phone" | "sm" | "md"
): number {
  void _density;
  void _breakpoint;
  const w = Number.isFinite(contentWidthPx) ? Math.max(0, contentWidthPx) : 0;
  return (w * FEED_AD_MEDIA_ASPECT_H) / FEED_AD_MEDIA_ASPECT_W;
}

/** Placement ratio for a measured box (width/height). */
export function feedAdPlacementRatio(widthPx: number, heightPx: number): number | null {
  if (!Number.isFinite(widthPx) || !Number.isFinite(heightPx) || heightPx <= 0) return null;
  return widthPx / heightPx;
}

/** True when measured ratio matches canonical 3:1 within absolute delta. */
export function feedAdPlacementRatioMatches(
  widthPx: number,
  heightPx: number,
  absDelta = 0.02
): boolean {
  const actual = feedAdPlacementRatio(widthPx, heightPx);
  if (actual == null) return false;
  const expected = FEED_AD_MEDIA_ASPECT_W / FEED_AD_MEDIA_ASPECT_H;
  return Math.abs(actual - expected) <= absDelta;
}

/** @deprecated Caps removed — identity with estimateFeedAdMediaHeightPx. */
export function estimateFeedAdMediaHeightCappedPx(
  contentWidthPx: number,
  _maxHPx?: number,
  density: FeedAdHostDensity = "trade"
): number {
  void _maxHPx;
  return estimateFeedAdMediaHeightPx(contentWidthPx, density);
}

/**
 * @deprecated Fixed breakpoint heights removed.
 * Returns height for a representative phone content width (390) under 3:1.
 */
export function feedAdMediaMaxHPx(
  _density?: FeedAdHostDensity,
  _breakpoint?: "phone" | "sm" | "md"
): number {
  void _density;
  void _breakpoint;
  return estimateFeedAdMediaHeightPx(390);
}
