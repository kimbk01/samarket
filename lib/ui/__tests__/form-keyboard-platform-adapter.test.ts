import { afterEach, describe, expect, it, vi } from "vitest";
import {
  detectFormKeyboardRuntimeContext,
  resolveFormAdapterKeyboardOcclusionInsetPx,
  resolveFormKeyboardFormFactor,
  resolveFormKeyboardModel,
  resolveFormKeyboardOrientation,
} from "@/lib/ui/form-keyboard-platform-adapter";
import { resolveFormEffectiveBottomInsetPx } from "@/lib/ui/form-keyboard-viewport-contract";

describe("form-keyboard-platform-adapter HARD LOCK", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("portrait vs landscape are independent orientation labels", () => {
    expect(resolveFormKeyboardOrientation(390, 844)).toBe("portrait");
    expect(resolveFormKeyboardOrientation(844, 390)).toBe("landscape");
  });

  it("tablet form factor is not labeled as phone", () => {
    expect(resolveFormKeyboardFormFactor(390, 844)).toBe("phone");
    expect(resolveFormKeyboardFormFactor(820, 1180)).toBe("tablet");
  });

  it("never infers Android gesture vs 3-button from UA / device name", () => {
    vi.stubGlobal("navigator", {
      userAgent: "Samsung SM-M156S Android 14",
      maxTouchPoints: 5,
      platform: "Linux armv8l",
    });
    vi.stubGlobal("window", {
      innerWidth: 412,
      innerHeight: 915,
      matchMedia: () => ({ matches: true }),
      visualViewport: { offsetTop: 0, height: 915 },
      document: {
        createElement: () => ({
          style: { cssText: "" },
          remove: () => undefined,
        }),
        documentElement: { appendChild: () => undefined },
      },
    });
    // Minimal DOM for readCssSafeBottomPx — stub getComputedStyle via probe path may fail;
    // detect still must not invent gesture/3button.
    const ctx = detectFormKeyboardRuntimeContext({ safeBottomPx: 0 });
    expect(ctx.navigationMode).toBe("not_inferred");
  });

  it("desktop physical (no coarse pointer, no overlay) → keyboardModel none → occlusion 0", () => {
    vi.stubGlobal("navigator", {
      userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64)",
      maxTouchPoints: 0,
      platform: "Win32",
    });
    vi.stubGlobal("window", {
      innerWidth: 1440,
      innerHeight: 900,
      matchMedia: () => ({ matches: false }),
      visualViewport: { offsetTop: 0, height: 900 },
    });
    expect(resolveFormKeyboardModel()).toBe("none");
    const ctx = detectFormKeyboardRuntimeContext({ safeBottomPx: 0 });
    expect(ctx.keyboardModel).toBe("none");
    expect(
      resolveFormAdapterKeyboardOcclusionInsetPx(ctx, { nativeShellInsetPx: 280 })
    ).toBe(0);
    expect(
      resolveFormEffectiveBottomInsetPx({
        keyboardOpen: false,
        keyboardOcclusionInset: 0,
        safeBottom: 0,
      })
    ).toBe(0);
  });

  it("Android layout_resize aligned → adapter occlusion 0 (no double pad)", () => {
    vi.stubGlobal("navigator", {
      userAgent: "Android",
      maxTouchPoints: 5,
      platform: "Linux",
    });
    vi.stubGlobal("window", {
      innerWidth: 412,
      innerHeight: 640,
      matchMedia: () => ({ matches: true }),
      visualViewport: { offsetTop: 0, height: 640 },
    });
    const ctx = detectFormKeyboardRuntimeContext({ safeBottomPx: 48 });
    expect(ctx.keyboardModel).toBe("layout_resize");
    expect(
      resolveFormAdapterKeyboardOcclusionInsetPx(ctx, { nativeShellInsetPx: 280 })
    ).toBe(0);
  });

  it("iOS-style overlay → visual_overlay uses measured gap only (not safe+keyboard)", () => {
    vi.stubGlobal("navigator", {
      userAgent: "iPhone",
      maxTouchPoints: 5,
      platform: "iPhone",
    });
    vi.stubGlobal("window", {
      innerWidth: 390,
      innerHeight: 844,
      matchMedia: () => ({ matches: true }),
      visualViewport: { offsetTop: 0, height: 500 },
    });
    const ctx = detectFormKeyboardRuntimeContext({ safeBottomPx: 34 });
    expect(ctx.keyboardModel).toBe("visual_overlay");
    const occlusion = resolveFormAdapterKeyboardOcclusionInsetPx(ctx);
    expect(occlusion).toBe(344);
    const inset = resolveFormEffectiveBottomInsetPx({
      keyboardOpen: true,
      keyboardOcclusionInset: occlusion,
      safeBottom: 34,
    });
    expect(inset).toBe(344);
    expect(inset).not.toBe(344 + 34);
  });
});
