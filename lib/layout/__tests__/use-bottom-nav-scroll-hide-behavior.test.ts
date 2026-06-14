import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  resolveBottomNavScrollChromeAction,
  FAB_SCROLL_MOVE_THRESHOLD_PX,
} from "@/lib/layout/main-bottom-nav-fab-scroll-signal";
import { resolveBottomNavScrollHideEnabled } from "@/lib/layout/use-bottom-nav-scroll-hide-behavior";

describe("use-bottom-nav-scroll-hide-behavior", () => {
  it("enables hide on trade market home and category slug paths", () => {
    expect(resolveBottomNavScrollHideEnabled("/market", false)).toBe(true);
    expect(resolveBottomNavScrollHideEnabled("/market/used-goods", false)).toBe(true);
  });

  it("hides when scroll Y increases from a synced baseline (browse parity)", () => {
    const lastY = 20;
    const y = lastY + FAB_SCROLL_MOVE_THRESHOLD_PX + 1;
    expect(resolveBottomNavScrollChromeAction(lastY, y)).toBe("hide");
  });

  it("does not hide when lastY is stale after route switch (previous tab scroll offset)", () => {
    const staleLastY = 480;
    const newRouteY = 80;
    expect(resolveBottomNavScrollChromeAction(staleLastY, newRouteY)).toBe("reveal");
  });

  it("observes scroll root layout for immediate hide after feed load", () => {
    const src = readFileSync(
      join(process.cwd(), "lib/layout/use-bottom-nav-scroll-hide-behavior.ts"),
      "utf8"
    );
    expect(src).toContain("getMainAppScrollTop()");
    expect(src).not.toContain("readScrollTopFromScrollTarget");
    expect(src).toContain("routeScrollKey");
    expect(src).toContain("ResizeObserver");
    expect(src).toContain("syncScrollChromeFromLayout");
    expect(src).toContain("onTargetsChanged");
  });
});
