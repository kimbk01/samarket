import { describe, expect, it, beforeEach, afterEach, vi } from "vitest";
import {
  MARKET_CARD_MORPH_DURATION_MS,
  armTradeMarketCardMorphForward,
  armTradeMarketCardMorphBack,
  clearTradeMarketCardMorph,
  clearTradeMarketCardMorphIfGeneration,
  estimateTradeMarketDetailHeroRect,
  isTradeMarketCardMorphActiveForPostId,
  isTradeMarketCardMorphSuppressingRouteEnter,
  peekTradeMarketCardMorph,
  subscribeTradeMarketCardMorph,
  tradePostIdFromPath,
} from "@/lib/trade/marketplace/trade-market-card-morph";

async function flushMicrotasks(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
}

function stubSessionStorage(): Map<string, string> {
  const store = new Map<string, string>();
  const session = {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => {
      store.set(k, v);
    },
    removeItem: (k: string) => {
      store.delete(k);
    },
    clear: () => {
      store.clear();
    },
  };
  vi.stubGlobal("sessionStorage", session);
  return store;
}

describe("trade-market-card-morph", () => {
  beforeEach(() => {
    stubSessionStorage();
    clearTradeMarketCardMorph();
    vi.stubGlobal(
      "matchMedia",
      vi.fn().mockReturnValue({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() })
    );
  });
  afterEach(() => {
    clearTradeMarketCardMorph();
    vi.unstubAllGlobals();
  });

  it("ABSENT peek/clear do not notify (no microtask feedback loop)", async () => {
    let notifications = 0;
    let peekWhileNotifying = 0;
    const unsub = subscribeTradeMarketCardMorph(() => {
      notifications += 1;
      // Reproduce MorphHost: subscriber peeks on every notify.
      peekTradeMarketCardMorph();
      peekWhileNotifying += 1;
    });
    expect(peekTradeMarketCardMorph()).toBeNull();
    await flushMicrotasks();
    expect(notifications).toBe(0);
    expect(peekWhileNotifying).toBe(0);

    clearTradeMarketCardMorph();
    await flushMicrotasks();
    expect(notifications).toBe(0);

    // Stale storage must sanitize without notification storm.
    sessionStorage.setItem(
      "samarket:trade-market-card-morph:v2",
      JSON.stringify({
        listingId: "stale",
        generation: 1,
        direction: "forward",
        cardRect: { x: 0, y: 0, width: 100, height: 100 },
        thumbRect: null,
        contentRect: null,
        targetHeroRect: null,
        targetContentRect: null,
        viewport: { width: 390, height: 844 },
        imageUrl: null,
        priceText: "",
        titleText: "",
        locationText: "",
        listRouteKey: null,
        capturedAt: Date.now() - 60_000,
      })
    );
    expect(peekTradeMarketCardMorph()).toBeNull();
    await flushMicrotasks();
    expect(notifications).toBe(0);
    expect(sessionStorage.getItem("samarket:trade-market-card-morph:v2")).toBeNull();
    unsub();
  });

  it("capture notifies once; clear present notifies once; second clear is silent", async () => {
    let notifications = 0;
    const unsub = subscribeTradeMarketCardMorph(() => {
      notifications += 1;
    });
    const el = {
      getBoundingClientRect: () => ({ left: 10, top: 20, width: 100, height: 100, right: 110, bottom: 120 }),
      querySelector: () => null,
    } as unknown as HTMLElement;
    vi.stubGlobal("innerWidth", 390);
    vi.stubGlobal("innerHeight", 844);

    armTradeMarketCardMorphForward({ listingId: "cap-1", cardEl: el });
    await flushMicrotasks();
    expect(notifications).toBe(1);
    expect(peekTradeMarketCardMorph()?.listingId).toBe("cap-1");

    clearTradeMarketCardMorph();
    await flushMicrotasks();
    expect(notifications).toBe(2);
    expect(peekTradeMarketCardMorph()).toBeNull();

    clearTradeMarketCardMorph();
    await flushMicrotasks();
    expect(notifications).toBe(2);
    unsub();
  });

  it("tradePostIdFromPath extracts id", () => {
    expect(tradePostIdFromPath("/post/abc-1")).toBe("abc-1");
    expect(tradePostIdFromPath("/post/abc-1?x=1")).toBe("abc-1");
    expect(tradePostIdFromPath("/market")).toBeNull();
  });

  it("arms forward morph with image+content geometry and no snapshotHtml", () => {
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

    const session = armTradeMarketCardMorphForward({
      listingId: "listing-a",
      cardEl: el,
      imageUrl: "https://example.com/a.jpg",
      priceText: "₱150",
      titleText: "QA",
      locationText: "Quezon City",
      listRouteKey: "/market",
    });
    expect(session?.listingId).toBe("listing-a");
    expect(session?.direction).toBe("forward");
    expect(session?.generation).toBeGreaterThan(0);
    expect(session?.cardRect).toEqual({ x: 100, y: 200, width: 80, height: 140 });
    expect(session?.thumbRect).toEqual({ x: 100, y: 200, width: 80, height: 80 });
    expect(session?.contentRect).toEqual({ x: 100, y: 290, width: 80, height: 40 });
    expect(session?.priceText).toBe("₱150");
    expect(session).not.toHaveProperty("snapshotHtml");
    expect(isTradeMarketCardMorphActiveForPostId("listing-a")).toBe(true);
    expect(isTradeMarketCardMorphSuppressingRouteEnter()).toBe(true);
    expect(peekTradeMarketCardMorph()?.imageUrl).toContain("a.jpg");
  });

  it("exposes 360ms duration SSOT", () => {
    expect(MARKET_CARD_MORPH_DURATION_MS).toBe(360);
  });

  it("hero estimate uses thumb aspect not forced square-only", () => {
    const hero = estimateTradeMarketDetailHeroRect(
      { width: 400, height: 800 },
      { x: 0, y: 0, width: 100, height: 50 },
      true
    );
    expect(hero?.width).toBe(400);
    expect(hero?.height).toBe(200);
  });

  it("generation-scoped clear does not wipe a newer tap", () => {
    const el = {
      getBoundingClientRect: () => ({ left: 10, top: 20, width: 100, height: 100, right: 110, bottom: 120 }),
      querySelector: () => null,
    } as unknown as HTMLElement;
    vi.stubGlobal("innerWidth", 390);
    vi.stubGlobal("innerHeight", 844);
    const first = armTradeMarketCardMorphForward({ listingId: "a", cardEl: el });
    const second = armTradeMarketCardMorphForward({ listingId: "b", cardEl: el });
    expect(second?.generation).not.toBe(first?.generation);
    clearTradeMarketCardMorphIfGeneration("a", first!.generation);
    expect(peekTradeMarketCardMorph()?.listingId).toBe("b");
  });

  it("dedupes rapid re-arm of the same listing within 500ms", () => {
    const el = {
      getBoundingClientRect: () => ({ left: 10, top: 20, width: 100, height: 100, right: 110, bottom: 120 }),
      querySelector: () => null,
    } as unknown as HTMLElement;
    vi.stubGlobal("innerWidth", 390);
    vi.stubGlobal("innerHeight", 844);
    const first = armTradeMarketCardMorphForward({ listingId: "same", cardEl: el });
    const second = armTradeMarketCardMorphForward({ listingId: "same", cardEl: el });
    expect(second?.generation).toBe(first?.generation);
    expect(second).toBe(first);
  });

  it("arms back morph and suppresses route enter", () => {
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
            getBoundingClientRect: () => ({ left: 16, top: 400, width: 200, height: 28, right: 216, bottom: 428 }),
          };
        }
        return null;
      },
    } as unknown as HTMLElement;
    vi.stubGlobal("innerWidth", 390);
    vi.stubGlobal("innerHeight", 844);
    const session = armTradeMarketCardMorphBack({
      listingId: "listing-b",
      rootEl: root,
      imageUrl: "https://example.com/b.jpg",
      priceText: "₱1",
      titleText: "T",
      listRouteKey: "/market",
    });
    expect(session?.direction).toBe("back");
    expect(isTradeMarketCardMorphSuppressingRouteEnter()).toBe(true);
  });
});
