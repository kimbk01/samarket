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
 *
 * LOCK (width): Runtime media uses fixed height tokens + `w-full` — never `aspect-*` paired
 * with max-height (CSS aspect+max-h shrinks used width on tablet/Windows). Upload hint
 * aspect stays 3:1 for Admin/member creatives only.
 */

export type FeedAdHostDensity = "trade" | "community";

/**
 * Soft creative frame (W:H) — upload / Admin preview hint only.
 * Runtime display height is density height tokens (not aspect-driven).
 */
export const FEED_AD_MEDIA_ASPECT_W = 3;
export const FEED_AD_MEDIA_ASPECT_H = 1;
export const FEED_AD_MEDIA_ASPECT_RATIO = `${FEED_AD_MEDIA_ASPECT_W} / ${FEED_AD_MEDIA_ASPECT_H}`;

/** Tailwind aspect utility for upload/preview surfaces (not consumer media class). */
export const FEED_AD_MEDIA_ASPECT_CLASS = "aspect-[3/1]";

/** Auto-advance interval (multi-slide). Right→left, loops. */
export const FEED_AD_SLIDE_INTERVAL_MS = 4000;
/** CSS transform duration for slide move. */
export const FEED_AD_SLIDE_TRANSITION_MS = 400;

/**
 * Media height by host density (DOM-matched to host thumb / row family).
 * Trade thumb ≈ 96 → media 88–96. Community host taller text row → slightly taller strip.
 * Fixed `h-*` (not max-h + aspect) so width stays 100% of host on all breakpoints.
 */
export function feedAdMediaHeightClass(density: FeedAdHostDensity): string {
  if (density === "community") {
    return "h-[96px] sm:h-[100px] md:h-[104px]";
  }
  return "h-[88px] sm:h-[92px] md:h-[96px]";
}

/** @deprecated Prefer feedAdMediaHeightClass(density). */
export function feedAdMediaMaxHClass(density: FeedAdHostDensity): string {
  return feedAdMediaHeightClass(density);
}

/** @deprecated Prefer feedAdMediaHeightClass("trade"). */
export const FEED_AD_MEDIA_MAX_H_CLASS = feedAdMediaHeightClass("trade");

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

/**
 * Consumer / preview media surface: full host width + density height + cover.
 * DO NOT add aspect-* here — that regresses tablet/Windows width shrink.
 */
export function feedAdMediaClass(density: FeedAdHostDensity): string {
  return `block w-full min-w-0 ${feedAdMediaHeightClass(density)} object-cover`;
}

/** Viewport clip for the slide track (same height tokens as media). */
export function feedAdMediaViewportClass(density: FeedAdHostDensity): string {
  return `relative w-full min-w-0 overflow-hidden rounded-ui-rect ${feedAdMediaHeightClass(density)}`;
}

/** Uncapped aspect estimate (upload docs); runtime uses density height tokens. */
export function estimateFeedAdMediaHeightPx(contentWidthPx: number): number {
  const w = Math.max(1, contentWidthPx);
  return Math.round((w * FEED_AD_MEDIA_ASPECT_H) / FEED_AD_MEDIA_ASPECT_W);
}

/** Effective media height after density cap (md trade = 96, community = 104). */
export function estimateFeedAdMediaHeightCappedPx(
  contentWidthPx: number,
  maxHPx = 96
): number {
  return Math.min(estimateFeedAdMediaHeightPx(contentWidthPx), maxHPx);
}

export function feedAdMediaMaxHPx(
  density: FeedAdHostDensity,
  breakpoint: "phone" | "sm" | "md" = "phone"
): number {
  if (density === "community") {
    if (breakpoint === "md") return 104;
    if (breakpoint === "sm") return 100;
    return 96;
  }
  if (breakpoint === "md") return 96;
  if (breakpoint === "sm") return 92;
  return 88;
}
