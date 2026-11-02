import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  buildTradeMarketListScrollRouteKey,
  isTradeMarketListScrollRoute,
  peekTradeMarketSelectedListing,
  prepareTradeMarketListToDetailNavigation,
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

  it("목록 → 상세: 방금 본 카드만 기억하고 스크롤 위치는 저장하지 않는다 (스크롤 SSOT 2026-11-03)", () => {
    const key = "/market?lgu=pasig";
    prepareTradeMarketListToDetailNavigation({ routeKey: key, postId: "p1" });
    expect(peekTradeMarketSelectedListing(key)).toBe("p1");
    expect(sessionStorage.getItem(`samarket:trade-market-list-scroll:v1:${key}`)).toBeNull();
  });
});
