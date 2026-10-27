import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = resolve(__dirname, "../../../..");

function read(rel: string): string {
  return readFileSync(resolve(root, rel), "utf8");
}

describe("trade browse location — 📍 시트 하나 (거래 D, Owner 2026-10-28)", () => {
  it("위치 화면 3장 대신 시트 하나 — 옛 주소는 /market?locSheet=1", () => {
    for (const rel of [
      "app/(main)/market/location/page.tsx",
      "app/(main)/market/location/distance/page.tsx",
      "app/(main)/market/location/search/page.tsx",
      "components/trade/location/TradeBrowseLocationMainPage.tsx",
      "components/trade/location/TradeBrowseLocationDistancePage.tsx",
    ]) {
      expect(() => read(rel), rel).toThrow();
    }
    const sheet = read("components/trade/location/TradeBrowseLocationSheet.tsx");
    expect(sheet).toContain("DibayBottomSheet");
    expect(sheet).toContain("TradeLocationNationalPicker");
    expect(sheet).toContain("trade_location_search_my_location");
    expect(sheet).toContain("trade_location_my_region");
    expect(sheet).toContain("useTradeRadiusOptionsKm");
    const config = read("next.config.js");
    expect(config).toContain('source: "/market/location"');
    expect(config).toContain('destination: "/market?locSheet=1"');
  });

  it("header pin opens the sheet (no page push)", () => {
    const pin = read("components/trade/TradeHeaderLocationPinButton.tsx");
    expect(pin).toContain("TradeBrowseLocationSheet");
    expect(pin).toContain("TRADE_LOCATION_SHEET_OPEN_EVENT");
    expect(pin).toContain("TRADE_LOCATION_SHEET_QUERY_PARAM");
    expect(pin).not.toContain("router.push");
  });

  it("filter sheet has no region/distance section — location stays as committed", () => {
    const filter = read("components/trade/MarketFilterSheet.tsx");
    expect(filter).not.toContain('router.push(q ? `/market/location?${q}` : "/market/location")');
    expect(filter).not.toContain('{ value: 64, label: "64km" }');
    expect(filter).toContain('regionMode: committedScope.mode === "all" ? "all" : "commit"');
  });

  it("location paths excluded from trade floating hub surface", () => {
    const rules = read("lib/layout/mobile-top-tier1-rules.ts");
    expect(rules).toContain('/market/location"');
    expect(rules).toContain("isTradeBrowseLocation");
  });

  it("distance sheet title catalog is 거리 설정", () => {
    const src = read("lib/i18n/catalog/trade-location-scope.ts");
    expect(src).toContain('trade_location_distance_title: "거리 설정"');
    expect(src).toContain('trade_location_distance_title: "Set distance"');
  });

  it("MapPicker centerChrome defaults to hint for non-browse callers", () => {
    const src = read("components/map/MapPicker.tsx");
    expect(src).toContain('centerChrome = "hint"');
    expect(src).toContain('centerChrome?: "hint" | "none"');
  });
});
