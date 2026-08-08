/**
 * In-feed Advertisement geometry SSOT.
 * CONTRACT: Outer AD row follows host feed row rhythm (Trade ≠ Community density).
 * Width/inset stay host-aligned. Media is a compact landscape strip — NOT a hero banner.
 * DO NOT: hardcode aspect-/h-/py-/pb-[…] only inside carousel; change this module instead.
 *
 * Measured host baselines (2026-08-08 DOM):
 *   Trade phone row ≈ 120–123px (thumb ≈ 96)
 *   Community phone row ≈ 136px (thumb ≈ 72)
 * Total OUTER height (media + label + optional headline + pad) must stay in that family.
 */

export type FeedAdHostDensity = "trade" | "community";

/**
 * Soft creative frame (W:H). Runtime height is dominated by density max-h caps
 * so total outer row can match host list rhythm.
 * 3/1 ≈ wide strip; Admin upload hint follows this (not legacy 12:5).
 */
export const FEED_AD_MEDIA_ASPECT_W = 3;
export const FEED_AD_MEDIA_ASPECT_H = 1;
export const FEED_AD_MEDIA_ASPECT_RATIO = `${FEED_AD_MEDIA_ASPECT_W} / ${FEED_AD_MEDIA_ASPECT_H}`;

/** Tailwind aspect utility matching FEED_AD_MEDIA_ASPECT_RATIO */
export const FEED_AD_MEDIA_ASPECT_CLASS = "aspect-[3/1]";

/**
 * Media max-height by host density (DOM-matched to host thumb / row family).
 * Trade thumb ≈ 96 → media ≤ 88–96. Community host taller text row → slightly taller strip.
 */
export function feedAdMediaMaxHClass(density: FeedAdHostDensity): string {
  if (density === "community") {
    return "max-h-[96px] sm:max-h-[100px] md:max-h-[104px]";
  }
  return "max-h-[88px] sm:max-h-[92px] md:max-h-[96px]";
}

/** @deprecated Prefer feedAdMediaMaxHClass(density). Trade token kept for grep/migration. */
export const FEED_AD_MEDIA_MAX_H_CLASS = feedAdMediaMaxHClass("trade");

/** Recommended upload hint (Admin / member apply). */
export const FEED_AD_RECOMMENDED_UPLOAD = {
  aspectLabel: "3:1",
  minWidthPx: 1200,
  minHeightPx: 400,
  objectFit: "cover" as const,
};

/** Outer list-item shell — align with host `<li>` (no extra horizontal inset beyond card pad). */
export function feedAdListItemClass(density: FeedAdHostDensity): string {
  // Trade host gap ≈ 4px; Community list gap ≈ 16px — keep light vertical rhythm only.
  return density === "community" ? "list-none min-w-0 py-0" : "list-none min-w-0 py-0";
}

/**
 * Frame chrome.
 * Community host cards use bordered rounded surfaces — keep that language.
 * Trade host rows are flat — avoid boxed “section” card; label carries ad identity.
 */
export function feedAdFrameClass(density: FeedAdHostDensity): string {
  if (density === "community") {
    return "overflow-hidden rounded-ui-rect border border-sam-border bg-sam-surface";
  }
  return "overflow-hidden rounded-ui-rect bg-sam-surface";
}

/** Compact label + pager row (not a tall header bar). */
export function feedAdChromeBarClass(_density: FeedAdHostDensity): string {
  void _density;
  return "flex items-center justify-between gap-2 px-3 py-1";
}

/** Media / headline body padding — keep tight so chrome does not inflate outer H. */
export function feedAdBodyClass(_density: FeedAdHostDensity): string {
  void _density;
  return "block px-3 pb-1.5";
}

/** Optional headline — metadata size; 0 height when absent. */
export function feedAdHeadlineClass(_density: FeedAdHostDensity): string {
  void _density;
  return "mt-0.5 line-clamp-1 sam-text-helper text-sam-muted";
}

export function feedAdMediaClass(density: FeedAdHostDensity): string {
  return `${FEED_AD_MEDIA_ASPECT_CLASS} ${feedAdMediaMaxHClass(density)} w-full object-cover`;
}

/** Uncapped aspect height (docs); runtime also applies density max-h. */
export function estimateFeedAdMediaHeightPx(contentWidthPx: number): number {
  const w = Math.max(1, contentWidthPx);
  return Math.round((w * FEED_AD_MEDIA_ASPECT_H) / FEED_AD_MEDIA_ASPECT_W);
}

/** Effective media height after density max-h (md trade = 96, community = 104). */
export function estimateFeedAdMediaHeightCappedPx(
  contentWidthPx: number,
  maxHPx = 96
): number {
  return Math.min(estimateFeedAdMediaHeightPx(contentWidthPx), maxHPx);
}

export function feedAdMediaMaxHPx(density: FeedAdHostDensity, breakpoint: "phone" | "sm" | "md" = "phone"): number {
  if (density === "community") {
    if (breakpoint === "md") return 104;
    if (breakpoint === "sm") return 100;
    return 96;
  }
  if (breakpoint === "md") return 96;
  if (breakpoint === "sm") return 92;
  return 88;
}
