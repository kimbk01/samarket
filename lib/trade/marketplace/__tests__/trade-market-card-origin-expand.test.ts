import { describe, expect, it, beforeEach, afterEach, vi } from "vitest";
import {
  CARD_ORIGIN_EXPAND_DURATION_MS,
  captureTradeMarketCardOriginExpand,
  clearTradeMarketCardOriginExpand,
  clearTradeMarketCardOriginExpandIfGeneration,
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
      querySelector: () => null,
      cloneNode: () => {
        const nodes: Array<{ removeAttribute?: (name: string) => void; remove?: () => void }> = [];
        return {
          querySelectorAll: (selector: string) => {
            if (selector.includes("button")) return [{ remove: vi.fn() }];
            return nodes;
          },
          setAttribute: vi.fn(),
          classList: { add: vi.fn() },
          outerHTML: `<a href="/post/listing-a"><img src="https://example.com/a.jpg"><p>Toyota Wigo</p></a>`,
        };
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
    expect(origin?.rect).toEqual({ x: 100, y: 200, width: 80, height: 120 });
    expect(hasActiveTradeMarketCardOriginForPostId("listing-a")).toBe(true);
    expect(hasActiveTradeMarketCardOriginForPostId("other")).toBe(false);
    expect(peekTradeMarketCardOriginExpand()?.imageUrl).toContain("a.jpg");
    expect(peekTradeMarketCardOriginExpand()?.snapshotHtml).toContain("Toyota Wigo");
    expect(peekTradeMarketCardOriginExpand()?.snapshotHtml).not.toContain("<button");
  });

  it("exposes 360ms duration SSOT", () => {
    expect(CARD_ORIGIN_EXPAND_DURATION_MS).toBe(360);
  });

  it("generation-scoped clear does not wipe a newer tap", () => {
    const el = {
      getBoundingClientRect: () => ({ left: 10, top: 20, width: 100, height: 100, right: 110, bottom: 120 }),
    } as unknown as HTMLElement;
    vi.stubGlobal("innerWidth", 390);
    vi.stubGlobal("innerHeight", 844);
    const first = captureTradeMarketCardOriginExpand({ listingId: "a", cardEl: el });
    const second = captureTradeMarketCardOriginExpand({ listingId: "b", cardEl: el });
    expect(second?.generation).not.toBe(first?.generation);
    clearTradeMarketCardOriginExpandIfGeneration("a", first!.generation);
    expect(peekTradeMarketCardOriginExpand()?.listingId).toBe("b");
  });

  it("computes expand transform from card center toward viewport", () => {
    const t = tradeMarketCardOriginExpandTransform({
      listingId: "x",
      generation: 1,
      rect: { x: 0, y: 0, width: 100, height: 200 },
      viewport: { width: 400, height: 800 },
      imageUrl: null,
      snapshotHtml: null,
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
      generation: 1,
      rect: { x: 20, y: 40, width: 160, height: 200 },
      viewport: { width: 390, height: 844 },
      imageUrl: null,
      snapshotHtml: null,
      capturedAt: Date.now(),
    });
    const lower = tradeMarketCardOriginExpandTransform({
      listingId: "l",
      generation: 2,
      rect: { x: 200, y: 520, width: 160, height: 200 },
      viewport: { width: 390, height: 844 },
      imageUrl: null,
      snapshotHtml: null,
      capturedAt: Date.now(),
    });
    expect(upper.translateY).not.toEqual(lower.translateY);
    expect(upper.translateX).not.toEqual(lower.translateX);
  });
});
