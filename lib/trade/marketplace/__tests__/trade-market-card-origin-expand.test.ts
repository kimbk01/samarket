import { describe, expect, it, beforeEach, afterEach, vi } from "vitest";
import {
  CARD_ORIGIN_EXPAND_DURATION_MS,
  captureTradeMarketCardOriginExpand,
  clearTradeMarketCardOriginExpand,
  clearTradeMarketCardOriginExpandIfGeneration,
  hasActiveTradeMarketCardOriginForPostId,
  peekTradeMarketCardOriginExpand,
  tradeMarketCardOriginHeroTarget,
  tradePostIdFromPath,
} from "@/lib/trade/marketplace/trade-market-card-origin-expand";

describe("trade-market-card-origin-expand", () => {
  beforeEach(() => {
    clearTradeMarketCardOriginExpand();
    vi.stubGlobal(
      "matchMedia",
      vi.fn().mockReturnValue({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() })
    );
  });
  afterEach(() => {
    clearTradeMarketCardOriginExpand();
    vi.unstubAllGlobals();
  });

  it("tradePostIdFromPath extracts id", () => {
    expect(tradePostIdFromPath("/post/abc-1")).toBe("abc-1");
    expect(tradePostIdFromPath("/post/abc-1?x=1")).toBe("abc-1");
    expect(tradePostIdFromPath("/market")).toBeNull();
  });

  it("captures card/thumb/content geometry without HTML snapshot", () => {
    const thumb = {
      getBoundingClientRect: () => ({ left: 100, top: 200, width: 80, height: 80, right: 180, bottom: 280 }),
    };
    const meta = {
      getBoundingClientRect: () => ({ left: 100, top: 290, width: 80, height: 40, right: 180, bottom: 330 }),
    };
    const el = {
      getBoundingClientRect: () => ({ left: 100, top: 200, width: 80, height: 140, right: 180, bottom: 340 }),
      querySelector: (sel: string) => {
        if (sel.includes("photos")) return thumb;
        if (sel.includes("market-card-meta")) return meta;
        return null;
      },
    } as unknown as HTMLElement;
    vi.stubGlobal("innerWidth", 390);
    vi.stubGlobal("innerHeight", 844);

    const origin = captureTradeMarketCardOriginExpand({
      listingId: "listing-a",
      cardEl: el,
      imageUrl: "https://example.com/a.jpg",
    });
    expect(origin?.listingId).toBe("listing-a");
    expect(origin?.generation).toBeGreaterThan(0);
    expect(origin?.rect).toEqual({ x: 100, y: 200, width: 80, height: 140 });
    expect(origin?.thumbRect).toEqual({ x: 100, y: 200, width: 80, height: 80 });
    expect(origin?.contentRect).toEqual({ x: 100, y: 290, width: 80, height: 40 });
    expect(hasActiveTradeMarketCardOriginForPostId("listing-a")).toBe(true);
    expect(hasActiveTradeMarketCardOriginForPostId("other")).toBe(false);
    expect(peekTradeMarketCardOriginExpand()?.imageUrl).toContain("a.jpg");
    expect(peekTradeMarketCardOriginExpand()).not.toHaveProperty("snapshotHtml");
  });

  it("exposes 360ms duration SSOT", () => {
    expect(CARD_ORIGIN_EXPAND_DURATION_MS).toBe(360);
  });

  it("generation-scoped clear does not wipe a newer tap", () => {
    const el = {
      getBoundingClientRect: () => ({ left: 10, top: 20, width: 100, height: 100, right: 110, bottom: 120 }),
      querySelector: () => null,
    } as unknown as HTMLElement;
    vi.stubGlobal("innerWidth", 390);
    vi.stubGlobal("innerHeight", 844);
    const first = captureTradeMarketCardOriginExpand({ listingId: "a", cardEl: el });
    const second = captureTradeMarketCardOriginExpand({ listingId: "b", cardEl: el });
    expect(second?.generation).not.toBe(first?.generation);
    clearTradeMarketCardOriginExpandIfGeneration("a", first!.generation);
    expect(peekTradeMarketCardOriginExpand()?.listingId).toBe("b");
  });

  it("dedupes rapid re-capture of the same listing within 500ms", () => {
    const el = {
      getBoundingClientRect: () => ({ left: 10, top: 20, width: 100, height: 100, right: 110, bottom: 120 }),
      querySelector: () => null,
    } as unknown as HTMLElement;
    vi.stubGlobal("innerWidth", 390);
    vi.stubGlobal("innerHeight", 844);
    const first = captureTradeMarketCardOriginExpand({ listingId: "same", cardEl: el });
    const second = captureTradeMarketCardOriginExpand({ listingId: "same", cardEl: el });
    expect(second?.generation).toBe(first?.generation);
    expect(second).toBe(first);
  });

  it("hero target is full-bleed top square for image FLIP", () => {
    const hero = tradeMarketCardOriginHeroTarget({
      listingId: "x",
      generation: 1,
      rect: { x: 0, y: 0, width: 100, height: 200 },
      thumbRect: { x: 0, y: 0, width: 100, height: 100 },
      contentRect: null,
      viewport: { width: 400, height: 800 },
      imageUrl: "https://example.com/a.jpg",
      capturedAt: Date.now(),
    });
    expect(hero).toEqual({ x: 0, y: 0, width: 400, height: 400 });
  });
});
