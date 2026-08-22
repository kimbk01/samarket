/**
 * Featured focus entry — single scroll WRITE authority during offscreen prepare.
 * Soft ARCH B2: scroll completes before rtl slide; zero post-slide correction.
 */

import { deliveryPresentationMarkEvent } from "@/lib/dibay/delivery-presentation-evidence";
import {
  getMainAppScrollRoot,
  getMainAppScrollTop,
  setMainAppScrollTop,
} from "@/lib/layout/main-app-scroll-root";
import {
  isStoreMenuFocusStickyGeometryReady,
  type StoreMenuFocusEntryPhase,
} from "@/lib/dibay/store-menu-focus-entry";
import {
  isStoreMenuProductFocusLandingAligned,
  isStoreMenuSectionHeaderLandingAligned,
  measureStoreMenuProductFocusDeltaPx,
  measureStoreMenuSectionHeaderDeltaPx,
  resolveStoreMenuFocusStickyBottomPx,
  storeMenuProductDomId,
  storeMenuSectionDomId,
  STORE_MENU_FOCUS_LANDING_TOLERANCE_PX,
} from "@/lib/dibay/store-menu-product-focus";
import { measureStoreDetailElementScrollTop } from "@/lib/ui/store-detail-scroll-root";
import { readStoreDetailFixedHeaderOffsetPxCached } from "@/lib/ui/store-detail-viewport-metrics";

export const STORE_FEATURED_ENTRY_READY_EVENT = "dibay:store-featured-entry-ready";

const STORE_HERO_MEDIA_ID = "store-hero-media";

let prepareScrollWriteActive = false;

/** Featured prepare — only Featured Entry Position Authority may WRITE scrollTop. */
export function beginFeaturedEntryScrollPrepare(): void {
  prepareScrollWriteActive = true;
  if (typeof document !== "undefined") {
    document.documentElement.removeAttribute("data-dibay-featured-entry-ready");
  }
}

export function endFeaturedEntryScrollPrepare(): void {
  prepareScrollWriteActive = false;
}

export function isFeaturedEntryScrollPrepareActive(): boolean {
  return prepareScrollWriteActive;
}

export type FeaturedEntryLandGeometry = {
  scrollTop: number;
  tabsBottom: number;
  tabsTop: number | null;
  categoryTop: number | null;
  productTop: number | null;
  heroBottom: number | null;
  categoryDelta: number | null;
  productDelta: number | null;
  categoryBottom: number | null;
  productGap: number | null;
};

/** Final pinned tabs bottom — header + tabs height (no in-flow mid-page rect). */
export function resolveFeaturedEntryFinalStickyBottomPx(tabsHeightPx: number): number {
  const tabsH = Math.max(48, Math.round(tabsHeightPx));
  return readStoreDetailFixedHeaderOffsetPxCached() + tabsH;
}

/** Pin geometry ready for ONE pre-land write (final sticky bottom, not flow tabs). */
export function isFeaturedEntryPinGeometryReadyForWrite(
  tabsHeightPx: number,
  viewportHeightPx: number
): boolean {
  if (!(tabsHeightPx >= 40)) return false;
  const tabsBottom = resolveFeaturedEntryFinalStickyBottomPx(tabsHeightPx);
  return isStoreMenuFocusStickyGeometryReady(tabsBottom, viewportHeightPx);
}

/** Pin spacer — sentinel 직후 DOM (featured prepare pinned layout). */
export const STORE_FOCUS_PIN_SPACER_ATTR = "data-store-focus-pin-spacer";

export type FeaturedEntryPinnedLayoutProbe = {
  sectionIndex: number;
  tabsEl: HTMLElement | null;
  tabsHeightPx: number;
  viewportHeightPx: number;
  headerScrollMeasurePx: number | null;
  headerScrollMeasurePrevPx: number | null;
};

/**
 * Final pinned layout proven in DOM — NOT logical preparePinLayout intent.
 * Portal deferred OK; tabs stay in StoreSurface (flow/pinned semantics).
 */
export function isFeaturedEntryFinalPinnedLayoutProvenForWrite(
  probe: FeaturedEntryPinnedLayoutProbe
): boolean {
  if (!isFeaturedEntryPinGeometryReadyForWrite(probe.tabsHeightPx, probe.viewportHeightPx)) {
    return false;
  }
  if (typeof document === "undefined") return false;

  const expectedTabsH = Math.max(48, Math.round(probe.tabsHeightPx));
  const tabsEl = probe.tabsEl;
  if (!tabsEl || !(tabsEl.getBoundingClientRect().height >= 40)) return false;
  if (tabsEl.getAttribute("data-store-category-tabs") !== "flow") return false;

  const spacerEl = document.querySelector(`[${STORE_FOCUS_PIN_SPACER_ATTR}="1"]`);
  if (!(spacerEl instanceof HTMLElement)) return false;
  const spacerH = Math.round(spacerEl.getBoundingClientRect().height);
  if (spacerH < expectedTabsH - 2) return false;

  const sectionEl = document.getElementById(storeMenuSectionDomId(probe.sectionIndex));
  const headerEl = sectionEl?.querySelector("h3");
  if (!headerEl) return false;
  const h3Rect = headerEl.getBoundingClientRect();
  if (!(h3Rect.height > 0) || !Number.isFinite(h3Rect.top)) return false;

  const measure = probe.headerScrollMeasurePx;
  if (measure == null || !Number.isFinite(measure)) return false;

  if (
    probe.headerScrollMeasurePrevPx != null &&
    Math.abs(measure - probe.headerScrollMeasurePrevPx) > 0.5
  ) {
    return false;
  }
  if (probe.headerScrollMeasurePrevPx == null) return false;

  return true;
}

