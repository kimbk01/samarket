import { afterEach, describe, expect, it, vi } from "vitest";
import { resolveLayoutVisibleViewportCssPx } from "@/lib/ui/layout-visible-viewport-px";

describe("resolveLayoutVisibleViewportCssPx", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("uses visualViewport offsetTop + height on WebKit", () => {
    vi.stubGlobal("window", {
      innerHeight: 900,
      visualViewport: { offsetTop: 12, height: 700 },
    });
    vi.stubGlobal("navigator", {
      userAgent: "iPhone",
      platform: "iPhone",
      maxTouchPoints: 5,
    });

    expect(resolveLayoutVisibleViewportCssPx(240)).toBe(712);
  });

  it("respects minimum height", () => {
    vi.stubGlobal("window", {
      innerHeight: 200,
      visualViewport: { offsetTop: 0, height: 180 },
    });
    vi.stubGlobal("navigator", {
      userAgent: "Linux",
      platform: "Linux",
      maxTouchPoints: 0,
    });

    expect(resolveLayoutVisibleViewportCssPx(240)).toBe(240);
  });

  it("does not subtract native keyboard from layout height", () => {
    vi.stubGlobal("window", {
      innerHeight: 800,
      visualViewport: { offsetTop: 0, height: 800 },
      samarketShell: { keyboardBottomInsetCssPx: 300 },
    });
    vi.stubGlobal("navigator", {
      userAgent: "Linux",
      platform: "Linux",
      maxTouchPoints: 0,
    });

    expect(resolveLayoutVisibleViewportCssPx(240)).toBe(800);
  });
});
