import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = resolve(__dirname, "../../../..");

function read(rel: string): string {
  return readFileSync(resolve(root, rel), "utf8");
}

describe("trade browse location CTA / sticky CASE A contract", () => {
  it("removes trade duplicate max-h and fake MapPicker chrome on browse sheet", () => {
    const sheet = read("components/trade/TradeBrowseLocationSheet.tsx");
    expect(sheet).not.toContain("max-h-[min(90dvh,640px)]");
    expect(sheet).toContain('centerChrome="none"');
    expect(sheet).toContain("trade_location_select_here");
    expect(sheet).toContain("trade_location_map_edit_hint");
    expect(sheet).toContain("trade_location_editing");
    expect(sheet).toContain("onEditMapPan");
    expect(sheet).toContain("onConfirmMapCenter");
    // EDIT pan must not call resolve until confirm
    expect(sheet).toMatch(/onMarkerPositionChange=\{\(pos\) => \{\s*if \(!mapEdit\) return;\s*onEditMapPan\(pos\);/);
  });

  it("DibayBottomSheet uses overflow-hidden when footer exists", () => {
    const src = read("components/ui/dibay-overlay/DibayBottomSheet.tsx");
    expect(src).toContain("const hasFooter = footer != null");
    expect(src).toContain("const overflowClass = hasFooter");
    expect(src).toContain("flex flex-col overflow-hidden overscroll-contain");
    expect(src).toContain("overflow-y-auto overscroll-contain");
    expect(src).toContain('className="shrink-0"');
  });

  it("MapPicker centerChrome defaults to hint for non-browse callers", () => {
    const src = read("components/map/MapPicker.tsx");
    expect(src).toContain('centerChrome = "hint"');
    expect(src).toContain('centerChrome?: "hint" | "none"');
    expect(src).toContain('centerChrome === "hint"');
  });

  it("i18n catalog has CASE A keys in ko and en", () => {
    const src = read("lib/i18n/catalog/trade-location-scope.ts");
    for (const key of [
      "trade_location_editing",
      "trade_location_map_edit_hint",
      "trade_location_select_here",
      "trade_location_draft_pending",
    ]) {
      expect(src.split(key).length).toBeGreaterThanOrEqual(3); // ko + en + maybe type
    }
  });

  it("browse map frame resists flex collapse (shrink-0 + min height)", () => {
    const sheet = read("components/trade/TradeBrowseLocationSheet.tsx");
    expect(sheet).toContain("shrink-0");
    expect(sheet).toContain("min-h-[9rem]");
    expect(sheet).toMatch(/mapFrameClass[\s\S]*shrink-0/);
    // Map stays outside scroll; list/radius scrolls; footer sticky via DibayBottomSheet
    expect(sheet).toContain("flex min-h-0 flex-1 flex-col overflow-hidden px-4");
    expect(sheet).toContain(
      "mt-3 min-h-0 flex-1 overflow-y-auto overscroll-contain pb-[var(--overlay-space-3)]"
    );
  });

  it("trade header pin sits beside title, not in right icon cluster", () => {
    const tier1 = read("components/layout/RegionBarMainHubTier1.tsx");
    expect(tier1).toContain('placement="beside-title"');
    expect(tier1).toMatch(/hub === "trade"[\s\S]*TradeHeaderLocationPinButton placement="beside-title"/);
    const tradeRight = tier1.slice(tier1.indexOf('if (hub === "trade")'));
    const tradeRightBlock = tradeRight.slice(0, tradeRight.indexOf("if (hub === \"mypage\")"));
    expect(tradeRightBlock).toContain("TradeHeaderComposeButton");
    expect(tradeRightBlock).not.toContain("TradeHeaderLocationPinButton");
  });

  it("header pin is green and keeps suffix (전체|Nkm) untruncated", () => {
    const pin = read("components/trade/TradeHeaderLocationPinButton.tsx");
    expect(pin).toContain("buildTradeHeaderLocationHintParts");
    expect(pin).toContain("text-sam-primary");
    expect(pin).toContain("shrink-0 text-sam-primary");
    expect(pin).toContain("min-w-0 truncate");
    expect(pin).not.toMatch(/truncate text-\[11px\][\s\S]*headerHint/);
  });

  it("distance sheet title catalog is 거리 설정", () => {
    const src = read("lib/i18n/catalog/trade-location-scope.ts");
    expect(src).toContain('trade_location_distance_title: "거리 설정"');
    expect(src).toContain('trade_location_distance_title: "Set distance"');
  });
});