/** @deprecated use isFeaturedEntryFinalPinnedLayoutProvenForWrite — logical pin shortcut removed */
export function isFeaturedEntryPinStateFinalForWrite(args: {
  tabsEl: HTMLElement | null;
  tabsHeightPx: number;
  pinned: boolean;
  preparePinLayout: boolean;
  viewportHeightPx: number;
  sectionIndex?: number;
  headerScrollMeasurePx?: number | null;
  headerScrollMeasurePrevPx?: number | null;
}): boolean {
  if (args.sectionIndex == null) return false;
  return isFeaturedEntryFinalPinnedLayoutProvenForWrite({
    sectionIndex: args.sectionIndex,
    tabsEl: args.tabsEl,
    tabsHeightPx: args.tabsHeightPx,
    viewportHeightPx: args.viewportHeightPx,
    headerScrollMeasurePx: args.headerScrollMeasurePx ?? null,
    headerScrollMeasurePrevPx: args.headerScrollMeasurePrevPx ?? null,
  });
}

export function measureFeaturedEntryLandGeometry(args: {
  sectionIndex: number;
  productId: string;
  tabsEl: HTMLElement | null;
  tabsHeightPx: number;
  pinned: boolean;
}): FeaturedEntryLandGeometry | null {
  if (typeof document === "undefined") return null;
  const scrollRoot = getMainAppScrollRoot();
  const vh = window.innerHeight;
  const tabsBottom = isFeaturedEntryScrollPrepareActive()
    ? resolveFeaturedEntryFinalStickyBottomPx(args.tabsHeightPx)
    : args.pinned
      ? resolveStoreMenuFocusStickyBottomPx({
          tabsEl: args.tabsEl,
          tabsHeightPx: args.tabsHeightPx,
          pinned: true,
          viewportHeightPx: vh,
        })
      : resolveFeaturedEntryFinalStickyBottomPx(args.tabsHeightPx);
  const tabsTop = args.tabsEl?.getBoundingClientRect().top ?? null;
  const sectionEl = document.getElementById(storeMenuSectionDomId(args.sectionIndex));
  const categoryHeaderEl = sectionEl?.querySelector("h3");
  const categoryTop = categoryHeaderEl?.getBoundingClientRect().top ?? null;
  const categoryBottom = categoryHeaderEl?.getBoundingClientRect().bottom ?? null;
  const productTop =
    document.getElementById(storeMenuProductDomId(args.productId))?.getBoundingClientRect().top ??
    null;
  const heroBottom =
    document.getElementById(STORE_HERO_MEDIA_ID)?.getBoundingClientRect().bottom ?? null;
  return {
    scrollTop: getMainAppScrollTop(scrollRoot),
    tabsBottom,
    tabsTop,
    categoryTop,
    productTop,
    heroBottom,
    categoryDelta: categoryTop != null ? categoryTop - tabsBottom : null,
    productDelta: productTop != null ? productTop - tabsBottom : null,
    categoryBottom,
    productGap:
      productTop != null && categoryBottom != null ? productTop - categoryBottom : null,
  };
}

export function isFeaturedEntryLandGeometryStable(
  prev: FeaturedEntryLandGeometry,
  next: FeaturedEntryLandGeometry
): boolean {
  const tol = 0.5;
  return (
    Math.abs(prev.scrollTop - next.scrollTop) <= tol &&
    Math.abs(prev.tabsBottom - next.tabsBottom) <= tol &&
    (prev.categoryTop == null ||
      next.categoryTop == null ||
      Math.abs(prev.categoryTop - next.categoryTop) <= tol) &&
    (prev.productTop == null ||
      next.productTop == null ||
      Math.abs(prev.productTop - next.productTop) <= tol)
  );
}

/** CategoryMenuSection — product list wrapper uses Tailwind `mt-2` (8px). */
const FEATURED_ENTRY_PRODUCT_LIST_GAP_PX = 8;

/**
 * Featured land contract (DOM-derived):
 * - category h3 top ≈ tabs bottom
 * - product row top ≈ category h3 bottom + mt-2 (8px)
 * - hero cleared above tabs
 */
