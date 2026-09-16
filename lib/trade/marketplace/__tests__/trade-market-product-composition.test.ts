import { describe, expect, it, beforeEach, afterEach, vi } from "vitest";
import {
  TRADE_MARKET_COMPOSITION_DURATION_MS,
  armTradeMarketProductCompositionForward,
  armTradeMarketProductCompositionBack,
  canAcquireTradeMarketCompositionPerceptualOwnership,
  clearTradeMarketProductComposition,
  peekTradeMarketProductComposition,
  isTradeMarketProductCompositionCoveringDetail,
} from "@/lib/trade/marketplace/trade-market-product-composition";

function stubSessionStorage(): void {
  const store = new Map<string, string>();
  vi.stubGlobal("sessionStorage", {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => {
      store.set(k, v);
    },
    removeItem: (k: string) => {
      store.delete(k);
    },
    clear: () => store.clear(),
  });
}

describe("trade-market-product-composition", () => {
  beforeEach(() => {
    stubSessionStorage();
    clearTradeMarketProductComposition();
    vi.stubGlobal(
      "matchMedia",
      vi.fn().mockReturnValue({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() })
    );
    vi.stubGlobal("innerWidth", 390);
    vi.stubGlobal("innerHeight", 844);
  });
  afterEach(() => {
    clearTradeMarketProductComposition();
    vi.unstubAllGlobals();
  });

  it("exposes 360ms duration", () => {
    expect(TRADE_MARKET_COMPOSITION_DURATION_MS).toBe(360);
  });

  it("arms with-media composition with one media + text slots", () => {
    const photos = {
      getBoundingClientRect: () => ({ left: 10, top: 100, width: 180, height: 180, right: 190, bottom: 280 }),
    };
    const price = {
      getBoundingClientRect: () => ({ left: 10, top: 290, width: 180, height: 20, right: 190, bottom: 310 }),
    };
    const title = {
      getBoundingClientRect: () => ({ left: 10, top: 312, width: 180, height: 18, right: 190, bottom: 330 }),
    };
    const location = {
      getBoundingClientRect: () => ({ left: 10, top: 332, width: 180, height: 16, right: 190, bottom: 348 }),
    };
    const el = {
      getBoundingClientRect: () => ({ left: 10, top: 100, width: 180, height: 260, right: 190, bottom: 360 }),
      querySelector: (sel: string) => {
        if (sel.includes("photos")) return photos;
        if (sel.includes("price")) return price;
        if (sel.includes("title")) return title;
        if (sel.includes("location")) return location;
        return null;
      },
    } as unknown as HTMLElement;

    const session = armTradeMarketProductCompositionForward({
      listingId: "img-1",
      cardEl: el,
      imageUrl: "https://example.com/a.jpg",
      priceText: "₱100",
      titleText: "Coffee",
      locationText: "Quezon City",
      listRouteKey: "/market",
    });
    expect(session?.media?.url).toContain("a.jpg");
    expect(session?.mediaContract).toBe("present");
    expect(session?.price?.text).toBe("₱100");
    expect(session?.title?.text).toBe("Coffee");
    expect(session?.meta?.text).toBe("Quezon City");
    expect(isTradeMarketProductCompositionCoveringDetail("img-1")).toBe(true);
  });

  it("no-image: does NOT create media node even if photos footprint exists", () => {
    const photos = {
      getBoundingClientRect: () => ({ left: 10, top: 100, width: 180, height: 180, right: 190, bottom: 280 }),
    };
    const price = {
      getBoundingClientRect: () => ({ left: 10, top: 290, width: 180, height: 20, right: 190, bottom: 310 }),
    };
    const title = {
      getBoundingClientRect: () => ({ left: 10, top: 312, width: 180, height: 18, right: 190, bottom: 330 }),
    };
    const el = {
      getBoundingClientRect: () => ({ left: 10, top: 100, width: 180, height: 240, right: 190, bottom: 340 }),
      querySelector: (sel: string) => {
        if (sel.includes("photos")) return photos;
        if (sel.includes("price")) return price;
        if (sel.includes("title")) return title;
        return null;
      },
    } as unknown as HTMLElement;

    const session = armTradeMarketProductCompositionForward({
      listingId: "noimg-1",
      cardEl: el,
      imageUrl: null,
      priceText: "₱50",
      titleText: "Plain",
      listRouteKey: "/market",
    });
    expect(session?.media).toBeNull();
    expect(session?.mediaContract).toBe("absent_by_product");
    expect(session?.price?.text).toBe("₱50");
    expect(peekTradeMarketProductComposition()?.media).toBeNull();
  });

  it("image product missing media geometry fails closed (not content-only)", () => {
    const price = {
      getBoundingClientRect: () => ({ left: 10, top: 290, width: 180, height: 20, right: 190, bottom: 310 }),
    };
    const title = {
      getBoundingClientRect: () => ({ left: 10, top: 312, width: 180, height: 18, right: 190, bottom: 330 }),
    };
    const el = {
      getBoundingClientRect: () => ({ left: 10, top: 100, width: 180, height: 240, right: 190, bottom: 340 }),
      querySelector: (sel: string) => {
        if (sel.includes("price")) return price;
        if (sel.includes("title")) return title;
        return null;
      },
    } as unknown as HTMLElement;

    const session = armTradeMarketProductCompositionForward({
      listingId: "lost-1",
      cardEl: el,
      imageUrl: "https://example.com/lost.jpg",
      priceText: "₱9",
      titleText: "Lost",
      listRouteKey: "/market",
    });
    expect(session).toBeNull();
    expect(peekTradeMarketProductComposition()).toBeNull();
  });

  it("arms back composition", () => {
    const root = {
      getBoundingClientRect: () => ({ left: 0, top: 0, width: 390, height: 700, right: 390, bottom: 700 }),
      querySelector: (sel: string) => {
        if (sel.includes("photos")) {
          return {
            getBoundingClientRect: () => ({ left: 0, top: 0, width: 390, height: 390, right: 390, bottom: 390 }),
          };
        }
        if (sel.includes("price")) {
          return {
            getBoundingClientRect: () => ({ left: 16, top: 410, width: 200, height: 28, right: 216, bottom: 438 }),
          };
        }
        if (sel.includes("title")) {
          return {
            getBoundingClientRect: () => ({ left: 16, top: 440, width: 200, height: 24, right: 216, bottom: 464 }),
          };
        }
        return null;
      },
    } as unknown as HTMLElement;
    const session = armTradeMarketProductCompositionBack({
      listingId: "b1",
      rootEl: root,
      imageUrl: "https://example.com/b.jpg",
      priceText: "₱1",
      titleText: "T",
      listRouteKey: "/market",
    });
    expect(session?.direction).toBe("back");
    expect(session?.mediaContract).toBe("present");
    expect(session?.media?.url).toContain("b.jpg");
  });

  it("ownership gate: image present requires mediaPaintReady", () => {
    expect(
      canAcquireTradeMarketCompositionPerceptualOwnership({
        mediaContract: "present",
        media: {
          url: "https://example.com/a.jpg",
          source: { x: 0, y: 0, width: 10, height: 10 },
          target: { x: 0, y: 0, width: 10, height: 10 },
        },
        mediaPaintReady: false,
      })
    ).toBe(false);
    expect(
      canAcquireTradeMarketCompositionPerceptualOwnership({
        mediaContract: "present",
        media: {
          url: "https://example.com/a.jpg",
          source: { x: 0, y: 0, width: 10, height: 10 },
          target: { x: 0, y: 0, width: 10, height: 10 },
        },
        mediaPaintReady: true,
      })
    ).toBe(true);
    expect(
      canAcquireTradeMarketCompositionPerceptualOwnership({
        mediaContract: "absent_by_product",
        media: null,
        mediaPaintReady: false,
      })
    ).toBe(true);
  });
});
