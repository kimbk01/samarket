import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { STORE_DETAIL_HERO_MIN_HEIGHT_PX } from "@/lib/dibay/store-detail-hero-layout";
import {
  STORE_DETAIL_HEADER_BAR_PX,
  STORE_DETAIL_SUMMARY_BELOW_HERO_ESTIMATE_PX,
  STORE_DETAIL_TABS_ANCHOR_SLACK_PX,
} from "@/lib/ui/store-detail-viewport-tuning";

describe("store-detail-menu-tabs-viewport", () => {
  beforeEach(() => {
    const probe = {
      style: { cssText: "" },
      getBoundingClientRect: () => ({ height: 12 }),
      remove: vi.fn(),
    };
    vi.stubGlobal("HTMLElement", class HTMLElement {});
    vi.stubGlobal("document", {
      createElement: vi.fn(() => probe),
      documentElement: { appendChild: vi.fn(), scrollTop: 0 },
      body: { scrollTop: 0 },
      getElementById: vi.fn(() => null),
      querySelector: vi.fn(() => null),
    });
    vi.stubGlobal("window", {
      scrollY: 0,
      innerWidth: 390,
      scrollTo: vi.fn(),
      visualViewport: { offsetTop: 0 },
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.resetModules();
  });

  it("readStoreDetailFixedHeaderOffsetPx includes header bar and safe area probe", async () => {
    const { readStoreDetailFixedHeaderOffsetPx } = await import("@/lib/ui/store-detail-viewport-metrics");
    expect(readStoreDetailFixedHeaderOffsetPx()).toBe(STORE_DETAIL_HEADER_BAR_PX + 12);
  });

  it("estimateMenuTabsScrollY uses hero constants when hero missing", async () => {
    const { estimateMenuTabsScrollY, readStoreDetailFixedHeaderOffsetPx } = await import(
      "@/lib/ui/store-detail-menu-tabs-viewport"
    );
    const header = readStoreDetailFixedHeaderOffsetPx();
    const y = estimateMenuTabsScrollY();
    expect(y).toBe(
      Math.max(
        0,
        STORE_DETAIL_HERO_MIN_HEIGHT_PX +
          STORE_DETAIL_SUMMARY_BELOW_HERO_ESTIMATE_PX -
          header -
          STORE_DETAIL_TABS_ANCHOR_SLACK_PX
      )
    );
  });

  it("estimateMenuTabsScrollY measures hero bottom when present", async () => {
    const hero = {
      getBoundingClientRect: () => ({ top: 0, bottom: 300, height: 300 }),
      closest: () => null,
      parentElement: null,
    };
    vi.mocked(document.getElementById).mockImplementation((id: string) =>
      id === "store-hero-media" ? (hero as unknown as HTMLElement) : null
    );
    const { estimateMenuTabsScrollY, readStoreDetailFixedHeaderOffsetPx } = await import(
      "@/lib/ui/store-detail-menu-tabs-viewport"
    );
    const header = readStoreDetailFixedHeaderOffsetPx();
    const y = estimateMenuTabsScrollY();
    expect(y).toBe(
      Math.floor(300 + STORE_DETAIL_SUMMARY_BELOW_HERO_ESTIMATE_PX - header - STORE_DETAIL_TABS_ANCHOR_SLACK_PX)
    );
  });

  it("storeDetailCategoryTabsStickyTopCss includes safe-area and delivery header height token", async () => {
    const { storeDetailCategoryTabsStickyTopCss } = await import("@/lib/ui/store-detail-menu-tabs-viewport");
    expect(storeDetailCategoryTabsStickyTopCss()).toContain("safe-area-inset-top");
    expect(storeDetailCategoryTabsStickyTopCss()).toContain("--delivery-header-h");
    expect(storeDetailCategoryTabsStickyTopCss()).toContain(String(STORE_DETAIL_HEADER_BAR_PX));
  });
});
