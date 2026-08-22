/** @vitest-environment jsdom */
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import {
  isStoreMenuProductFocusLandingAligned,
  isStoreMenuSectionHeaderLandingAligned,
  measureStoreMenuProductFocusDeltaPx,
  measureStoreMenuSectionHeaderDeltaPx,
  resolveStoreMenuFocusStickyBottomPx,
  scrollStoreMenuFocusEntryIntoView,
  scrollStoreMenuProductIntoView,
  storeMenuProductDomId,
  storeMenuSectionDomId,
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
    getMainAppScrollTop: (root?: { scrollTop: number }) =>
      root && typeof root.scrollTop === "number" ? root.scrollTop : mockScrollTop,
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
        viewportHeightPx: 800,
      })
    ).toBe(105);
  });

  it("rejects in-flow stickyBottom that exceeds viewport (uses fallback)", () => {
    const tabs = document.createElement("div");
    tabs.getBoundingClientRect = () =>
      ({
        top: 700,
        bottom: 754,
        left: 0,
        right: 390,
        width: 390,
        height: 54,
        x: 0,
        y: 700,
        toJSON: () => ({}),
      }) as DOMRect;
    expect(
      resolveStoreMenuFocusStickyBottomPx({
        tabsEl: tabs,
        tabsHeightPx: 52,
        pinned: true,
        viewportHeightPx: 601,
      })
    ).toBe(53 + 52);
  });

  it("scrollIntoView + sync nudge lands under sticky", () => {
    const id = "prod-1";
    const el = document.createElement("div");
    el.id = storeMenuProductDomId(id);
    let top = 500;
    el.getBoundingClientRect = () =>
      ({
        top,
        bottom: top + 120,
        left: 0,
        right: 390,
        width: 390,
        height: 120,
        x: 0,
        y: top,
        toJSON: () => ({}),
      }) as DOMRect;
    el.scrollIntoView = vi.fn(() => {
      // pretend browser scrolled so top ≈ sticky (105)
      top = 105;
      mockScrollTop = 495;
    });
    document.body.appendChild(el);

    setMainAppScrollTop(100);
    const ok = scrollStoreMenuProductIntoView(id, 105, { behavior: "auto", syncNudge: true });
    expect(ok).toBe(true);
    expect(el.scrollIntoView).toHaveBeenCalled();
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

  it("section header alignment uses same tolerance", () => {
    const sec = document.createElement("div");
    sec.id = storeMenuSectionDomId(2);
    sec.getBoundingClientRect = () =>
      ({
        top: 107,
        bottom: 140,
        left: 0,
        right: 0,
        width: 0,
        height: 33,
        x: 0,
        y: 107,
        toJSON: () => ({}),
      }) as DOMRect;
    document.body.appendChild(sec);
    expect(measureStoreMenuSectionHeaderDeltaPx(2, 105)).toBe(2);
    expect(isStoreMenuSectionHeaderLandingAligned(2, 105)).toBe(true);
  });

  it("scrollStoreMenuFocusEntryIntoView aligns section then product", () => {
    const sectionIndex = 1;
    const productId = "prod-focus";
    const sectionEl = document.createElement("div");
    sectionEl.id = storeMenuSectionDomId(sectionIndex);
    let sectionTop = 400;
    sectionEl.getBoundingClientRect = () =>
      ({
        top: sectionTop,
        bottom: sectionTop + 40,
        left: 0,
        right: 390,
        width: 390,
        height: 40,
        x: 0,
        y: sectionTop,
        toJSON: () => ({}),
      }) as DOMRect;
    sectionEl.scrollIntoView = vi.fn(() => {
      sectionTop = 105;
      mockScrollTop = 295;
    });

    const productEl = document.createElement("div");
    productEl.id = storeMenuProductDomId(productId);
    const productTop = 520;
    productEl.getBoundingClientRect = () =>
      ({
        top: productTop,
        bottom: productTop + 120,
        left: 0,
        right: 390,
        width: 390,
        height: 120,
        x: 0,
        y: productTop,
        toJSON: () => ({}),
      }) as DOMRect;

    document.body.appendChild(sectionEl);
    document.body.appendChild(productEl);

    const ok = scrollStoreMenuFocusEntryIntoView(sectionIndex, productId, 105, {
      behavior: "auto",
    });
    expect(ok).toBe(true);
    expect(sectionEl.scrollIntoView).toHaveBeenCalled();
  });
});
