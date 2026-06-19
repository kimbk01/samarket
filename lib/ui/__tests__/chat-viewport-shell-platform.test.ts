import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import {
  isChatViewportAndroidPlatform,
  isChatViewportIosPlatform,
  resolveChatBottomInsetCssPx,
  resolveChatShellKeyboardOverlayCssPx,
  resolveChatViewportShellClassNames,
  resolveChatViewportShellPlatform,
} from "@/lib/ui/chat-viewport-shell-platform";

describe("chat-viewport-shell-platform", () => {
  const originalVv = globalThis.visualViewport;

  beforeEach(() => {
    vi.stubGlobal("navigator", {
      userAgent: "Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36",
      platform: "Linux armv8l",
      maxTouchPoints: 5,
    });
    vi.stubGlobal("window", {
      innerHeight: 800,
      visualViewport: {
        height: 800,
        offsetTop: 0,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      },
      samarketShell: undefined,
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    if (originalVv !== undefined) {
      Object.defineProperty(globalThis, "visualViewport", {
        value: originalVv,
        configurable: true,
      });
    }
  });

  it("detects android platform from user agent", () => {
    expect(isChatViewportAndroidPlatform()).toBe(true);
    expect(isChatViewportIosPlatform()).toBe(false);
    expect(resolveChatViewportShellPlatform()).toBe("android");
  });

  it("detects ios platform from iPhone user agent", () => {
    vi.stubGlobal("navigator", {
      userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)",
      platform: "iPhone",
      maxTouchPoints: 5,
    });
    expect(isChatViewportIosPlatform()).toBe(true);
    expect(resolveChatViewportShellPlatform()).toBe("ios");
  });

  it("returns zero keyboard overlay when viewport already resized", () => {
    expect(resolveChatShellKeyboardOverlayCssPx()).toBe(0);
  });

  it("returns keyboard overlay when gap exceeds threshold", () => {
    vi.stubGlobal("window", {
      innerHeight: 800,
      visualViewport: { height: 500, offsetTop: 0 },
      samarketShell: undefined,
    });
    expect(resolveChatShellKeyboardOverlayCssPx()).toBe(300);
  });

  it("returns bottom inset when keyboard closed and vv gap exists (Android nav bar fallback)", () => {
    vi.stubGlobal("window", {
      innerHeight: 800,
      visualViewport: { height: 752, offsetTop: 0 },
      samarketShell: undefined,
    });
    expect(resolveChatBottomInsetCssPx()).toBe(48);
    vi.stubGlobal("window", {
      innerHeight: 800,
      visualViewport: { height: 500, offsetTop: 0 },
      samarketShell: undefined,
    });
    expect(resolveChatBottomInsetCssPx()).toBe(300);
  });

  it("builds shell class names for embedded ios layout", () => {
    expect(
      resolveChatViewportShellClassNames({ layoutMode: "embedded", platform: "ios" })
    ).toBe("chat-viewport-shell chat-viewport-shell--embedded chat-viewport-shell--ios");
  });
});
