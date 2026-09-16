import { describe, expect, it, beforeEach, afterEach, vi } from "vitest";
import {
  captureTradeMarketCardOriginExpand,
  clearTradeMarketCardOriginExpand,
  hasActiveTradeMarketCardOriginForPostId,
  peekTradeMarketCardOriginExpand,
  tradeMarketCardOriginExpandTransform,
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

  it("captures geometry from getBoundingClientRect and matches listing id", () => {
    const el = {
      getBoundingClientRect: () => ({ left: 100, top: 200, width: 80, height: 120, right: 180, bottom: 320 }),
    } as unknown as HTMLElement;
    vi.stubGlobal("innerWidth", 390);
    vi.stubGlobal("innerHeight", 844);

    const origin = captureTradeMarketCardOriginExpand({
      listingId: "listing-a",
      cardEl: el,
      imageUrl: "https://example.com/a.jpg",
    });
    expect(origin?.listingId).toBe("listing-a");
    expect(origin?.rect).toEqual({ x: 100, y: 200, width: 80, height: 120 });
    expect(hasActiveTradeMarketCardOriginForPostId("listing-a")).toBe(true);
    expect(hasActiveTradeMarketCardOriginForPostId("other")).toBe(false);
    expect(peekTradeMarketCardOriginExpand()?.imageUrl).toContain("a.jpg");
  });

  it("computes expand transform from card center toward viewport", () => {
    const t = tradeMarketCardOriginExpandTransform({
      listingId: "x",
      rect: { x: 0, y: 0, width: 100, height: 200 },
      viewport: { width: 400, height: 800 },
      imageUrl: null,
      capturedAt: Date.now(),
    });
    expect(t.scaleX).toBeCloseTo(0.25);
    expect(t.scaleY).toBeCloseTo(0.25);
    expect(t.translateX).toBeCloseTo(50 - 200); // cardCenterX - vw/2
    expect(t.translateY).toBeCloseTo(100 - 400); // cardCenterY - vh/2
  });

  it("different card rects yield different transforms (geometry-driven)", () => {
    const upper = tradeMarketCardOriginExpandTransform({
      listingId: "u",
      rect: { x: 20, y: 40, width: 160, height: 200 },
      viewport: { width: 390, height: 844 },
      imageUrl: null,
      capturedAt: Date.now(),
    });
    const lower = tradeMarketCardOriginExpandTransform({
      listingId: "l",
      rect: { x: 200, y: 520, width: 160, height: 200 },
      viewport: { width: 390, height: 844 },
      imageUrl: null,
      capturedAt: Date.now(),
    });
    expect(upper.translateY).not.toEqual(lower.translateY);
    expect(upper.translateX).not.toEqual(lower.translateX);
  });
});
