/**
 * In-feed Advertisement geometry SSOT — CARD-RHYTHM (2026-08-09 correction).
 *
 * AD CARD SIZE ≠ SOURCE PIXEL SIZE.
 *
 * SOURCE ASSET (upload): 1200 × 400 px (3:1 landscape master).
 * RUNTIME VIEWPORT: fixed height matching list-card thumbs — NOT full-width
 * unbounded aspect-[3/1] (that became a hero strip on tablet/desktop).
 *
 * Reference (code / list SSOT — live DOM failed while /philife errored):
 *   Community ListThumb: 72 → sm 80 → md 88 (square)
 *   Trade ProductCard:   100 × 100
 *
 * DO NOT restore responsive aspect-[3/1] + object-contain as the feed card.
 * DO NOT grow media height with content width.
 *
 * CONTRACT chain:
 *   CREATIVE SPEC (1200×400) → Member/Admin uploader
 *   → FeedAdFramePreview → FeedAdBannerCarousel (Community + Trade)
 */

export type FeedAdHostDensity = "trade" | "community";

/** Source / upload aspect (not runtime CSS aspect-ratio). */
export const FEED_AD_MEDIA_ASPECT_W = 3;
export const FEED_AD_MEDIA_ASPECT_H = 1;
export const FEED_AD_MEDIA_ASPECT_RATIO = `${FEED_AD_MEDIA_ASPECT_W} / ${FEED_AD_MEDIA_ASPECT_H}`;

/**
 * @deprecated Runtime no longer uses CSS aspect-[3/1]. Kept for upload/source docs.
 * Prefer feedAdMediaHeightClass.
 */
export const FEED_AD_MEDIA_ASPECT_CLASS = "aspect-[3/1]";

/** Auto-advance interval (Admin multi-slide only). Right→left, loops. */
export const FEED_AD_SLIDE_INTERVAL_MS = 4000;
/** CSS transform duration for slide move. */
export const FEED_AD_SLIDE_TRANSITION_MS = 400;

export const FEED_AD_STANDARD_UPLOAD_WIDTH_PX = 1200;
export const FEED_AD_STANDARD_UPLOAD_HEIGHT_PX = 400;
export const FEED_AD_UPLOAD_MAX_FILE_BYTES = 2 * 1024 * 1024;

/** Runtime media heights — align with Community ListThumb / Trade ProductCard. */
export const FEED_AD_RUNTIME_MEDIA_HEIGHT_PX = {
  community: { phone: 72, sm: 80, md: 88 },
  trade: { phone: 100, sm: 100, md: 100 },
} as const;

/** Recommended upload hint (Admin / member apply). */
export const FEED_AD_RECOMMENDED_UPLOAD = {
  aspectLabel: "3:1",
  standardWidthPx: FEED_AD_STANDARD_UPLOAD_WIDTH_PX,
  standardHeightPx: FEED_AD_STANDARD_UPLOAD_HEIGHT_PX,
  minWidthPx: FEED_AD_STANDARD_UPLOAD_WIDTH_PX,
  minHeightPx: FEED_AD_STANDARD_UPLOAD_HEIGHT_PX,
  /** Feed card uses cover inside fixed-height viewport (list rhythm). */
  objectFit: "cover" as const,
  maxFileBytes: FEED_AD_UPLOAD_MAX_FILE_BYTES,
  /** Wide viewports may crop left/right of 3:1 master — intentional for density. */
  safeCrop: "edges" as const,
};

export function feedAdStandardPixelLabel(): string {
  return `${FEED_AD_STANDARD_UPLOAD_WIDTH_PX} × ${FEED_AD_STANDARD_UPLOAD_HEIGHT_PX} px`;
}

/** Fixed media height classes — matches list thumb rhythm. */
export function feedAdMediaHeightClass(density: FeedAdHostDensity): string {
  if (density === "community") {
    return "h-[72px] sm:h-20 md:h-[88px]";
  }
  return "h-[100px]";
}

/** @deprecated Alias of feedAdMediaHeightClass. */
export function feedAdMediaMaxHClass(density: FeedAdHostDensity): string {
  return feedAdMediaHeightClass(density);
}

/** @deprecated Use FEED_AD_RUNTIME_MEDIA_HEIGHT_PX. */
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
 * Creative media — full list width, fixed list-thumb height, cover (no giant contain letterbox).
 */
export function feedAdMediaClass(density: FeedAdHostDensity): string {
  return `block w-full min-w-0 ${feedAdMediaHeightClass(density)} object-cover bg-sam-app`;
}

/** Viewport clip for the slide track — same fixed height as media. */
export function feedAdMediaViewportClass(density: FeedAdHostDensity): string {
  return `relative w-full min-w-0 overflow-hidden rounded-ui-rect ${feedAdMediaHeightClass(density)}`;
}

/** Runtime media height (not width÷3). */
export function estimateFeedAdMediaHeightPx(
  _contentWidthPx: number,
  density: FeedAdHostDensity = "trade",
  breakpoint: "phone" | "sm" | "md" = "phone"
): number {
  void _contentWidthPx;
  return FEED_AD_RUNTIME_MEDIA_HEIGHT_PX[density][breakpoint];
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

export function feedAdMediaMaxHPx(
  density: FeedAdHostDensity,
  breakpoint: "phone" | "sm" | "md" = "phone"
): number {
  return FEED_AD_RUNTIME_MEDIA_HEIGHT_PX[density][breakpoint];
}
