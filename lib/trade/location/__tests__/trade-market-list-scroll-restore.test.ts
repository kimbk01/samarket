import { describe, expect, it } from "vitest";
import {
  buildTradeMarketListScrollRouteKey,
  isTradeMarketListScrollRoute,
  saveTradeMarketListScroll,
} from "@/lib/trade/location/trade-market-list-scroll-restore";

describe("trade market list scroll restore", () => {
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
    sessionStorage.clear();
    const key = "/market?lgu=pasig";
    saveTradeMarketListScroll(key, 640);
    const raw = sessionStorage.getItem(`samarket:trade-market-list-scroll:v1:${key}`);
    expect(raw).toBeTruthy();
    expect(JSON.parse(raw!).y).toBe(640);
  });
});
