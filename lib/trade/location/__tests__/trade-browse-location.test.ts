import { describe, expect, it } from "vitest";
import {
  cloneTradeBrowseLocation,
  tradeBrowseLocationEquals,
  tradeBrowseLocationFromScope,
  tradeBrowseLocationToScope,
} from "@/lib/trade/location/trade-browse-location";
import { parseTradeLocationScopeFromSearchParams } from "@/lib/trade/location/trade-location-scope";
import { TRADE_LEGACY_PRODUCT_ALIAS_TO_CANONICAL } from "@/lib/trade/location/national/legacy-product-alias-canonical";

describe("tradeBrowseLocation draft/committed bridge", () => {
  it("URL ALL → browse all", () => {
    const scope = parseTradeLocationScopeFromSearchParams(new URLSearchParams(""));
    expect(tradeBrowseLocationFromScope(scope)).toEqual({ kind: "all" });
  });

  it("URL city → browse city with display name", () => {
    const scope = parseTradeLocationScopeFromSearchParams(
      new URLSearchParams("location=city&lgu=pasig")
    );
    const browse = tradeBrowseLocationFromScope(scope, "Pasig City");
    expect(browse).toEqual({
      kind: "city",
      canonicalId: TRADE_LEGACY_PRODUCT_ALIAS_TO_CANONICAL.pasig,
      displayName: "Pasig City",
    });
    const back = tradeBrowseLocationToScope(browse);
    expect(back.mode).toBe("city");
    if (back.mode === "city") {
      expect(back.canonicalId).toBe(TRADE_LEGACY_PRODUCT_ALIAS_TO_CANONICAL.pasig);
    }
  });

  it("clone is independent", () => {
    const a: ReturnType<typeof tradeBrowseLocationFromScope> = {
      kind: "city",
      canonicalId: "1381200000",
      displayName: "Pasig City",
      lat: 1,
      lng: 2,
    };
    const b = cloneTradeBrowseLocation(a);
    expect(tradeBrowseLocationEquals(a, b)).toBe(true);
    if (b.kind === "city") b.displayName = "Other";
    expect(tradeBrowseLocationEquals(a, b)).toBe(false);
  });

  it("all and city are not equal", () => {
    expect(
      tradeBrowseLocationEquals({ kind: "all" }, {
        kind: "city",
        canonicalId: "1381200000",
        displayName: "Pasig City",
      })
    ).toBe(false);
  });
});
