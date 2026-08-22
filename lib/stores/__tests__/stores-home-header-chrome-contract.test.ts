import { describe, expect, it } from "vitest";
import {
  FAB_SCROLL_MOVE_THRESHOLD_PX,
  FAB_SCROLL_TOP_REVEAL_Y_PX,
  resolveStoresHomeTier1HiddenFromScrollAction,
} from "@/lib/stores/stores-home-header-scroll-chrome";
import {
  STORES_HOME_SECONDARY_COLLAPSE_BEFORE_PX,
  STORES_HOME_SECONDARY_REVEAL_AFTER_PX,
  resolveStoresHomeSecondaryRevealedFromScroll,
  resolveStoresHomeSecondarySentinelRelativeTop,
} from "@/lib/stores/stores-home-secondary-reveal-chrome";

describe("stores-home-header-scroll-chrome", () => {
  it("reveals tier1 at scroll top", () => {
    expect(resolveStoresHomeTier1HiddenFromScrollAction(true, 100, 0, true)).toBe(false);
  });

  it("hides tier1 on downward scroll past threshold", () => {
    const y = FAB_SCROLL_TOP_REVEAL_Y_PX + FAB_SCROLL_MOVE_THRESHOLD_PX + 20;
    expect(resolveStoresHomeTier1HiddenFromScrollAction(false, 0, y, true)).toBe(true);
  });

  it("holds tier1 hidden state on small scroll jitter", () => {
    expect(resolveStoresHomeTier1HiddenFromScrollAction(true, 100, 105, true)).toBe(true);
  });
});

describe("stores-home-secondary-reveal-chrome", () => {
  const sentinelTop = 120;

  it("keeps tier2 hidden at cold entry scroll top", () => {
    expect(resolveStoresHomeSecondaryRevealedFromScroll(false, 0, sentinelTop)).toBe(false);
  });

  it("reveals tier2 after scroll passes sentinel + margin", () => {
    expect(
      resolveStoresHomeSecondaryRevealedFromScroll(
        false,
        sentinelTop + STORES_HOME_SECONDARY_REVEAL_AFTER_PX + 1,
        sentinelTop
      )
    ).toBe(true);
  });

  it("collapses tier2 with hysteresis when scrolling back up", () => {
    const revealedScroll = sentinelTop + STORES_HOME_SECONDARY_REVEAL_AFTER_PX + 40;
    expect(resolveStoresHomeSecondaryRevealedFromScroll(true, revealedScroll, sentinelTop)).toBe(true);
    const nearTop = sentinelTop - STORES_HOME_SECONDARY_COLLAPSE_BEFORE_PX + 1;
    expect(resolveStoresHomeSecondaryRevealedFromScroll(true, nearTop, sentinelTop)).toBe(true);
    const collapseBelow = sentinelTop - STORES_HOME_SECONDARY_COLLAPSE_BEFORE_PX - 1;
    expect(resolveStoresHomeSecondaryRevealedFromScroll(true, collapseBelow, sentinelTop)).toBe(false);
  });

  it("sentinel relative top is invariant to header viewport shift", () => {
    const before = resolveStoresHomeSecondarySentinelRelativeTop({ top: 200 }, { top: 320 }, 16);
    const after = resolveStoresHomeSecondarySentinelRelativeTop({ top: 120 }, { top: 240 }, 16);
    expect(after).toBe(before);
  });
});
