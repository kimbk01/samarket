import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  buildTradeMarketListScrollRouteKey,
  isTradeMarketListScrollRoute,
  saveTradeMarketListScroll,
} from "@/lib/trade/location/trade-market-list-scroll-restore";

/** Vitest `environment: "node"` — stub sessionStorage (CI has no browser Storage). */
function installSessionStorageStub() {
  const map = new Map<string, string>();
  const storage = {
    getItem: (k: string) => (map.has(k) ? map.get(k)! : null),
    setItem: (k: string, v: string) => {
      map.set(k, String(v));
    },
    removeItem: (k: string) => {
      map.delete(k);
    },
    clear: () => {
      map.clear();
    },
    key: (i: number) => Array.from(map.keys())[i] ?? null,
    get length() {
      return map.size;
    },
  };
  vi.stubGlobal("sessionStorage", storage);
  return storage;
}

describe("trade market list scroll restore", () => {
  beforeEach(() => {
    installSessionStorageStub();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("route key includes search", () => {
    expect(buildTradeMarketListScrollRouteKey("/market", "lgu=pasig")).toBe(
      "/market?lgu=pasig"
    );
  });

  it("accepts /market and category slug; rejects location/sell", () => {
    expect(isTradeMarketListScrollRoute("/market")).toBe(true);
    expect(isTradeMarketListScrollRoute("/market?category=x")).toBe(true);
    expect(isTradeMarketListScrollRoute("/market/location")).toBe(false);
    expect(isTradeMarketListScrollRoute("/market/sell")).toBe(false);
  });

  it("save writes scroll payload for route key", () => {
    const key = "/market?lgu=pasig";
    saveTradeMarketListScroll(key, 640);
    const raw = sessionStorage.getItem(`samarket:trade-market-list-scroll:v1:${key}`);
    expect(raw).toBeTruthy();
    expect(JSON.parse(raw!).y).toBe(640);
  });
});
