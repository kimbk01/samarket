import { describe, expect, it } from "vitest";
import { resolveConditionalAppShellFlags } from "@/lib/layout/conditional-app-shell-flags";

describe("conditional-app-shell RegionBar dedupe", () => {
  it("hides shell RegionBar when regionBarInLayout (AppStickyHeader owns tier1)", () => {
    const withLayout = resolveConditionalAppShellFlags("/stores", true);
    const withoutLayout = resolveConditionalAppShellFlags("/stores", false);
    expect(withLayout.showRegionBar).toBe(false);
    expect(withLayout.hideRegionBar).toBe(false);
    expect(withoutLayout.showRegionBar).toBe(true);
  });

  it("hides tier1 on store detail (local chrome)", () => {
    const f = resolveConditionalAppShellFlags("/stores/my-shop", true);
    expect(f.showRegionBar).toBe(false);
    expect(f.hideRegionBar).toBe(true);
  });

  it("shows tier1 extras path on browse with layout flag", () => {
    const f = resolveConditionalAppShellFlags("/stores/browse/restaurant", true);
    expect(f.showRegionBar).toBe(false);
    expect(f.hideRegionBar).toBe(false);
  });
});
