/** @vitest-environment jsdom */
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import {
  isStoreMenuProductFocusLandingAligned,
  measureStoreMenuProductFocusDeltaPx,
  resolveStoreMenuFocusStickyBottomPx,
  scrollStoreMenuProductIntoView,
  storeMenuProductDomId,
  STORE_MENU_FOCUS_LANDING_TOLERANCE_PX,
} from "@/lib/dibay/store-menu-product-focus";
import { getMainAppScrollTop, setMainAppScrollTop } from "@/lib/layout/main-app-scroll-root";

let mockScrollTop = 100;

vi.mock("@/lib/layout/main-app-scroll-root", () => {
  const root = {
    getBoundingClientRect: () => ({ top: 0, bottom: 800, left: 0, right: 390, width: 390, height: 800 }),
    get scrollTop() {
      return mockScrollTop;
    },
    set scrollTop(v: number) {
      mockScrollTop = v;
    },
    scrollTo: vi.fn((opts: { top: number }) => {
      mockScrollTop = opts.top;
    }),
    scrollHeight: 4000,
    clientHeight: 800,
  };
  return {
    getMainAppScrollRoot: () => root,
    getMainAppScrollTop: () => mockScrollTop,
    setMainAppScrollTop: (top: number) => {
      mockScrollTop = top;
    },
  };
});

vi.mock("@/lib/ui/store-detail-scroll-root", () => ({
  isDocumentScrollRoot: () => true,
  measureStoreDetailElementScrollTop: (el: HTMLElement) =>
    mockScrollTop + el.getBoundingClientRect().top,
}));

vi.mock("@/lib/ui/store-detail-viewport-metrics", () => ({
  readStoreDetailFixedHeaderOffsetPxCached: () => 53,
}));

describe("store-menu-product-focus landing", () => {
  beforeEach(() => {
    mockScrollTop = 100;
    document.body.innerHTML = "";
  });
  afterEach(() => {
    document.body.innerHTML = "";
  });

  it("resolve sticky bottom prefers pinned tabs rect, else header+tabs height", () => {
    expect(
      resolveStoreMenuFocusStickyBottomPx({
        tabsEl: null,
        tabsHeightPx: 52,
        pinned: false,
      })
    ).toBe(53 + 52);

    const tabs = document.createElement("div");
    tabs.getBoundingClientRect = () =>
      ({
        top: 53,
        bottom: 105,
        left: 0,
        right: 390,
        width: 390,
        height: 52,
        x: 0,
        y: 53,
        toJSON: () => ({}),
      }) as DOMRect;
    expect(
      resolveStoreMenuFocusStickyBottomPx({
        tabsEl: tabs,
        tabsHeightPx: 52,
        pinned: true,
      })
    ).toBe(105);
  });

  it("scroll formula matches section scroll: scrollTop + (elTop - stickyBottom)", () => {
    const id = "prod-1";
    const el = document.createElement("div");
    el.id = storeMenuProductDomId(id);
    el.getBoundingClientRect = () =>
      ({
        top: 500,
        bottom: 620,
        left: 0,
        right: 390,
        width: 390,
        height: 120,
        x: 0,
        y: 500,
        toJSON: () => ({}),
      }) as DOMRect;
    document.body.appendChild(el);

    setMainAppScrollTop(100);
    const ok = scrollStoreMenuProductIntoView(id, 105, { behavior: "auto" });
    expect(ok).toBe(true);
    // initial scrollTop 100 + (500 - 105) = 495
    expect(getMainAppScrollTop()).toBe(495);
  });

  it("alignment gate uses pin-exit tolerance", () => {
    expect(STORE_MENU_FOCUS_LANDING_TOLERANCE_PX).toBe(8);
    const id = "prod-2";
    const el = document.createElement("div");
    el.id = storeMenuProductDomId(id);
    el.getBoundingClientRect = () =>
      ({
        top: 110,
        bottom: 200,
        left: 0,
        right: 0,
        width: 0,
        height: 90,
        x: 0,
        y: 110,
        toJSON: () => ({}),
      }) as DOMRect;
    document.body.appendChild(el);
    expect(measureStoreMenuProductFocusDeltaPx(id, 105)).toBe(5);
    expect(isStoreMenuProductFocusLandingAligned(id, 105)).toBe(true);
    el.getBoundingClientRect = () =>
      ({
        top: 105 + 200,
        bottom: 400,
        left: 0,
        right: 0,
        width: 0,
        height: 90,
        x: 0,
        y: 305,
        toJSON: () => ({}),
      }) as DOMRect;
    expect(isStoreMenuProductFocusLandingAligned(id, 105)).toBe(false);
  });
});
