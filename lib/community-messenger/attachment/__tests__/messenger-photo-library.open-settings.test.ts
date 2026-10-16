import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const plugin = {
  openAppSettings: vi.fn(),
  getSaveCapabilities: vi.fn(),
};

vi.mock("@/lib/platform/capacitor-native", () => ({
  isCapacitorNativePlatform: vi.fn(() => true),
  isCapacitorBridgeReady: vi.fn(() => true),
  waitForCapacitorBridgeReady: vi.fn(async () => true),
}));

vi.mock("@capacitor/core", () => ({
  Capacitor: { isPluginAvailable: () => true },
  registerPlugin: vi.fn(() => plugin),
}));

const OLD_METHODS = ["getPermissionState", "requestPermission", "getRecentPhotos", "pickPhotos", "resolvePhotos", "getSaveCapabilities", "saveImages"];
const NEW_METHODS = [...OLD_METHODS, "openAppSettings"];

function header(methods: string[]) {
  return [{ name: "MessengerPhotoLibrary", methods: methods.map((name) => ({ name, rtype: "promise" })) }];
}

function installBridge(opts: { headers: unknown; impl?: Record<string, (o: unknown) => Promise<unknown>> }) {
  const nativePromise = vi.fn((_plugin: string, method: string, options?: unknown) => {
    const fn = opts.impl?.[method];
    return fn ? fn(options) : new Promise<unknown>(() => undefined);
  });
  vi.stubGlobal("window", { Capacitor: { nativePromise, PluginHeaders: opts.headers } });
  return nativePromise;
}

async function loadModule() {
  return import("@/lib/community-messenger/attachment/messenger-photo-library");
}

describe("openMessengerAppSettings", () => {
  beforeEach(async () => {
    vi.resetModules();
    vi.useRealTimers();
    const native = await import("@/lib/platform/capacitor-native");
    vi.mocked(native.isCapacitorNativePlatform).mockReturnValue(true);
    vi.mocked(native.isCapacitorBridgeReady).mockReturnValue(true);
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it("calls native when the header lists openAppSettings and returns opened", async () => {
    const nativePromise = installBridge({
      headers: header(NEW_METHODS),
      impl: { openAppSettings: async () => ({ opened: true }) },
    });
    const { openMessengerAppSettings } = await loadModule();
    await expect(openMessengerAppSettings()).resolves.toBe(true);
    expect(nativePromise).toHaveBeenCalledWith("MessengerPhotoLibrary", "openAppSettings", {});
  });

  it("native opened:false → false", async () => {
    installBridge({ headers: header(NEW_METHODS), impl: { openAppSettings: async () => ({ opened: false }) } });
    const { openMessengerAppSettings } = await loadModule();
    await expect(openMessengerAppSettings()).resolves.toBe(false);
  });

  it("old binary (header without method) → false, native never called", async () => {
    const nativePromise = installBridge({ headers: header(OLD_METHODS) });
    const { openMessengerAppSettings } = await loadModule();
    await expect(openMessengerAppSettings()).resolves.toBe(false);
    expect(nativePromise).not.toHaveBeenCalled();
  });

  it("no headers (undecided) → false without calling native (raw call could pend forever)", async () => {
    const nativePromise = installBridge({ headers: undefined });
    const { openMessengerAppSettings } = await loadModule();
    await expect(openMessengerAppSettings()).resolves.toBe(false);
    expect(nativePromise).not.toHaveBeenCalled();
  });

  it("native that never settles → timeout → false", async () => {
    vi.useFakeTimers();
    installBridge({ headers: header(NEW_METHODS), impl: { openAppSettings: () => new Promise(() => undefined) } });
    const mod = await loadModule();
    const p = mod.openMessengerAppSettings();
    await vi.advanceTimersByTimeAsync(mod.MESSENGER_OPEN_APP_SETTINGS_TIMEOUT_MS + 10);
    await expect(p).resolves.toBe(false);
  });

  it("not native platform → false", async () => {
    const native = await import("@/lib/platform/capacitor-native");
    vi.mocked(native.isCapacitorNativePlatform).mockReturnValue(false);
    const nativePromise = installBridge({ headers: header(NEW_METHODS) });
    const { openMessengerAppSettings } = await loadModule();
    await expect(openMessengerAppSettings()).resolves.toBe(false);
    expect(nativePromise).not.toHaveBeenCalled();
  });
});

describe("getMessengerNativeSaveAlbum", () => {
  beforeEach(async () => {
    vi.resetModules();
    const native = await import("@/lib/platform/capacitor-native");
    vi.mocked(native.isCapacitorNativePlatform).mockReturnValue(true);
    vi.mocked(native.isCapacitorBridgeReady).mockReturnValue(true);
  });
  afterEach(() => vi.unstubAllGlobals());

  it("maps v2 album field", async () => {
    installBridge({ headers: header(NEW_METHODS), impl: { getSaveCapabilities: async () => ({ saveImages: true, version: 2, album: "camera_roll" }) } });
    const { getMessengerNativeSaveAlbum } = await loadModule();
    await expect(getMessengerNativeSaveAlbum()).resolves.toBe("camera_roll");
  });

  it("v1 binary without album → null", async () => {
    installBridge({ headers: header(OLD_METHODS), impl: { getSaveCapabilities: async () => ({ saveImages: true, version: 1 }) } });
    const { getMessengerNativeSaveAlbum } = await loadModule();
    await expect(getMessengerNativeSaveAlbum()).resolves.toBeNull();
  });
});

describe("native plugin source contract (openAppSettings / DIBAY album)", () => {
  it("iOS registers openAppSettings, uses readWrite status only as a check, never requests it in saveImages", async () => {
    const fs = await import("node:fs");
    const src = fs.readFileSync("ios/App/App/Plugins/MessengerPhotoLibraryPlugin.swift", "utf8");
    expect(src).toContain('CAPPluginMethod(name: "openAppSettings", returnType: CAPPluginReturnPromise)');
    expect(src).toContain("UIApplication.openSettingsURLString");
    expect(src).toContain("PHPhotoLibrary.authorizationStatus(for: .readWrite) == .authorized");
    expect(src).toContain("creationRequestForAssetCollection");
    expect(src).toContain("placeholderForCreatedAsset");
    const saveBody = src.slice(src.indexOf("@objc func saveImages"), src.indexOf("private func downloadImageData"));
    expect(saveBody).not.toContain("requestAuthorization(for: .readWrite)");
  });

  it("Android opens application details settings with NEW_TASK and reports album DIBAY", async () => {
    const fs = await import("node:fs");
    const src = fs.readFileSync("android/app/src/main/java/com/dibay/app/MessengerPhotoLibraryPlugin.java", "utf8");
    expect(src).toContain("public void openAppSettings(PluginCall call)");
    expect(src).toContain("Settings.ACTION_APPLICATION_DETAILS_SETTINGS");
    expect(src).toContain("Intent.FLAG_ACTIVITY_NEW_TASK");
    expect(src).toContain('result.put("album", SAVE_ALBUM_DIR);');
  });
});
