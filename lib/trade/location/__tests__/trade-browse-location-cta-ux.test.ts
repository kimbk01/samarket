import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = resolve(__dirname, "../../../..");

function read(rel: string): string {
  return readFileSync(resolve(root, rel), "utf8");
}

describe("trade browse location page stack CTA / scroll contract", () => {
  it("browse location uses page routes, not DibayBottomSheet", () => {
    expect(() => read("components/trade/TradeBrowseLocationSheet.tsx")).toThrow();
    expect(read("app/(main)/market/location/page.tsx")).toContain("TradeBrowseLocationMainRoute");
    expect(read("app/(main)/market/location/distance/page.tsx")).toContain(
      "TradeBrowseLocationDistanceRoute"
    );
    expect(read("app/(main)/market/location/search/page.tsx")).toContain(
      "TradeBrowseLocationSearchRoute"
    );
  });

  it("main page keeps map/chrome outside scroll and sticky distance CTA", () => {
    const main = read("components/trade/location/TradeBrowseLocationMainPage.tsx");
    expect(main).toContain("TRADE_BROWSE_LOCATION_MAP_FRAME_CLASS");
    expect(main).toContain("overflow-y-auto");
    expect(main).toContain("trade_location_continue_distance");
    expect(main).toContain("trade_location_select_here");
    expect(main).toContain("TRADE_BROWSE_LOCATION_DISTANCE_PATH");
    expect(main).not.toContain("DibayBottomSheet");
  });

  it("distance page scrolls radius list with sticky 품목 보기", () => {
    const dist = read("components/trade/location/TradeBrowseLocationDistancePage.tsx");
    expect(dist).toContain("overflow-y-auto");
    expect(dist).toContain("trade_location_see_items");
    expect(dist).toContain("TRADE_BROWSE_LOCATION_PATH");
    expect(dist).not.toContain("DibayBottomSheet");
  });

  it("header pin seeds draft and pushes location page", () => {
    const pin = read("components/trade/TradeHeaderLocationPinButton.tsx");
    expect(pin).toContain("seedTradeBrowseLocationDraftSession");
    expect(pin).toContain("TRADE_BROWSE_LOCATION_PATH");
    expect(pin).toContain("router.push");
    expect(pin).not.toContain("TradeBrowseLocationSheet");
  });

  it("map frame is compact for phone with tablet bump", () => {
    const shell = read("components/trade/location/TradeBrowseLocationPageShell.tsx");
    expect(shell).toContain("clamp(7rem,18dvh,9rem)");
    expect(shell).toContain("md:h-[clamp(10rem,26vh,13rem)]");
    expect(shell).toContain("MAIN_BOTTOM_NAV_BODY_CLEARANCE_CLASS");
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