export function isFeaturedEntryLandGeometryVerified(
  geometry: FeaturedEntryLandGeometry,
  productId: string,
  sectionIndex: number,
  viewportHeightPx: number
): boolean {
  const tol = STORE_MENU_FOCUS_LANDING_TOLERANCE_PX;
  if (!isStoreMenuFocusStickyGeometryReady(geometry.tabsBottom, viewportHeightPx)) {
    return false;
  }
  if (geometry.categoryDelta == null) return false;
  if (geometry.categoryDelta < -tol || geometry.categoryDelta > tol) return false;
  if (geometry.productGap == null) return false;
  if (
    Math.abs(geometry.productGap - FEATURED_ENTRY_PRODUCT_LIST_GAP_PX) > tol
  ) {
    return false;
  }
  const productEl = document.getElementById(storeMenuProductDomId(productId));
  if (!productEl) return false;
  const productRect = productEl.getBoundingClientRect();
  if (!(productRect.height > 0)) return false;
  if (productRect.top >= viewportHeightPx - 24) return false;
  if (geometry.heroBottom != null && geometry.tabsTop != null) {
    if (geometry.heroBottom > geometry.tabsTop + 2) return false;
  }
  return true;
}

/** Direct scrollTop write — no scrollIntoView (prepare-only). */
export function writeFeaturedEntryScrollTop(
  scrollTopPx: number,
  reason: string,
  audit?: Record<string, unknown>
): void {
  if (!prepareScrollWriteActive) return;
  const scrollRoot = getMainAppScrollRoot();
  const y = Math.max(0, Math.floor(scrollTopPx));
  setMainAppScrollTop(y, { behavior: "auto", scrollRoot });
  deliveryPresentationMarkEvent("featuredPreLandWrite", {
    reason,
    scrollTop: y,
    scrollTopAfter: y,
    ...audit,
  });
}

/** Align category h3 header to sticky bottom via one scrollTop write. */
export function writeFeaturedEntryScrollForCategoryHeader(
  sectionIndex: number,
  stickyBottomPx: number,
  audit?: Record<string, unknown> & { productId?: string }
): boolean {
  if (!prepareScrollWriteActive) return false;
  if (typeof document !== "undefined") {
    const spacerEl = document.querySelector(`[${STORE_FOCUS_PIN_SPACER_ATTR}="1"]`);
    if (!(spacerEl instanceof HTMLElement)) return false;
  }
  const sectionEl = document.getElementById(storeMenuSectionDomId(sectionIndex));
  const headerEl = sectionEl?.querySelector("h3");
  if (!headerEl) return false;
  const scrollRoot = getMainAppScrollRoot();
  const scrollTopBefore = getMainAppScrollTop(scrollRoot);
  const categoryTop = headerEl.getBoundingClientRect().top;
  const productId = audit?.productId?.trim();
  const productEl = productId
    ? document.getElementById(storeMenuProductDomId(productId))
    : null;
  const productTop = productEl?.getBoundingClientRect().top ?? null;
  const tabsEl = document.querySelector("[data-store-category-tabs]");
  const tabsBottom = tabsEl?.getBoundingClientRect().bottom ?? null;
  const spacerEl = document.querySelector(`[${STORE_FOCUS_PIN_SPACER_ATTR}="1"]`);
  const spacerHeight = spacerEl?.getBoundingClientRect().height ?? null;
  const targetScroll = Math.max(
    0,
    Math.floor(measureStoreDetailElementScrollTop(headerEl, scrollRoot) - stickyBottomPx)
  );
  const prev = scrollTopBefore;
  if (Math.abs(prev - targetScroll) <= 1) return false;
  writeFeaturedEntryScrollTop(targetScroll, "category-header-h3", {
    sectionIndex,
    targetScrollTop: targetScroll,
    scrollTopBefore: prev,
    stickyBottomPx,
    categoryTop,
    productTop,
    tabsBottom,
    spacerHeight,
    tabsHeight: tabsEl?.getBoundingClientRect().height ?? null,
    ...audit,
  });
  return true;
}

export function dispatchFeaturedEntryReady(detail: {
  productId: string;
  sectionIndex: number;
  geometry: FeaturedEntryLandGeometry;
}): void {
  deliveryPresentationMarkEvent("featuredEntryReady", {
    productId: detail.productId,
    sectionIndex: detail.sectionIndex,
    scrollTop: detail.geometry.scrollTop,
    categoryDelta: detail.geometry.categoryDelta,
    productDelta: detail.geometry.productDelta,
  });
  if (typeof window !== "undefined") {
    document.documentElement.setAttribute("data-dibay-featured-entry-ready", "1");
    window.dispatchEvent(
      new CustomEvent(STORE_FEATURED_ENTRY_READY_EVENT, {
        detail: {
          slug: detail.productId,
          sectionIndex: detail.sectionIndex,
          scrollTop: detail.geometry.scrollTop,
        },
      })
    );
  }
}

export function featuredEntryPhaseLabel(
  preparing: boolean,
  prepareComplete: boolean
): StoreMenuFocusEntryPhase {
  if (!preparing && prepareComplete) return "complete";
  if (prepareComplete) return "ready";
  if (preparing) return "preparing";
  return "idle";
}

export { measureStoreDetailElementScrollTop };
