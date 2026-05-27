import { describe, expect, it } from "vitest";
import {
  fabScrollHasSettled,
  fabScrollShouldRevealAtTop,
  resolveBottomNavScrollChromeAction,
  resolveFabScrollChromeAction,
} from "@/lib/layout/main-bottom-nav-fab-scroll-signal";

describe("main-bottom-nav-fab-scroll-signal", () => {
  it("resolveBottomNavScrollChromeAction — 아래 숨김·위 즉시 표시", () => {
    expect(resolveBottomNavScrollChromeAction(0, 0)).toBe("reveal");
    expect(resolveBottomNavScrollChromeAction(100, 104)).toBe("hide");
    expect(resolveBottomNavScrollChromeAction(100, 96)).toBe("reveal");
    expect(resolveBottomNavScrollChromeAction(100, 102)).toBe("hold");
  });

  it("resolveFabScrollChromeAction — 아래·위 모두 접힘", () => {
    expect(resolveFabScrollChromeAction(0, 0)).toBe("reveal");
    expect(resolveFabScrollChromeAction(100, 104)).toBe("hide");
    expect(resolveFabScrollChromeAction(100, 96)).toBe("hide");
    expect(resolveFabScrollChromeAction(100, 99)).toBe("hold");
  });

  it("fabScrollShouldRevealAtTop", () => {
    expect(fabScrollShouldRevealAtTop(0)).toBe(true);
    expect(fabScrollShouldRevealAtTop(8)).toBe(false);
  });

  it("fabScrollHasSettled", () => {
    expect(fabScrollHasSettled(200, 203)).toBe(true);
    expect(fabScrollHasSettled(200, 210)).toBe(false);
  });
});
