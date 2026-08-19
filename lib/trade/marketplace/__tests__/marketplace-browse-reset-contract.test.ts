import { describe, expect, it } from "vitest";
import {
  MARKET_BROWSE_RESET_PARAMS,
  stripMarketBrowseResetSearchParamsForTests as stripMarketBrowseResetSearchParams,
} from "@/lib/trade/location/trade-marketplace-master-address-reset";

describe("marketplace browse reset SSOT", () => {
  it("MARKET_BROWSE_RESET_PARAMS includes q", () => {
    expect(MARKET_BROWSE_RESET_PARAMS).toContain("q");
  });

  it("strip removes q and proven browse params", () => {
    const sp = stripMarketBrowseResetSearchParams(
      "q=samsung&category=used-car&tradeState=active&page=2&filters[color]=red"
    );
    expect(sp.get("q")).toBeNull();
    expect(sp.get("category")).toBeNull();
    expect(sp.get("tradeState")).toBeNull();
    expect(sp.get("page")).toBeNull();
    expect(sp.get("filters[color]")).toBeNull();
  });
});
