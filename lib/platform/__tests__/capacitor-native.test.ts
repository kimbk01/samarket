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

  it("detects Android app marker from current URL and persists it", () => {
    const storage = new Map<string, string>();
    let cookie = "";
    vi.stubGlobal("window", {
      location: { href: "https://samarket.vercel.app/login?dibay_app=android" },
      sessionStorage: {
        getItem: (key: string) => storage.get(key) ?? null,
        setItem: (key: string, value: string) => {
          storage.set(key, value);
        },
      },
    });
    vi.stubGlobal("document", {
      get cookie() {
        return cookie;
      },
      set cookie(value: string) {
        cookie = value;
      },
    });

    expect(isCapacitorNativePlatform()).toBe(true);
    expect(storage.get("dibay_app")).toBe("android");
    expect(cookie).toContain("dibay_app=android");
  });

  it("detects persisted Android app marker from sessionStorage", () => {
    vi.stubGlobal("window", {
      location: { href: "https://samarket.vercel.app/login" },
      sessionStorage: {
        getItem: (key: string) => (key === "dibay_app" ? "android" : null),
      },
    });
    vi.stubGlobal("document", { cookie: "" });

    expect(isCapacitorNativePlatform()).toBe(true);
  });

  it("detects persisted Android app marker from cookie", () => {
    vi.stubGlobal("window", {
      location: { href: "https://samarket.vercel.app/login" },
      sessionStorage: {
        getItem: () => null,
      },
    });
    vi.stubGlobal("document", { cookie: "other=1; dibay_app=android" });

    expect(isCapacitorNativePlatform()).toBe(true);
  });

  it("detects iOS app marker for future native OAuth return support", () => {
    vi.stubGlobal("window", {
      location: { href: "https://samarket.vercel.app/login?dibay_app=ios" },
      sessionStorage: {
        getItem: () => null,
        setItem: () => undefined,
      },
    });
    vi.stubGlobal("document", { cookie: "" });

    expect(isCapacitorNativePlatform()).toBe(true);
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
      dibayAppPlatformMarker: null,
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
