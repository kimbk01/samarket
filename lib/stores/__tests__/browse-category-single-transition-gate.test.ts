import { describe, expect, it } from "vitest";
import { shouldDeferBrowseListUntilOriginReady } from "@/lib/stores/browse-list-user-origin-coords";
import { readFileSync } from "node:fs";

describe("browse list origin gate — one category intent → one list fetch", () => {
  it("defers list until origin resolve when distance coords enabled", () => {
    expect(
      shouldDeferBrowseListUntilOriginReady({
        distanceCoordsEnabled: true,
        originResolveCompleted: false,
      })
    ).toBe(true);
    expect(
      shouldDeferBrowseListUntilOriginReady({
        distanceCoordsEnabled: true,
        originResolveCompleted: true,
      })
    ).toBe(false);
  });

  it("does not defer when distance coords disabled", () => {
    expect(
      shouldDeferBrowseListUntilOriginReady({
        distanceCoordsEnabled: false,
        originResolveCompleted: false,
      })
    ).toBe(false);
  });

  it("StoresBrowsePrimaryView gates load on origin settle", () => {
    const src = readFileSync("components/stores/browse/StoresBrowsePrimaryView.tsx", "utf8");
    expect(src).toContain("shouldDeferBrowseListUntilOriginReady");
    expect(src).toContain("browseOriginResolveCompleted");
    expect(src).toContain("setBrowseOriginResolveCompleted(true)");
  });

  it("browse page does not paint Suspense MainFeedRouteLoading over soft shell", () => {
    const src = readFileSync("app/(main)/stores/browse/[primary]/page.tsx", "utf8");
    expect(src).toContain("fallback={null}");
    expect(src).not.toContain("MainFeedRouteLoading");
  });

  it("category surface transition has a single app-wide owner (Bridge), not Shell duplicate", () => {
    const shell = readFileSync(
      "components/delivery/presentation/DeliveryPresentationShell.tsx",
      "utf8"
    );
    const bridge = readFileSync("components/stores/StoresCategoryLifecycleBridge.tsx", "utf8");
    expect(bridge).toMatch(/applyStoresCategorySurfaceTransition\s*\(/);
    expect(shell).not.toMatch(/applyStoresCategorySurfaceTransition\s*\(/);
  });

  it("sub-topic chips do not duplicate useBrowseSubAllCanonicalUrl (PrimaryView owns it)", () => {
    const chips = readFileSync(
      "components/stores/browse/StoresBrowseHeaderSubTopicChips.tsx",
      "utf8"
    );
    const view = readFileSync("components/stores/browse/StoresBrowsePrimaryView.tsx", "utf8");
    expect(view).toContain("useBrowseSubAllCanonicalUrl");
    expect(chips).not.toContain("useBrowseSubAllCanonicalUrl");
  });
});
