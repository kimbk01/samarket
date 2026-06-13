import { afterEach, describe, expect, it, vi } from "vitest";
import {
  getCapacitorNativeDiagnostics,
  isCapacitorNativePlatform,
  shouldRegisterCapacitorOAuthReturnListener,
} from "@/lib/platform/capacitor-native";

describe("capacitor-native", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("returns false on plain web", () => {
    vi.stubGlobal("window", {});
    expect(isCapacitorNativePlatform()).toBe(false);
    expect(shouldRegisterCapacitorOAuthReturnListener()).toBe(false);
  });

  it("detects Capacitor.isNativePlatform()", () => {
    vi.stubGlobal("window", {
      Capacitor: { isNativePlatform: () => true, getPlatform: () => "android" },
    });
    expect(isCapacitorNativePlatform()).toBe(true);
  });

  it("detects getPlatform android when isNativePlatform is false", () => {
    vi.stubGlobal("window", {
      Capacitor: { isNativePlatform: () => false, getPlatform: () => "android" },
    });
    expect(isCapacitorNativePlatform()).toBe(true);
  });

  it("detects androidBridge when Capacitor methods fail", () => {
    vi.stubGlobal("window", {
      androidBridge: {},
    });
    expect(isCapacitorNativePlatform()).toBe(true);
    expect(shouldRegisterCapacitorOAuthReturnListener()).toBe(true);
  });

  it("exposes diagnostics snapshot", () => {
    vi.stubGlobal("window", {
      androidBridge: {},
      Capacitor: { isNativePlatform: () => true, getPlatform: () => "android" },
    });
    expect(getCapacitorNativeDiagnostics()).toMatchObject({
      hasCapacitor: true,
      isNativePlatform: true,
      platform: "android",
      hasAndroidBridge: true,
      detectedNative: true,
    });
  });

  it("does not register listener on explicit web platform without bridge", () => {
    vi.stubGlobal("window", {
      Capacitor: { isNativePlatform: () => false, getPlatform: () => "web" },
    });
    expect(shouldRegisterCapacitorOAuthReturnListener()).toBe(false);
  });
});
