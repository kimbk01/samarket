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
});
