import { describe, expect, it } from "vitest";
import {
  FAB_SCROLL_MOVE_THRESHOLD_PX,
  FAB_SCROLL_TOP_REVEAL_Y_PX,
} from "@/lib/layout/main-bottom-nav-fab-scroll-signal";
import {
  resolveStoresHomeTier1HiddenFromScrollAction,
} from "@/lib/stores/stores-home-header-scroll-chrome";
import {
  STORES_HOME_SECONDARY_COLLAPSE_AFTER_PX,
  STORES_HOME_SECONDARY_REVEAL_BEFORE_PX,
  resolveStoresHomeSecondaryRevealedFromGeometry,
} from "@/lib/stores/stores-home-secondary-reveal-chrome";

describe("stores-home-header-scroll-chrome", () => {
  it("reveals tier1 at scroll top", () => {
    expect(resolveStoresHomeTier1HiddenFromScrollAction(true, 100, 0, true, false)).toBe(false);
  });

  it("hides tier1 on downward scroll past threshold", () => {
    const y = FAB_SCROLL_TOP_REVEAL_Y_PX + FAB_SCROLL_MOVE_THRESHOLD_PX + 20;
    expect(resolveStoresHomeTier1HiddenFromScrollAction(false, 0, y, true, false)).toBe(true);
  });

  it("holds tier1 hidden state on small scroll jitter", () => {
    expect(resolveStoresHomeTier1HiddenFromScrollAction(true, 100, 105, true, false)).toBe(true);
  });

  it("suspends tier1 motion while PTR gesture is active", () => {
    expect(resolveStoresHomeTier1HiddenFromScrollAction(false, 0, 200, true, true)).toBe(false);
    expect(resolveStoresHomeTier1HiddenFromScrollAction(true, 200, 0, true, true)).toBe(true);
  });
});

describe("stores-home-secondary-reveal-chrome", () => {
  const tier3Bottom = 180;

  it("keeps tier2 hidden at cold entry (content below tier3)", () => {
    expect(resolveStoresHomeSecondaryRevealedFromGeometry(false, tier3Bottom + 40, tier3Bottom)).toBe(false);
  });

  it("reveals tier2 when content start crosses tier3 bottom", () => {
    expect(
      resolveStoresHomeSecondaryRevealedFromGeometry(
        false,
        tier3Bottom - STORES_HOME_SECONDARY_REVEAL_BEFORE_PX - 1,
        tier3Bottom
      )
    ).toBe(true);
  });

  it("collapses tier2 with hysteresis when scrolling back up", () => {
    const revealedTop = tier3Bottom - STORES_HOME_SECONDARY_REVEAL_BEFORE_PX - 20;
    expect(resolveStoresHomeSecondaryRevealedFromGeometry(true, revealedTop, tier3Bottom)).toBe(true);
    const nearCollapse = tier3Bottom + STORES_HOME_SECONDARY_COLLAPSE_AFTER_PX - 1;
    expect(resolveStoresHomeSecondaryRevealedFromGeometry(true, nearCollapse, tier3Bottom)).toBe(true);
    const collapsed = tier3Bottom + STORES_HOME_SECONDARY_COLLAPSE_AFTER_PX + 1;
    expect(resolveStoresHomeSecondaryRevealedFromGeometry(true, collapsed, tier3Bottom)).toBe(false);
  });
});
