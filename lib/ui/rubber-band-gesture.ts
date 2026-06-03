/**
 * 매장 상세 히어로 당김(rubber band) vs 배너 가로 스와이프 제스처 분리.
 * `useRubberBandAtDocumentTop` 과 unit test 공유.
 */

export const STORE_HERO_MEDIA_ID = "store-hero-media";

/** `StoreOwnerBannerCarousel` hero scroller — 가로 스와이프 시 세로 rubber 금지 */
export const STORE_HERO_BANNER_SCROLLER_ATTR = "data-store-hero-banner-scroller";

export const STORE_HERO_RUBBER_STRETCH_ATTR = "data-rubber-stretch-px";

export type RubberBandTouchClassification = "vertical_pull" | "horizontal" | "none";

export type RubberBandGestureLock = "none" | "horizontal" | "vertical_pull";

function isElement(node: EventTarget | null): node is Element {
  return node instanceof Element;
}

/** 터치가 히어로 배너 가로 스크롤러(또는 그 자손)에서 시작했는지 */
export function touchStartedInStoreHeroHorizontalScroller(target: EventTarget | null): boolean {
  if (!isElement(target)) return false;
  const hero = document.getElementById(STORE_HERO_MEDIA_ID);
  if (!hero || !hero.contains(target)) return false;
  return target.closest(`[${STORE_HERO_BANNER_SCROLLER_ATTR}]`) != null;
}

export function classifyRubberBandTouchMove(
  dx: number,
  dy: number,
  gestureLock: RubberBandGestureLock
): RubberBandTouchClassification {
  if (gestureLock === "horizontal") return "none";
  if (gestureLock === "vertical_pull") {
    return dy > 0 ? "vertical_pull" : "none";
  }

  const absDx = Math.abs(dx);
  const absDy = Math.abs(dy);

  if (absDx > absDy * 1.1 && absDx > 6) {
    return "horizontal";
  }

  if (dy > 8 && dy >= absDx * 1.15) {
    return "vertical_pull";
  }

  return "none";
}

export function resolveRubberBandGestureLock(
  current: RubberBandGestureLock,
  classification: RubberBandTouchClassification
): RubberBandGestureLock {
  if (current === "horizontal") return "horizontal";
  if (classification === "horizontal") return "horizontal";
  if (classification === "vertical_pull") return "vertical_pull";
  return current;
}

export function shouldBlockNativeOverscroll(classification: RubberBandTouchClassification): boolean {
  return classification === "vertical_pull";
}

export function rubberBandStretchFromDy(
  dy: number,
  maxStretchPx: number,
  factor = 0.58
): number {
  if (dy <= 0) return 0;
  return Math.min(maxStretchPx, dy * factor);
}
