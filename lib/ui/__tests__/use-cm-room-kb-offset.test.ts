import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { resolveIosKeyboardOverlayCssPx } from "@/lib/ui/use-cm-room-kb-offset";

describe("use-cm-room-kb-offset", () => {
  beforeEach(() => {
    vi.stubGlobal("navigator", {
      userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)",
      platform: "iPhone",
      maxTouchPoints: 5,
    });
    vi.stubGlobal("window", {
      innerHeight: 800,
      visualViewport: {
        height: 500,
        offsetTop: 0,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      },
      samarketShell: undefined,
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("returns keyboard overlay gap from visualViewport on iOS", () => {
    expect(resolveIosKeyboardOverlayCssPx()).toBe(300);
  });

  it("returns zero when viewport is full height", () => {
    vi.stubGlobal("window", {
      innerHeight: 800,
      visualViewport: { height: 800, offsetTop: 0 },
      samarketShell: undefined,
    });
    expect(resolveIosKeyboardOverlayCssPx()).toBe(0);
  });

  it("prefers native shell inset when provided", () => {
    vi.stubGlobal("window", {
      innerHeight: 800,
      visualViewport: { height: 800, offsetTop: 0 },
      samarketShell: { keyboardBottomInsetCssPx: 280 },
    });
    expect(resolveIosKeyboardOverlayCssPx()).toBe(280);
  });
});
