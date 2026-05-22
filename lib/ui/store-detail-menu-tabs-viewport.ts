import { STORE_DETAIL_HERO_MIN_HEIGHT_PX } from "@/lib/dibay/store-detail-hero-layout";
import {
  STORE_DETAIL_SUMMARY_BELOW_HERO_ESTIMATE_PX,
  STORE_DETAIL_TABLET_MIN_WIDTH_PX,
  STORE_DETAIL_TABLET_STICKY_TOP_EXTRA_PX,
  STORE_DETAIL_TABS_ANCHOR_SLACK_PX,
  STORE_DETAIL_HEADER_BAR_PX,
} from "@/lib/ui/store-detail-viewport-tuning";
import { readStoreDetailFixedHeaderOffsetPx } from "@/lib/ui/store-detail-viewport-metrics";
import {
  getStoreDetailAppScrollRoot,
  getStoreDetailScrollTop,
  measureStoreDetailElementScrollTop,
  setStoreDetailScrollTop,
} from "@/lib/ui/store-detail-scroll-root";

const STORE_HERO_MEDIA_ID = "store-hero-media";
const STORE_NOTICE_BAR_ID = "store-detail-notice-bar";

function isTabletViewport(): boolean {
  if (typeof window === "undefined") return false;
  return window.innerWidth >= STORE_DETAIL_TABLET_MIN_WIDTH_PX;
}

export { readStoreDetailFixedHeaderOffsetPx } from "@/lib/ui/store-detail-viewport-metrics";

/** CategoryStickyTabs `top` CSS — `StoreOrderStickyHeader` 와 동일 계산 */
export function storeDetailCategoryTabsStickyTopCss(): string {
  const tabletExtra = isTabletViewport() ? STORE_DETAIL_TABLET_STICKY_TOP_EXTRA_PX : 0;
  const headerH = `var(--delivery-header-h, ${STORE_DETAIL_HEADER_BAR_PX}px)`;
  if (tabletExtra > 0) {
    return `calc(env(safe-area-inset-top, 0px) + ${headerH} + ${tabletExtra}px)`;
  }
  return `calc(env(safe-area-inset-top, 0px) + ${headerH})`;
}

function measureNoticeBarHeightPx(): number {
  if (typeof document === "undefined") return 0;
  const el = document.getElementById(STORE_NOTICE_BAR_ID);
  if (!el) return 0;
  return Math.ceil(el.getBoundingClientRect().height);
}

function measureFulfillmentCardExtraPx(): number {
  if (typeof document === "undefined") return 0;
  const card = document.querySelector<HTMLElement>("[data-store-fulfillment-card]");
  if (card && card.offsetHeight > 8) {
    return Math.ceil(card.getBoundingClientRect().height);
  }
  return 0;
}

export function estimateMenuTabsScrollY(): number {
  if (typeof window === "undefined") return 0;
  const scrollRoot = getStoreDetailAppScrollRoot();
  const headerH = readStoreDetailFixedHeaderOffsetPx();

  const hero = document.getElementById(STORE_HERO_MEDIA_ID);
  if (hero) {
    const heroBottom =
      measureStoreDetailElementScrollTop(hero, scrollRoot) +
      Math.ceil(hero.getBoundingClientRect().height);
    const belowHero =
      STORE_DETAIL_SUMMARY_BELOW_HERO_ESTIMATE_PX + measureFulfillmentCardExtraPx();
    const noticeH = measureNoticeBarHeightPx();
    return Math.max(
      0,
      Math.floor(heroBottom + belowHero + noticeH - headerH - STORE_DETAIL_TABS_ANCHOR_SLACK_PX)
    );
  }

  return Math.max(
    0,
    STORE_DETAIL_HERO_MIN_HEIGHT_PX +
      STORE_DETAIL_SUMMARY_BELOW_HERO_ESTIMATE_PX -
      headerH -
      STORE_DETAIL_TABS_ANCHOR_SLACK_PX
  );
}

function scrollYForTabsElement(tabsEl: HTMLElement, scrollRoot: HTMLElement): number {
  const headerH = readStoreDetailFixedHeaderOffsetPx();
  const tabsTop = measureStoreDetailElementScrollTop(tabsEl, scrollRoot);
  return Math.max(0, Math.floor(tabsTop - headerH - STORE_DETAIL_TABS_ANCHOR_SLACK_PX));
}

export function anchorStoreDetailToMenuTabs(opts?: {
  tabsEl?: HTMLElement | null;
  behavior?: ScrollBehavior;
}): boolean {
  if (typeof window === "undefined") return false;
  const scrollRoot = getStoreDetailAppScrollRoot();
  const behavior = opts?.behavior ?? "auto";
  const tabsEl = opts?.tabsEl ?? null;
  const y = tabsEl
    ? scrollYForTabsElement(tabsEl, scrollRoot)
    : estimateMenuTabsScrollY();
  setStoreDetailScrollTop(y, { behavior, scrollRoot });
  return true;
}

export function refineMenuTabsAnchor(tabsEl: HTMLElement | null): boolean {
  return anchorStoreDetailToMenuTabs({ tabsEl, behavior: "auto" });
}

/** @deprecated — `anchorStoreDetailToMenuTabs` 사용 */
export function scrollStoreDetailToMenuTabs(
  tabsMeasureEl: HTMLElement | null,
  opts?: { behavior?: ScrollBehavior }
): boolean {
  return anchorStoreDetailToMenuTabs({ tabsEl: tabsMeasureEl, behavior: opts?.behavior ?? "auto" });
}

/** @deprecated — `readStoreDetailFixedHeaderOffsetPx` 사용 */
export function storeDetailFixedHeaderOffsetPx(): number {
  return readStoreDetailFixedHeaderOffsetPx();
}

export {
  getStoreDetailAppScrollRoot,
  getStoreDetailScrollTop,
  measureStoreDetailElementScrollTop,
};
