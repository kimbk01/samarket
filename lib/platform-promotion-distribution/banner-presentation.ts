/**
 * Event Distribution Banner presentation SSOT.
 * PRESENTATION ≠ PLACEMENT ≠ paid Ads billing.
 * INLINE → FeedAdBannerCarousel geometry.
 * HERO → DeliveryAdBanner STORES_HOME_HERO geometry (owned promo; no Delivery billing write).
 */

export const EVENT_BANNER_PRESENTATIONS = ["INLINE_BANNER", "HERO_BANNER"] as const;
export type EventBannerPresentation = (typeof EVENT_BANNER_PRESENTATIONS)[number];

export const EVENT_BANNER_INLINE_PLACEMENTS = [
  "TRADE_HOME",
  "COMMUNITY_HOME",
] as const;

export const EVENT_BANNER_HERO_PLACEMENTS = [
  "TRADE_HOME",
  "COMMUNITY_HOME",
] as const;

export function isEventBannerPresentation(
  v: string | null | undefined
): v is EventBannerPresentation {
  return (EVENT_BANNER_PRESENTATIONS as readonly string[]).includes(String(v ?? "").trim());
}

export function normalizeEventBannerPresentation(
  v: string | null | undefined
): EventBannerPresentation {
  return String(v ?? "").trim() === "HERO_BANNER" ? "HERO_BANNER" : "INLINE_BANNER";
}

/**
 * PLACEMENT + PRESENTATION compatibility — single evaluator (no scattered ifs).
 */
export function isEventBannerPlacementPresentationCompatible(
  placement: string,
  presentation: EventBannerPresentation
): boolean {
  const p = String(placement ?? "").trim().toUpperCase();
  if (presentation === "HERO_BANNER") {
    return (EVENT_BANNER_HERO_PLACEMENTS as readonly string[]).includes(p);
  }
  return (EVENT_BANNER_INLINE_PLACEMENTS as readonly string[]).includes(p);
}

export function eventBannerPresentationLabel(
  presentation: EventBannerPresentation,
  lang: "ko" | "en"
): string {
  if (presentation === "HERO_BANNER") {
    return lang === "en" ? "Hero banner" : "히어로 배너";
  }
  return lang === "en" ? "Inline banner" : "인라인 배너";
}
