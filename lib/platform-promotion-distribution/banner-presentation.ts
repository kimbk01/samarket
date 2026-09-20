/**
 * Event / Platform Promotion Banner — Placement × Presentation capability SSOT.
 *
 * ONE matrix controls BOTH:
 *   A. what Admin can select
 *   B. what App hosts may mount
 *
 * NOT paid Ads billing. NOT Popup interruptive policy.
 * Landscape does NOT deny Banner (unlike Popup).
 */

export const EVENT_BANNER_PRESENTATIONS = ["INLINE_BANNER", "HERO_BANNER"] as const;
export type EventBannerPresentation = (typeof EVENT_BANNER_PRESENTATIONS)[number];

export const EVENT_BANNER_PLACEMENTS = ["TRADE_HOME", "COMMUNITY_HOME"] as const;
export type EventBannerPlacement = (typeof EVENT_BANNER_PLACEMENTS)[number];

/** @deprecated Prefer EVENT_BANNER_PLACEMENTS — kept for call-site compatibility. */
export const EVENT_BANNER_INLINE_PLACEMENTS = EVENT_BANNER_PLACEMENTS;
/** @deprecated Prefer EVENT_BANNER_PLACEMENTS — kept for call-site compatibility. */
export const EVENT_BANNER_HERO_PLACEMENTS = EVENT_BANNER_PLACEMENTS;

export type EventBannerHostId = "FeedAdBannerCarousel" | "EventPromotionHeroBanner";

export type EventBannerCapability = {
  placement: EventBannerPlacement;
  presentation: EventBannerPresentation;
  /** Runtime host component identity (mount must exist). */
  hostId: EventBannerHostId;
  aspectW: number;
  aspectH: number;
  fit: "cover";
  /** Banner remains eligible in all orientations (Popup landscape deny does NOT apply). */
  orientationPolicy: "allow_all";
  recommendedUploadW: number;
  recommendedUploadH: number;
};

/**
 * Canonical 2×2 matrix — do not duplicate in Admin / adapter / hosts.
 */
export const EVENT_BANNER_CAPABILITY_MATRIX: readonly EventBannerCapability[] = [
  {
    placement: "TRADE_HOME",
    presentation: "INLINE_BANNER",
    hostId: "FeedAdBannerCarousel",
    aspectW: 3,
    aspectH: 1,
    fit: "cover",
    orientationPolicy: "allow_all",
    recommendedUploadW: 1200,
    recommendedUploadH: 400,
  },
  {
    placement: "TRADE_HOME",
    presentation: "HERO_BANNER",
    hostId: "EventPromotionHeroBanner",
    aspectW: 39,
    aspectH: 16,
    fit: "cover",
    orientationPolicy: "allow_all",
    recommendedUploadW: 1560,
    recommendedUploadH: 640,
  },
  {
    placement: "COMMUNITY_HOME",
    presentation: "INLINE_BANNER",
    hostId: "FeedAdBannerCarousel",
    aspectW: 3,
    aspectH: 1,
    fit: "cover",
    orientationPolicy: "allow_all",
    recommendedUploadW: 1200,
    recommendedUploadH: 400,
  },
  {
    placement: "COMMUNITY_HOME",
    presentation: "HERO_BANNER",
    hostId: "EventPromotionHeroBanner",
    aspectW: 39,
    aspectH: 16,
    fit: "cover",
    orientationPolicy: "allow_all",
    recommendedUploadW: 1560,
    recommendedUploadH: 640,
  },
] as const;

export function isEventBannerPresentation(
  v: string | null | undefined
): v is EventBannerPresentation {
  return (EVENT_BANNER_PRESENTATIONS as readonly string[]).includes(String(v ?? "").trim());
}

export function isEventBannerPlacement(v: string | null | undefined): v is EventBannerPlacement {
  return (EVENT_BANNER_PLACEMENTS as readonly string[]).includes(
    String(v ?? "").trim().toUpperCase()
  );
}

export function normalizeEventBannerPresentation(
  v: string | null | undefined
): EventBannerPresentation {
  return String(v ?? "").trim() === "HERO_BANNER" ? "HERO_BANNER" : "INLINE_BANNER";
}

export function getEventBannerCapability(
  placement: string,
  presentation: EventBannerPresentation
): EventBannerCapability | null {
  const p = String(placement ?? "").trim().toUpperCase();
  return (
    EVENT_BANNER_CAPABILITY_MATRIX.find(
      (row) => row.placement === p && row.presentation === presentation
    ) ?? null
  );
}

/**
 * PLACEMENT + PRESENTATION compatibility — single evaluator (no scattered ifs).
 */
export function isEventBannerPlacementPresentationCompatible(
  placement: string,
  presentation: EventBannerPresentation
): boolean {
  return getEventBannerCapability(placement, presentation) != null;
}

/** Presentations Admin may offer (all currently legal). */
export function listEventBannerPresentations(): readonly EventBannerPresentation[] {
  return EVENT_BANNER_PRESENTATIONS;
}

/** Placements legal for a presentation — Admin select must derive from this. */
export function listEventBannerPlacementsForPresentation(
  presentation: EventBannerPresentation
): readonly EventBannerPlacement[] {
  return EVENT_BANNER_CAPABILITY_MATRIX.filter((r) => r.presentation === presentation).map(
    (r) => r.placement
  );
}

/** All legal capabilities (Admin options + host mount contracts). */
export function listEventBannerCapabilities(): readonly EventBannerCapability[] {
  return EVENT_BANNER_CAPABILITY_MATRIX;
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

export function eventBannerPlacementLabel(
  placement: EventBannerPlacement,
  lang: "ko" | "en"
): string {
  if (placement === "COMMUNITY_HOME") {
    return lang === "en" ? "Community home" : "커뮤니티 홈";
  }
  return lang === "en" ? "Trade home" : "거래 홈";
}

export function eventBannerImageGuidance(
  presentation: EventBannerPresentation,
  lang: "ko" | "en"
): string {
  const cap = EVENT_BANNER_CAPABILITY_MATRIX.find((r) => r.presentation === presentation);
  if (!cap) return "";
  const ratio = `${cap.aspectW}:${cap.aspectH}`;
  const size = `${cap.recommendedUploadW}×${cap.recommendedUploadH}`;
  if (lang === "en") {
    return `${ratio} · recommended ${size} · cover (edge crop possible)`;
  }
  return `${ratio} · 권장 ${size} · cover (가장자리 크롭 가능)`;
}

/** Popup landscape deny must never be applied to Banner. */
export function isEventBannerOrientationEligible(_orientation: "portrait" | "landscape"): boolean {
  return true;
}
