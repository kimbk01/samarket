import { describe, expect, it, beforeEach, afterEach, vi } from "vitest";
import {
  TRADE_MARKET_COMPOSITION_DURATION_MS,
  armTradeMarketProductCompositionForward,
  armTradeMarketProductCompositionBack,
  canAcquireTradeMarketCompositionPerceptualOwnership,
  clearTradeMarketProductComposition,
  peekTradeMarketProductComposition,
  isTradeMarketProductCompositionCoveringDetail,
  publishTradeMarketProductCompositionTargets,
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

function listCardEl(): HTMLElement {
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
  return {
    getBoundingClientRect: () => ({ left: 10, top: 100, width: 180, height: 260, right: 190, bottom: 360 }),
    querySelector: (sel: string) => {
      if (sel.includes("photos")) return photos;
      if (sel.includes("price")) return price;
      if (sel.includes("title")) return title;
      if (sel.includes("location")) return location;
      return null;
    },
  } as unknown as HTMLElement;
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

  it("forward arms list→list provisional; destinationCommitted false (no estimate)", () => {
    const session = armTradeMarketProductCompositionForward({
      listingId: "img-1",
      cardEl: listCardEl(),
      imageUrl: "https://example.com/a.jpg",
      priceText: "₱100",
      titleText: "Coffee",
      locationText: "Quezon City",
      listRouteKey: "/market",
    });
    expect(session?.media?.url).toContain("a.jpg");
    expect(session?.mediaContract).toBe("present");
    expect(session?.destinationCommitted).toBe(false);
    expect(session?.media?.source).toEqual(session?.media?.target);
    expect(session?.media?.target.width).toBe(180);
    expect(session?.media?.target.height).toBe(180);
    expect(isTradeMarketProductCompositionCoveringDetail("img-1")).toBe(true);
  });

  it("forward publish commits real detail photos as end target (no 0.55 reject)", () => {
    armTradeMarketProductCompositionForward({
      listingId: "img-1",
      cardEl: listCardEl(),
      imageUrl: "https://example.com/a.jpg",
      priceText: "₱100",
      titleText: "Coffee",
      locationText: "Quezon City",
      listRouteKey: "/market",
    });
    const detailPhotos = { x: 0, y: 55, width: 390, height: 390 };
    publishTradeMarketProductCompositionTargets({
      listingId: "img-1",
      mediaRect: detailPhotos,
      priceRect: { x: 16, y: 460, width: 358, height: 28 },
      titleRect: { x: 16, y: 492, width: 358, height: 24 },
      metaRect: { x: 16, y: 520, width: 358, height: 18 },
    });
    const live = peekTradeMarketProductComposition();
    expect(live?.destinationCommitted).toBe(true);
    expect(live?.media?.source).toEqual({ x: 10, y: 100, width: 180, height: 180 });
    expect(live?.media?.target).toEqual(detailPhotos);
  });

  it("no-image: does NOT create media node even if photos footprint exists", () => {
    const session = armTradeMarketProductCompositionForward({
      listingId: "noimg-1",
      cardEl: listCardEl(),
      imageUrl: null,
      priceText: "₱50",
      titleText: "Plain",
      listRouteKey: "/market",
    });
    expect(session?.media).toBeNull();
    expect(session?.mediaContract).toBe("absent_by_product");
    expect(session?.destinationCommitted).toBe(false);
    expect(session?.price?.text).toBe("₱50");
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

  it("arms back composition with retained list destination already committed", () => {
    armTradeMarketProductCompositionForward({
      listingId: "b1",
      cardEl: listCardEl(),
      imageUrl: "https://example.com/b.jpg",
      priceText: "₱1",
      titleText: "T",
      listRouteKey: "/market",
    });
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
    // Remembered list geometry at arm time commits reverse destination — no cover wait.
    expect(session?.destinationCommitted).toBe(true);
    expect(session?.media?.target).toEqual({ x: 10, y: 100, width: 180, height: 180 });
    expect(session?.media?.source).toEqual({ x: 0, y: 0, width: 390, height: 390 });
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
  });

  it("reverse destination dock: composition ≈ live list geometry", async () => {
    const { isTradeMarketReverseDestinationDocked } = await import(
      "@/lib/trade/marketplace/trade-market-product-composition"
    );
    expect(
      isTradeMarketReverseDestinationDocked({
        compositionMedia: { x: 10, y: 100, width: 180, height: 180 },
        compositionPrice: null,
        compositionTitle: null,
        liveMedia: { x: 10, y: 100, width: 180, height: 180 },
        livePrice: null,
        liveTitle: null,
      })
    ).toBe(true);
  });

  it("reverse does not defer scroll restore as a cover-wait gate", async () => {
    const {
      armTradeMarketProductCompositionBack,
      armTradeMarketProductCompositionForward,
      peekTradeMarketProductComposition,
    } = await import("@/lib/trade/marketplace/trade-market-product-composition");
    const root = {
      querySelector: (sel: string) => {
        if (sel.includes("photos") || sel.includes("media")) {
          return {
            getBoundingClientRect: () => ({
              left: 0,
              top: 0,
              width: 360,
              height: 360,
              right: 360,
              bottom: 360,
            }),
          };
        }
        return null;
      },
    } as unknown as HTMLElement;
    armTradeMarketProductCompositionForward({
      listingId: "dock-bind-deferred",
      cardEl: listCardEl(),
      imageUrl: "https://example.com/a.jpg",
      priceText: "₱1",
      listRouteKey: "/market",
    });
    armTradeMarketProductCompositionBack({
      listingId: "dock-bind-deferred",
      rootEl: root,
      imageUrl: "https://example.com/a.jpg",
      priceText: "₱1",
      listRouteKey: "/market",
    });
    expect(peekTradeMarketProductComposition()?.destinationCommitted).toBe(true);
  });

  it("reverse live bind once after restore commits list target", async () => {
    const {
      armTradeMarketProductCompositionBack,
      bindTradeMarketReverseLiveDestinationTargets,
      peekTradeMarketProductComposition,
      peekTradeMarketReverseLiveBindCount,
    } = await import("@/lib/trade/marketplace/trade-market-product-composition");
    const root = {
      querySelector: (sel: string) => {
        if (sel.includes("photos") || sel.includes("media")) {
          return {
            getBoundingClientRect: () => ({
              left: 0,
              top: 0,
              width: 360,
              height: 360,
              right: 360,
              bottom: 360,
            }),
          };
        }
        return null;
      },
    } as unknown as HTMLElement;
    armTradeMarketProductCompositionBack({
      listingId: "dock-bind-once",
      rootEl: root,
      imageUrl: "https://example.com/a.jpg",
      priceText: "₱1",
      listRouteKey: "/market",
    });
    const live = { x: 12, y: 120, width: 181, height: 181 };
    expect(
      bindTradeMarketReverseLiveDestinationTargets({
        listingId: "dock-bind-once",
        mediaRect: live,
        priceRect: { x: 12, y: 310, width: 100, height: 18 },
        titleRect: null,
        metaRect: null,
      })
    ).toBe(true);
    const s = peekTradeMarketProductComposition();
    expect(s?.media?.target).toEqual(live);
    expect(s?.destinationCommitted).toBe(true);
    expect(peekTradeMarketReverseLiveBindCount()).toBe(1);
  });
});
