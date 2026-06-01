import { describe, expect, it } from "vitest";
import {
  fabScrollHasSettled,
  fabScrollShouldRevealAtTop,
  resolveBottomNavScrollChromeAction,
  resolveFabScrollChromeAction,
} from "@/lib/layout/main-bottom-nav-fab-scroll-signal";

describe("main-bottom-nav-fab-scroll-signal", () => {
  it("resolveBottomNavScrollChromeAction — 작은 흔들림은 hold, 충분한 이동만 토글", () => {
    expect(resolveBottomNavScrollChromeAction(0, 0)).toBe("reveal");
    expect(resolveBottomNavScrollChromeAction(100, 113)).toBe("hide");
    expect(resolveBottomNavScrollChromeAction(100, 87)).toBe("reveal");
    expect(resolveBottomNavScrollChromeAction(100, 104)).toBe("hold");
  });

  it("resolveFabScrollChromeAction — 아래·위 모두 접힘", () => {
    expect(resolveFabScrollChromeAction(0, 0)).toBe("reveal");
    expect(resolveFabScrollChromeAction(100, 113)).toBe("hide");
    expect(resolveFabScrollChromeAction(100, 87)).toBe("hide");
    expect(resolveFabScrollChromeAction(100, 99)).toBe("hold");
  });

  it("fabScrollShouldRevealAtTop", () => {
    expect(fabScrollShouldRevealAtTop(0)).toBe(true);
    expect(fabScrollShouldRevealAtTop(16)).toBe(false);
  });

  it("fabScrollHasSettled", () => {
    expect(fabScrollHasSettled(200, 210)).toBe(true);
    expect(fabScrollHasSettled(200, 213)).toBe(false);
  });
});
