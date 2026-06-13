import { afterEach, describe, expect, it, vi } from "vitest";
import {
  getCapacitorNativeDiagnostics,
  ensureCapacitorNativeMarkerOnBoot,
  isCapacitorBridgeReady,
  isCapacitorNativePlatform,
  isOAuthNativeLaunchAvailable,
  isOAuthNativeLaunchShell,
  shouldRegisterCapacitorOAuthReturnListener,
  waitForCapacitorBridgeReady,
} from "@/lib/platform/capacitor-native";

describe("capacitor-native", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("does not treat dibay_app marker alone as native platform", () => {
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

    expect(isCapacitorNativePlatform()).toBe(false);
    expect(isOAuthNativeLaunchShell()).toBe(true);
    expect(storage.get("dibay_app")).toBe("android");
    expect(cookie).toContain("dibay_app=android");
  });

  it("treats dibay_app marker alone as OAuth launch shell", () => {
    vi.stubGlobal("window", {
      location: { href: "https://samarket.vercel.app/login" },
      sessionStorage: {
        getItem: (key: string) => (key === "dibay_app" ? "android" : null),
      },
    });
    vi.stubGlobal("document", { cookie: "" });

    expect(isCapacitorNativePlatform()).toBe(false);
    expect(isOAuthNativeLaunchShell()).toBe(true);
  });

  it("detects persisted Android app marker from cookie for launch shell", () => {
    vi.stubGlobal("window", {
      location: { href: "https://samarket.vercel.app/login" },
      sessionStorage: {
        getItem: () => null,
      },
    });
    vi.stubGlobal("document", { cookie: "other=1; dibay_app=android" });

    expect(isCapacitorNativePlatform()).toBe(false);
    expect(isOAuthNativeLaunchShell()).toBe(true);
  });

  it("detects iOS app marker for launch shell", () => {
    vi.stubGlobal("window", {
      location: { href: "https://samarket.vercel.app/login?dibay_app=ios" },
      sessionStorage: {
        getItem: () => null,
        setItem: () => undefined,
      },
    });
    vi.stubGlobal("document", { cookie: "" });

    expect(isCapacitorNativePlatform()).toBe(false);
    expect(isOAuthNativeLaunchShell()).toBe(true);
  });

  it("ensureCapacitorNativeMarkerOnBoot persists marker from getPlatform android", () => {
    const storage = new Map<string, string>();
    let cookie = "";
    vi.stubGlobal("window", {
      location: { href: "https://samarket.vercel.app/market" },
      sessionStorage: {
        getItem: (key: string) => storage.get(key) ?? null,
        setItem: (key: string, value: string) => {
          storage.set(key, value);
        },
      },
      Capacitor: { isNativePlatform: () => true, getPlatform: () => "android" },
    });
    vi.stubGlobal("document", {
      get cookie() {
        return cookie;
      },
      set cookie(value: string) {
        cookie = value;
      },
    });

    expect(ensureCapacitorNativeMarkerOnBoot()).toBe("android");
    expect(isCapacitorNativePlatform()).toBe(true);
    expect(storage.get("dibay_app")).toBe("android");
  });

  it("returns false on plain web", () => {
    vi.stubGlobal("window", {});
    expect(isCapacitorNativePlatform()).toBe(false);
    expect(isOAuthNativeLaunchShell()).toBe(false);
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
    expect(isCapacitorBridgeReady()).toBe(true);
    expect(shouldRegisterCapacitorOAuthReturnListener()).toBe(true);
  });

  it("detects OAuth launch availability from plugin headers", () => {
    vi.stubGlobal("window", {
      Capacitor: {
        getPlatform: () => "web",
        PluginHeaders: [{ name: "NativeOAuthLauncher", methods: [{ name: "open", rtype: "promise" }] }],
      },
    });
    expect(isOAuthNativeLaunchAvailable()).toBe(true);
    expect(isCapacitorBridgeReady()).toBe(false);
  });

  it("returns immediately when androidBridge is already present", async () => {
    vi.stubGlobal("window", {
      location: { href: "https://samarket.vercel.app/auth/oauth/launch" },
      androidBridge: {},
    });

    await expect(waitForCapacitorBridgeReady({ timeoutMs: 100, intervalMs: 10 })).resolves.toBe(true);
  });

  it("exposes diagnostics snapshot", () => {
    vi.stubGlobal("window", {
      location: { href: "https://samarket.vercel.app/auth/oauth/launch" },
      androidBridge: {},
      Capacitor: {
        isNativePlatform: () => true,
        getPlatform: () => "android",
        nativePromise: () => Promise.resolve(),
        PluginHeaders: [{ name: "NativeOAuthLauncher", methods: [{ name: "open", rtype: "promise" }] }],
      },
    });
    expect(getCapacitorNativeDiagnostics()).toMatchObject({
      hasCapacitor: true,
      isNativePlatform: true,
      platform: "android",
      hasAndroidBridge: true,
      hasNativeOAuthLauncherPluginHeader: true,
      hasCapacitorNativePromise: true,
      bridgeReady: true,
      oauthNativeLaunchAvailable: true,
      dibayAppPlatformMarker: null,
      detectedNative: true,
      oauthLaunchShell: true,
    });
  });

  it("does not register listener on explicit web platform without bridge", () => {
    vi.stubGlobal("window", {
      Capacitor: { isNativePlatform: () => false, getPlatform: () => "web" },
    });
    expect(shouldRegisterCapacitorOAuthReturnListener()).toBe(false);
  });
});
